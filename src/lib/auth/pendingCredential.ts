/**
 * The password a registration is carrying while it waits to be confirmed.
 *
 * Read on the sign-in path and nowhere else, which is why it lives here rather than beside
 * `verify/check.ts`: that file answers «does this token still open this row», a question
 * about a link, and this one answers «is the password this person just typed the one they
 * chose at registration», a question about a login. Same table, two readers that must not
 * grow into one — `check.ts` is reachable by anybody holding a URL, and this is reachable
 * only from inside `authorize`.
 *
 * Kept out of `credentials.ts` for the same reason that file states about itself: it is the
 * one place that knows the `credentials` table exists, and `pending_registrations` is not
 * that table.
 */

import { eq } from 'drizzle-orm'

import { db, hasDatabase } from '@/lib/db/client'
import { pendingRegistrations } from '@/lib/db/schema'
import { NO_PENDING_PASSWORD } from '@/lib/verify/types'

import type { PendingCredential } from './loginAttempt'

/** The pending password and its deadline for an address, or null when there is none. */
export async function readPendingCredential(email: string): Promise<PendingCredential | null> {
  if (!hasDatabase) return null

  try {
    const rows = await db()
      .select({
        passwordHash: pendingRegistrations.passwordHash,
        expiresAt: pendingRegistrations.expiresAt,
      })
      .from(pendingRegistrations)
      .where(eq(pendingRegistrations.email, email))
      .limit(1)

    /* A registration made since passwords moved to `/verify` carries none — see
       `NO_PENDING_PASSWORD`. Treated as absent, so `/login` spends `verifyAgainstNothing` on it
       and says what it says to a stranger: there is no password here to be right about. */
    const row = rows[0]
    if (row === undefined || row.passwordHash === NO_PENDING_PASSWORD) return null
    return row
  } catch (error) {
    // Fails the way `readPasswordHash` does: unreadable is treated as absent, so a database
    // that is down refuses the sign-in rather than describing an address it could not read.
    console.error('readPendingCredential failed', error)
    return null
  }
}
