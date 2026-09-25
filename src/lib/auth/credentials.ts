/**
 * The credentials table, read and written.
 *
 * Not a server action: the reads happen in the sign-in callback, the writes in
 * `auth/actions.ts`'s own password actions, and the deletion also from
 * `accounts/actions.ts` when an account goes — each of those does its own asking about
 * who is allowed to. Kept apart from all three so there is one place that knows this
 * table exists.
 */

import { eq } from 'drizzle-orm'

import { db, hasDatabase } from '@/lib/db/client'
import { accounts, credentials } from '@/lib/db/schema'

/** The stored hash for an address, or null when there is none — or none readable. */
export async function readPasswordHash(email: string): Promise<string | null> {
  if (!hasDatabase) return null

  try {
    const rows = await db()
      .select({ hash: credentials.passwordHash })
      .from(credentials)
      .where(eq(credentials.email, email))
      .limit(1)

    return rows.length === 0 ? null : rows[0].hash
  } catch (error) {
    console.error('readPasswordHash failed', error)
    return null
  }
}

/**
 * Sets or replaces the hash for an address — **and closes every session already open on it**
 * (2026-09-25), which is what a password change is for when the reason is a stolen device or a
 * leaked password. A caller acting on the reader's own session hands that reader a fresh cookie
 * straight after (`setOwnPassword`), so only the *other* sessions end.
 */
export async function writePasswordHash(email: string, hash: string): Promise<void> {
  await db()
    .insert(credentials)
    .values({ email, passwordHash: hash })
    .onConflictDoUpdate({
      target: credentials.email,
      set: { passwordHash: hash, updatedAt: new Date() },
    })
  await revokeSessions(email)
}

/**
 * Every session on this address signed in before now stops being believed — `sessionRevoked`
 * (`revocation.ts`) and `auth()` in `src/auth.ts`. A JavaScript `Date` and not the database's
 * `now()`: the token's `signedInAt` is stamped by this same server's clock, and a Neon clock a
 * second ahead would otherwise refuse the cookie issued right after. An address with no account
 * row updates nothing, which is correct — it has no sessions to close.
 */
export async function revokeSessions(email: string): Promise<void> {
  await db().update(accounts).set({ sessionsValidAfter: new Date() }).where(eq(accounts.ownerEmail, email))
}

/**
 * Forgets the password for an address.
 *
 * Called when a password is deliberately removed, and also when the account it belongs
 * to is deleted: a hash that outlived the access it proved is a secret kept for nobody,
 * and it would also let a correct guess be told apart from a wrong one for somebody who
 * can no longer enter.
 */
export async function deletePasswordHash(email: string): Promise<void> {
  await db().delete(credentials).where(eq(credentials.email, email))
  await revokeSessions(email)
}
