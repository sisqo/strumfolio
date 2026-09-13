/**
 * What Paddle knows this account by — the one query three callers share.
 *
 * A plain module rather than part of either `'use server'` file that needs it, for
 * `paddleClient.ts`'s reason: those may only export async *actions*, and every export of one
 * becomes an endpoint the browser can post to. A loader that answers «which subscription is
 * this account's» has no business being one of those.
 *
 * `paddleSubscriptionId` is written by the webhook and by nothing else, so a non-null value
 * here means Paddle has already told us about a subscription for this account. It is **not**
 * evidence that the subscription is still live: a cancelled one keeps its id on the row, which
 * is why every caller that is about to act on it asks Paddle for the current status rather
 * than inferring one from this.
 */

import { eq } from 'drizzle-orm'

import { currentUser } from '@/lib/auth/session'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'

export interface PaddleAccountRef {
  /** The numeric `accounts.id`, which is what a checkout stamps into `custom_data`. */
  id: number
  /** `null` when this account has never completed a Paddle checkout. */
  subscriptionId: string | null
}

/**
 * The session's account as Paddle sees it, or `null` when there is no session, no database, or
 * no row — three different absences that every caller here treats the same way, since none of
 * them is a subscription to act on.
 */
export async function paddleAccountRef(): Promise<PaddleAccountRef | null> {
  if (!hasDatabase) return null

  const user = await currentUser()
  if (user === null) return null

  const [account] = await db()
    .select({ id: accounts.id, subscriptionId: accounts.paddleSubscriptionId })
    .from(accounts)
    .where(eq(accounts.ownerEmail, user.accountOwnerEmail))
    .limit(1)

  return account ?? null
}
