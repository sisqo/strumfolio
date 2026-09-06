'use server'

/**
 * Turning a pending registration into a real account (v3.2) — the one
 * write in the whole `/verify` flow, and deliberately not something a page load can
 * trigger on its own. Corporate email scanners routinely "click" every link in a message
 * before a person ever sees it, to check where it goes; if that GET consumed the token,
 * the scanner would burn it and the real click would land on an error. So the page
 * (`app/(auth)/verify/page.tsx`) only ever reads — see `verify/check.ts` — and this, a real
 * POST behind an explicit "Verify my email" button, is the only thing that writes.
 */

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { provisionAccount } from '@/lib/accounts/provision'
import { normalizeEmail } from '@/lib/allowlist'
import { issueSessionCookie } from '@/lib/auth/session'
import { hashToken } from '@/lib/auth/tokens'
import { db, hasDatabase } from '@/lib/db/client'
import { credentials, pendingRegistrations } from '@/lib/db/schema'
import { sendEmail } from '@/lib/email/send'
import { welcomeEmail } from '@/lib/email/templates'
import { notifyTelegram } from '@/lib/telegram/notify'
import { registrationNotice } from '@/lib/telegram/registrationNotice'

/**
 * Bound with `email` and `token` from the page's own searchParams (`action={verifyEmail
 * .bind(null, email, token)}`), so the `<form>` itself carries no fields of its own.
 *
 * Returns nothing on failure rather than a result the caller has to render: this writes
 * nothing before the recheck below fails, so the automatic re-render every Server Action
 * triggers on the form that called it runs the page's own read-only check again — which
 * reaches the exact same "invalid or expired" branch on its own, with no error state to
 * thread back by hand. A real result only exists on success, and it is a redirect, not a
 * value: `redirect()` throws, so it must never sit inside the `try` below, or a genuine
 * success would be logged and swallowed as a failure instead of navigating anywhere.
 */
export async function verifyEmail(email: string, token: string): Promise<void> {
  if (!hasDatabase) return

  const normalized = normalizeEmail(email)

  /*
   * Carries `firstName`/`lastName`/`newsletterOptIn` back out alongside the plain
   * ok/not-ok this used to be — `provisionAccount` below needs them, and the row they
   * come from is deleted before this transaction ever returns.
   */
  let result:
    | { ok: true; firstName: string | null; lastName: string | null; newsletterOptIn: boolean }
    | { ok: false }
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
        .values({ email: normalized, passwordHash: row.passwordHash })
        .onConflictDoUpdate({
          target: credentials.email,
          set: { passwordHash: row.passwordHash, updatedAt: new Date() },
        })

      await tx.delete(pendingRegistrations).where(eq(pendingRegistrations.email, normalized))

      return { ok: true, firstName: row.firstName, lastName: row.lastName, newsletterOptIn: row.newsletterOptIn }
    })
  } catch (error) {
    console.error('verifyEmail failed', error)
    return
  }

  if (!result.ok) return

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
  const created = await provisionAccount(
    normalized,
    result.firstName !== null && result.lastName !== null
      ? { firstName: result.firstName, lastName: result.lastName }
      : undefined,
    result.newsletterOptIn,
  )

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
    await notifyTelegram('registration', registrationNotice())
  }

  /*
   * Signs the person in immediately rather than sending them back to `/login` to retype
   * the password they just chose — see `issueSessionCookie`'s own comment for why that
   * needs a hand-built cookie instead of `signIn('credentials', ...)`.
   */
  await issueSessionCookie(normalized)
  redirect('/')
}
