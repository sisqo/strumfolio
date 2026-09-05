/**
 * Giving a newly-admitted email its own account.
 *
 * Called from `signIn` in `auth.ts`, next to `recordSignIn` — the one place a new session
 * is created, and so the one place a first sign-in can be told apart from every one after
 * it. Idempotent by checking existence rather than by distinguishing "the first" call:
 * that is what lets it run on every sign-in with no cost once the account already exists,
 * the same shape as `recordSignIn` itself.
 *
 * This runs for **every** email a provider has authenticated, not only global owners: an
 * address a global owner has already given its own account through `createAccount`
 * reaches this same function again on its own first sign-in — a no-op by then, since
 * `createAccount` already called it once (see PLAN.md, *Niente più ospiti*, point 2).
 *
 * Returns whether it actually created the account (true) or found one already there —
 * or failed (false). That bit is not for this function's own use: it is how a caller
 * tells a brand-new arrival from a no-op repeat, which is what decides whether a welcome
 * email goes out (v3.2, PLAN.md point 7). The email itself is not sent here — sending it
 * is the caller's job, so this function does not need to know Resend exists.
 */

import { and, eq, isNull } from 'drizzle-orm'

import { normalizeEmail } from '@/lib/allowlist'
import { db, hasDatabase } from '@/lib/db/client'
import { accountIdOf } from '@/lib/db/ids'
import { accounts, newsletterPrefs } from '@/lib/db/schema'
import { PLANS } from '@/lib/plans/types'
import { insertSampleSongbook } from '@/lib/songbooks/seed'

/**
 * Creates the account if it does not exist yet, and gives it the example songbook.
 *
 * The history here is a full circle and worth stating, because the shape it has landed
 * on is the third one. Until the plans arrived this cloned the songbook flagged
 * `isExampleTemplate` into every new account; that was removed because it spent the
 * account's first songbook — on the free plan its *only* one — on content nobody had
 * asked for. v3.14 answered instead with a button in the home's empty state, an
 * explicit choice by whoever had an empty account. Seeding is back on by decision
 * (2026-08-30): landing on an empty screen was judged the worse first impression of
 * the two. The cost that removed it the first time has not gone away and is accepted
 * knowingly — a free account gets its single songbook already spent, and has to delete
 * the example before making one of its own.
 *
 * What is different this time, and what keeps the earlier objection from returning
 * whole: the songs are the nine public-domain ones from `lib/songbooks/sample.ts`, a
 * real repertoire that can be played as it stands, not the v3.0 template songbook. And
 * it counts as an ordinary songbook against the plan (v3.14, point 5) rather than
 * arriving as a free extra slot, so nothing about the plans is quietly untrue.
 *
 * `isExampleTemplate` and its partial unique index stay where they are: `copySongbook`
 * is what that row is for now, and this does not read it.
 *
 * Silent no-op with no database, same as `recordSignIn`: local work from `content/` has
 * no accounts table to write. Failures are logged, not thrown — a sign-in must still
 * succeed even if provisioning trips, the same reasoning `recordSignIn` already applies.
 * Both of those paths report `false`: nothing was created, so there is nothing to send
 * a welcome email about.
 *
 * `name`, when given, is a first/last name already known for this address — Google's
 * profile (`auth.ts`), or a completed traditional registration (`verifyEmail`)
 * (`PLAN-account-name.md`). On a brand-new account it is written in the same insert as
 * `ownerEmail`. On an account that already exists it is **never** overwritten
 * unconditionally: the update below runs `WHERE first_name IS NULL`, so a Google
 * sign-in years after registration can fill a name that was never captured, but can
 * never clobber one the reader corrected by hand on `/profile`.
 *
 * `newsletterOptIn`, when given, is whether this address asked for the newsletter —
 * the registration toggle, carried through `verifyEmail`. Google sign-ins (`auth.ts`)
 * pass nothing, and the row is then written as not subscribed: they used to pass `true`
 * unconditionally (`PLAN-newsletter.md`), reversed on 2026-09-03 because a default is
 * not the consent the Privacy Policy declares as the basis for the newsletter. Unlike
 * `name` there is no opportunistic fill on an existing account: a missing
 * `newsletterPrefs` row simply reads as "not subscribed" (`loadNewsletterPrefs`),
 * nothing to backfill from here.
 */
export async function provisionAccount(
  email: string,
  name?: { firstName: string; lastName: string },
  newsletterOptIn?: boolean,
): Promise<boolean> {
  if (!hasDatabase) return false

  const ownerEmail = normalizeEmail(email)
  let created = false

  try {
    created = await db().transaction(async (tx) => {
      const existing = await tx
        .select({ ownerEmail: accounts.ownerEmail })
        .from(accounts)
        .where(eq(accounts.ownerEmail, ownerEmail))
        .limit(1)
      if (existing.length > 0) return false

      await tx.insert(accounts).values({
        ownerEmail,
        ...(name !== undefined ? { firstName: name.firstName, lastName: name.lastName } : {}),
      })
      return true
    })
  } catch (error) {
    console.error('provisionAccount failed', error)
    return false
  }

  if (!created) {
    // The opportunistic fill above: only for an address whose account already existed,
    // and only into a still-empty name — see this function's own header comment.
    if (name !== undefined) {
      try {
        await db()
          .update(accounts)
          .set({ firstName: name.firstName, lastName: name.lastName })
          .where(and(eq(accounts.ownerEmail, ownerEmail), isNull(accounts.firstName)))
      } catch (error) {
        console.error('provisionAccount could not backfill the name', error)
      }
    }
    return false
  }

  /*
   * Deliberately outside the transaction above, and deliberately swallowing its own
   * failure. An account with no example songbook is a working account — the home's
   * empty state still offers the very same songbook on a button, so the reader can
   * take it whenever they like. An account row that rolled back because a song insert
   * tripped is not: that address would sign in with nowhere to put anything, and would
   * never get the welcome email either, since this function would have to answer
   * `false` for a row it had really been asked to create.
   *
   * The cap is the free plan's rather than one resolved through `entitlementsOf`: this
   * runs inside the sign-in callback, before there is a session to resolve entitlements
   * against, and the row was inserted one statement ago on `accounts.plan`'s own
   * `default('free')` (`db/schema.ts`). If that default ever changes, this changes with
   * it — the two are the same fact written twice, which is the reason it is said here.
   */
  try {
    await insertSampleSongbook(ownerEmail, PLANS.free.songs)
  } catch (error) {
    console.error('provisionAccount could not seed the example songbook', error)
  }

  /*
   * Also outside the transaction above, and also swallowing its own failure, for the
   * same reason `insertSampleSongbook` is: an account whose `newsletterPrefs` insert
   * trips (e.g. the `0035` migration not yet applied where this deploys) is still a
   * working account, just one that reads as "not subscribed" until that row exists.
   */
  try {
    await db()
      .insert(newsletterPrefs)
      .values({
        accountId: accountIdOf(ownerEmail),
        subscribed: newsletterOptIn ?? false,
        frequency: 'monthly',
        subscribedAt: newsletterOptIn === true ? new Date() : null,
      })
  } catch (error) {
    console.error('provisionAccount could not seed the newsletter preference', error)
  }

  return true
}
