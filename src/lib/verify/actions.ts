'use server'

/**
 * Turning a pending registration into a real account (v3.2) — the one
 * write in the whole `/verify` flow, and deliberately not something a page load can
 * trigger on its own. Corporate email scanners routinely "click" every link in a message
 * before a person ever sees it, to check where it goes; if that GET consumed the token,
 * the scanner would burn it and the real click would land on an error. So the page
 * (`app/(auth)/verify/page.tsx`) only ever reads — see `verify/check.ts` — and this, a real
 * POST behind an explicit button, is the only thing that writes.
 */

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { provisionAccount } from '@/lib/accounts/provision'
import { freezeLeadAttribution } from '@/lib/attribution/write'
import { normalizeEmail } from '@/lib/allowlist'
import { hashPassword } from '@/lib/auth/password'
import { issueSessionCookie } from '@/lib/auth/session'
import { recordSignIn } from '@/lib/auth/signIns'
import { hashToken } from '@/lib/auth/tokens'
import { attachCouponViewFromCookie } from '@/lib/coupons/views'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts, credentials, pendingRegistrations } from '@/lib/db/schema'
import { sendEmail } from '@/lib/email/send'
import { welcomeEmail } from '@/lib/email/templates'
import { notifyTelegram } from '@/lib/telegram/notify'
import { registrationNotice } from '@/lib/telegram/registrationNotice'

import { passwordProblem, type VerifyState } from './types'

/**
 * Bound with `email` and `token` from the page's own searchParams (`verifyEmail.bind(null,
 * email, token)`) and driven by `useActionState` in `VerifyForm`, so the form carries only
 * what the person types: the password, twice, and the newsletter switch.
 *
 * **The password is chosen here, since 2026-09-24, and not at registration** — see
 * `NO_PENDING_PASSWORD`. Whoever can open this link holds the inbox, so this is the first
 * moment a password can be taken from them without handing the account to whoever typed one
 * into `/register` first. The newsletter consent moved with it for the same reason: a
 * stranger's checkbox is not the owner's consent, so the row's value is only the default the
 * switch starts from.
 *
 * A failure is a state the form renders. Success is a redirect, not a value: `redirect()`
 * throws, so it must never sit inside the `try` below, or a genuine success would be logged
 * and swallowed as a failure instead of navigating anywhere.
 */
