'use server'

/**
 * `/courtesy-unsubscribe`'s one write — deliberately its own file, never beside
 * `actions.ts`'s owner-gated exports.
 *
 * **No `isOwner` check, no session read at all.** The reader who calls this has no account
 * session by construction: they followed a link out of an email. The HMAC token in that link
 * *is* the authorization, verified by `verifyCourtesyUnsubscribeToken`. Putting this beside
 * `sendCourtesyThanks`/`sendCourtesyCheckin` risks a future edit adding the same owner check
 * here by habit, which would lock every reader out of their own unsubscribe link — the one
 * failure mode this file exists to make structurally impossible rather than merely avoided by
 * care.
 */

import { eq } from 'drizzle-orm'

import { normalizeEmail } from '@/lib/allowlist'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'

import { verifyCourtesyUnsubscribeToken } from './unsubscribe'

export type CourtesyUnsubscribeStatus = 'invalid' | 'already-out' | 'confirmable'

/**
 * What `/courtesy-unsubscribe`'s GET shows, before anything is written — a read, never a
 * write, so a mail scanner following this link on its own leaves the account untouched. Called
 * again after the form below submits (Next re-renders the route once a server action bound to
 * it completes), which is what turns a fresh confirmation into "already unsubscribed" with no
 * client-side state of its own.
 */
export async function courtesyUnsubscribeStatus(email: string, token: string): Promise<CourtesyUnsubscribeStatus> {
  if (!hasDatabase) return 'invalid'
  if (!verifyCourtesyUnsubscribeToken(email, token)) return 'invalid'

  try {
    const rows = await db()
      .select({ courtesyOptedOutAt: accounts.courtesyOptedOutAt })
      .from(accounts)
      .where(eq(accounts.ownerEmail, normalizeEmail(email)))
      .limit(1)

    const row = rows[0]
    if (row === undefined) return 'invalid'
    return row.courtesyOptedOutAt === null ? 'confirmable' : 'already-out'
  } catch (error) {
    console.error('courtesyUnsubscribeStatus failed', error)
    return 'invalid'
  }
}

/**
 * Confirms an unsubscribe — idempotent, so a repeated call (a person clicking twice, a mail
 * scanner retrying the same POST) changes nothing once the column is already set.
 *
 * **Returns `Promise<void>`, not a result**, the same shape `verifyEmail` (`verify/actions.ts`)
 * already uses for the same reason: this is bound directly to a `<form action={...}>`, whose
 * type only accepts `void | Promise<void>` back. There is nothing to report either way — the
 * page re-derives what happened by calling `courtesyUnsubscribeStatus` again once Next
 * re-renders the route after the action completes, rather than by reading a return value.
 */
export async function confirmCourtesyUnsubscribe(email: string, token: string): Promise<void> {
  if (!hasDatabase) return
  if (!verifyCourtesyUnsubscribeToken(email, token)) return

  const address = normalizeEmail(email)

  try {
    const rows = await db().select({ id: accounts.id, courtesyOptedOutAt: accounts.courtesyOptedOutAt }).from(accounts).where(eq(accounts.ownerEmail, address)).limit(1)
    const row = rows[0]
    if (row === undefined) return

    if (row.courtesyOptedOutAt === null) {
      await db().update(accounts).set({ courtesyOptedOutAt: new Date() }).where(eq(accounts.id, row.id))
    }
  } catch (error) {
    console.error('confirmCourtesyUnsubscribe failed', error)
  }
}
