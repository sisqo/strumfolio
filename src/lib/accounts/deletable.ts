/**
 * Whether an account may be deleted while Paddle still has a subscription for it.
 *
 * **Not while the subscription will bill again** — decided with the owner on 2026-09-24.
 * Deleting used to remove the rows and leave the subscription running: Paddle renewed, the
 * webhook found no account and filed the event as `unmatched`, and the card went on being
 * charged every period with nothing anywhere noticing. The reader cancels in Plan & billing
 * first — the subscription then runs to the end of what they paid for — and deletes after.
 *
 * A plain module rather than part of `actions.ts`, for the reason every sibling of a
 * `'use server'` file gives: the rule has to be testable, and an export there is an endpoint.
 */

import { eq } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { paddleClient } from '@/lib/plans/paddleClient'

/** `clear` deletes; `running` and `unreadable` are the two refusals, worded apart. */
export type DeletionBlock = 'clear' | 'running' | 'unreadable'

/**
 * The rule, on what Paddle answered. A subscription bills again unless it is `canceled` or
 * already carries a scheduled cancellation — `past_due` and `paused` included, since both are
 * a relationship still open and able to charge.
 */
export function subscriptionBlocksDeletion(
  subscription: { status: string; scheduledAction: string | null } | null,
): boolean {
  if (subscription === null) return false
  if (subscription.status === 'canceled') return false
  return subscription.scheduledAction !== 'cancel'
}

/**
 * Asks Paddle about the subscription this account last had. `paddle_subscription_id` means
 * «has had one», never «has one» (see `paddleAccount.ts`), so the pointer alone decides only
 * the case with no pointer at all, which costs no call. With Paddle unconfigured nothing can
 * bill, so that deletes too. **A read that fails refuses**: without an answer there is no way
 * to say the card will not be charged again, and a deletion cannot be taken back.
 */
export async function deletionBlockFor(ownerEmail: string): Promise<DeletionBlock> {
  const [row] = await db()
    .select({ subscriptionId: accounts.paddleSubscriptionId })
    .from(accounts)
    .where(eq(accounts.ownerEmail, ownerEmail))
    .limit(1)
  if (!row?.subscriptionId) return 'clear'

  const paddle = paddleClient()
  if (paddle === null) return 'clear'

  try {
    const subscription = await paddle.subscriptions.get(row.subscriptionId)
    return subscriptionBlocksDeletion({
      status: subscription.status,
      scheduledAction: subscription.scheduledChange?.action ?? null,
    })
      ? 'running'
      : 'clear'
  } catch (error) {
    console.error('deletionBlockFor could not read the subscription', error)
    return 'unreadable'
  }
}
