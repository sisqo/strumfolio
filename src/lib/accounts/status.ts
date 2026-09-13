/**
 * Two account-status predicates the request path asks on every visit and every sign-in.
 *
 * **A plain module, not a `'use server'` export, and the move is a fix rather than tidying.**
 * They lived in `accounts/read.ts`, whose every export Next.js turns into a callable server
 * action with an id shipped in the client bundle — and `read.ts` is imported by client
 * components (`HomeScreen`, `GiftForm`), so those ids ship. Both functions
 * take a caller-supplied address and no `isOwner` gate (correctly — see each one's own note), so
 * as actions they were an unauthenticated account-existence / suspension oracle: POST an id, a
 * boolean per address, one query each, unthrottled. Their only callers are server-side
 * (`auth/session.ts` and `auth.ts`), so a plain module reaches them and nobody else. Same
 * arrangement `paddleClient.ts` uses beside `paddleCheckout.ts`.
 */

import { cache } from 'react'

import { eq } from 'drizzle-orm'

import { normalizeEmail } from '@/lib/allowlist'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'

/**
 * Whether an account row still exists for this address.
 *
 * **The question nothing on the request path used to ask.** The session cookie is a ninety-day
 * JWT and `currentUser` derives everything from it plus `ALLOWED_EMAILS` and normalization —
 * all pure, no database — so `roleOf` answered `admin` for a reader looking at the account named
 * by their own email whether or not that account existed. Deleting somebody's account removed
 * their rows and left their browser signed in, for up to ninety days, with every write still
 * permitted. `deleteMyAccount` calls `signOut` and so never showed it; `deleteAccount`, which is
 * an operator removing *somebody else's* account, cannot reach that browser at all.
 *
 * **Fails open, deliberately, in both directions.** No database configured is the normal local
 * way to work and must not lock anybody out; a database that cannot be read is a blip, and
 * answering "gone" would sign out every reader of the app at once — far worse than a deleted
 * account surviving a few more minutes. Same direction as `isAccountSuspended` below, and the
 * same reasoning `verifyTurnstile` gives for its own missing-key case.
 *
 * `cache` from React, so the several `currentUser()` calls a single request makes — the home
 * layout alone asks twice, once to render and once for its metadata — cost one query between
 * them. It is per-request memoization, not a cache with a lifetime: nothing survives the
 * response, so a deletion takes effect on the very next request.
 */
export const accountExists = cache(async (ownerEmail: string): Promise<boolean> => {
  if (!hasDatabase) return true

  try {
    const rows = await db()
      .select({ ownerEmail: accounts.ownerEmail })
      .from(accounts)
      .where(eq(accounts.ownerEmail, normalizeEmail(ownerEmail)))
      .limit(1)
    return rows.length > 0
  } catch (error) {
    console.error('accountExists failed', error)
    return true
  }
})

/**
 * Whether this address is currently suspended — a system check run on **every** sign-in
 * attempt (`auth.ts`'s `signIn` callback), not an admin action with a target an operator
 * chose, so it deliberately takes no `isOwner` gate of its own
 * (Assunzioni). False on no database, no row, or a read that
 * failed — the same fail-open direction every other read in this schema takes when it
 * cannot answer: an unreadable suspension must never lock someone out who was never
 * suspended.
 */
export async function isAccountSuspended(email: string): Promise<boolean> {
  if (!hasDatabase) return false

  try {
    const rows = await db()
      .select({ suspendedAt: accounts.suspendedAt })
      .from(accounts)
      .where(eq(accounts.ownerEmail, normalizeEmail(email)))
      .limit(1)
    return rows[0]?.suspendedAt !== null && rows[0]?.suspendedAt !== undefined
  } catch (error) {
    console.error('isAccountSuspended failed', error)
    return false
  }
}