export async function verifyEmail(
  email: string,
  token: string,
  _previous: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  if (!hasDatabase) return { reason: 'failed' }

  const password = formData.get('password')
  const problem = passwordProblem(password, formData.get('confirmPassword'))
  if (problem !== null) return { reason: problem }
  // A checkbox sends nothing at all when unchecked, never a falsy value.
  const newsletterOptIn = formData.get('newsletterOptIn') === 'on'

  if (typeof email !== 'string' || typeof token !== 'string') return { reason: 'failed' }
  const normalized = normalizeEmail(email)

  /*
   * **The token is checked before anything is hashed.** This action needs no session, no
   * captcha and has no rate limit, so hashing first let anybody holding its id spend ~34 ms of
   * CPU and 16 MiB of scrypt per POST with an invented address and token. The same check runs
   * again inside the transaction, which is the one that counts: this read only decides whether
   * the work is worth doing.
   */
  try {
    const pending = await db()
      .select({ tokenHash: pendingRegistrations.verificationTokenHash })
      .from(pendingRegistrations)
      .where(eq(pendingRegistrations.email, normalized))
      .limit(1)
    if (pending[0] === undefined || hashToken(token) !== pending[0].tokenHash) return { reason: 'invalid-link' }
  } catch (error) {
    console.error('verifyEmail pre-check failed', error)
    return { reason: 'failed' }
  }

  /* Hashed before the transaction opens: scrypt is tens of milliseconds, and the transaction
     holds the pool's only connection (see below) for as long as it runs. */
  const passwordHash = await hashPassword(password as string)

  /*
   * Carries `firstName`/`lastName` back out alongside the plain
   * ok/not-ok this used to be — `provisionAccount` below needs them, and the row they
   * come from is deleted before this transaction ever returns.
   */
  let result: { ok: true; firstName: string | null; lastName: string | null } | { ok: false }
  try {
    result = await db().transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(pendingRegistrations)
        .where(eq(pendingRegistrations.email, normalized))
        .limit(1)

      const row = rows[0]
      if (row === undefined) return { ok: false }
      if (hashToken(token) !== row.verificationTokenHash) return { ok: false }
      if (row.expiresAt.getTime() <= Date.now()) return { ok: false }

      /*
       * **A pending registration never lands on an account that already exists.** The row
       * outlives its token — `resendVerification` renews only the token — so a stranger who
       * registered somebody's address before its owner ever did could wait for the real
       * account to appear (through Google, or an operator), press «resend», and have a genuine
       * Strumfolio email ask the owner to confirm. One click wrote the stranger's password
       * into `credentials` for the real account. So the account wins: the row is dropped and
       * nothing is written. The owner who did register twice loses nothing — they have an
       * account, and «forgot password» sets one. (The password is typed here now, so that
       * click could no longer hand over a stranger's; the rule stays because a second way into
       * an account that already exists is still not this page's to create.)
       */
      const existing = await tx
        .select({ ownerEmail: accounts.ownerEmail })
        .from(accounts)
        .where(eq(accounts.ownerEmail, normalized))
        .limit(1)
      if (existing.length > 0) {
        await tx.delete(pendingRegistrations).where(eq(pendingRegistrations.email, normalized))
        return { ok: false }
      }

      /*
       * Not `writePasswordHash` (`lib/auth/credentials.ts`): it calls `db()` on its own,
       * and `db()`'s pool holds a single connection (`max: 1`, `lib/db/client.ts`) —
       * whichever query opened *this* transaction is already holding the only one there
       * is. Calling anything that opens a second `db().transaction()` or a bare `db()`
       * query from inside this callback would not fail, it would hang forever waiting
       * for a connection this same transaction never gives back. The upsert is inlined
       * for the same reason `provisionAccount` is called after this transaction, not
       * inside it, below.
       */
      await tx
        .insert(credentials)
        .values({ email: normalized, passwordHash })
        .onConflictDoUpdate({
          target: credentials.email,
          set: { passwordHash, updatedAt: new Date() },
        })

      await tx.delete(pendingRegistrations).where(eq(pendingRegistrations.email, normalized))

      return { ok: true, firstName: row.firstName, lastName: row.lastName }
    })
  } catch (error) {
    console.error('verifyEmail failed', error)
    return { reason: 'failed' }
  }

  if (!result.ok) return { reason: 'invalid-link' }

  /*
   * Sequential, not nested in the transaction above — same single-connection reason.
   * Deliberately not preceded by an `accounts` insert of its own: this transaction never
   * wrote one, so `provisionAccount` finds none and creates it — and its `existing.length
   * > 0` check, which is what makes it a no-op for an address that already has an account,
   * would have swallowed this admission whole had a row been sitting there. That is also
   * the boolean the welcome email below is gated on. This is "identical to every other
   * admission path" for exactly that reason: nobody
   * else pre-creates the row it is there to create.
   *
   * `firstName`/`lastName` can be null here only for a registration that was already
   * pending across the deploy that added those columns (`register()` has required both,
   * non-empty, ever since) — `undefined` in that rare case lets a later Google sign-in
   * or a visit to `/profile` fill the name in instead of writing empty strings that
   * would block `provisionAccount`'s own opportunistic fill from ever running.
   */
  /* One expression, two readers: `provisionAccount` fills the account row from it and the
     notice names the person with it. Written out twice, a change to either would quietly make
     the notification disagree with the row it announces. */
  const registeredName =
    result.firstName !== null && result.lastName !== null
      ? { firstName: result.firstName, lastName: result.lastName }
      : undefined

  const created = await provisionAccount(normalized, registeredName, newsletterOptIn)

  // Gated on provisionAccount's own true/false, not assumed from the transaction above:
  // that transaction only proves no `accounts` row existed a moment ago, not that this
  // call is the one that creates it — a concurrent sign-in on the same address (Google,
  // racing this same verification) could win that insert first, or the insert itself
  // could fail and be caught inside `provisionAccount`. Either way `created` is false, and
  // there is nothing to welcome anyone to: never on an idempotent or failed call.
  if (created) {
    await sendEmail({ to: normalized, ...welcomeEmail() })
    // `auth.ts`'s own `signIn` callback fires this same event for a Google admission — this
    // path never runs through that callback at all (it signs in with `issueSessionCookie`
    // below, not `signIn`), so without this line every email/password registration was
    // invisible to "New registration" alerts while every Google one was not.
    await notifyTelegram('registration', registrationNotice(normalized, registeredName))
  }

  /*
   * The coupon this browser arrived carrying, attached to the account that now exists —
   * `coupon_views`' own funnel, and this is the half of it `auth.ts` cannot cover: a
   * traditional registration never runs through the `signIn` callback at all, because it hands
   * out its own cookie below rather than calling `signIn('credentials', …)`. Without this line
   * every email/password sign-up would be recorded as having seen nothing, exactly as every
   * one of them was invisible to the Telegram notice until that was noticed above.
   *
   * After `provisionAccount`, for `recordCouponView`'s reason: it resolves the account by
   * address, so there has to be one. Before `issueSessionCookie` only because there is nothing
   * to order them by — it reads the coupon cookie, not the session.
   */
  await attachCouponViewFromCookie(normalized)

  /*
   * Seam 2 of four: point the attribution row this address already has at the account that now
   * exists, and freeze it. Reads **no cookie**, deliberately — a verification link is very often
   * opened on a different device from the one the registration was typed on, where this
   * browser's cookie has never existed. The arrival was recorded by `register()`; all that is
   * left here is the pointer.
   *
   * After `provisionAccount`, for `attachCouponViewFromCookie`'s reason directly above: it
   * resolves the account by address, so there has to be one.
   */
  await freezeLeadAttribution(normalized)

  /*
   * Signs the person in immediately rather than sending them back to `/login` to retype
   * the password they just chose — see `issueSessionCookie`'s own comment for why that
   * needs a hand-built cookie instead of `signIn('credentials', ...)`. Which is also why the
   * sign-in is counted by hand: `auth.ts`'s `signIn` callback, where every other one is
   * recorded, never runs on this path, so a registrant showed zero sign-ins on `/accounts`
   * until they next typed their password.
   */
  await recordSignIn(normalized)
  await issueSessionCookie(normalized)
  redirect('/')
}
