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

/**
 * `clear` deletes; the other three are refusals, worded apart. `stuck` is a subscription that
 * will bill again and that the reader cannot cancel from this app: `past_due` or `paused`, which
 * `livePaddleSubscription` refuses to act on, so «cancel it in Plan & billing» would send them
 * to a button that answers no (2026-09-24). They are told to write to us instead.
 */
export type DeletionBlock = 'clear' | 'running' | 'stuck' | 'unreadable'

type SubscriptionState = { status: string; scheduledAction: string | null }

/**
 * The rule, on what Paddle answered. A subscription bills again unless it is `canceled` or
 * already carries a scheduled cancellation — `past_due` and `paused` included, since both are
 * a relationship still open and able to charge.
 */
export function subscriptionBlocksDeletion(subscription: SubscriptionState | null): boolean {
  if (subscription === null) return false
  if (subscription.status === 'canceled') return false
  return subscription.scheduledAction !== 'cancel'
}

/** Every subscription Paddle holds for the account, reduced to one answer — the worst. */
export function deletionBlockOf(subscriptions: SubscriptionState[]): Exclude<DeletionBlock, 'unreadable'> {
  const blocking = subscriptions.filter(subscriptionBlocksDeletion)
  if (blocking.some((one) => one.status === 'past_due' || one.status === 'paused')) return 'stuck'
  return blocking.length > 0 ? 'running' : 'clear'
}

const OPEN_STATUSES = ['active', 'trialing', 'past_due', 'paused'] as const

/**
 * Asks Paddle about every subscription this account may still have. `paddle_subscription_id`
 * means «has had one», never «has one» (see `paddleAccount.ts`), and it is also only the
 * *latest*: a second subscription moves the pointer (`webhookApply.ts` alerts on it), so reading
 * the pointer alone let somebody cancel the new one, delete, and go on paying for the old. With
 * the customer id known, every open subscription of that customer is listed as well
 * (2026-09-24). No pointer and no customer costs no call; with Paddle unconfigured nothing can
 * bill, so that deletes too. **A read that fails refuses**: without an answer there is no way
 * to say the card will not be charged again, and a deletion cannot be taken back.
 */
export async function deletionBlockFor(ownerEmail: string): Promise<DeletionBlock> {
  const [row] = await db()
    .select({ subscriptionId: accounts.paddleSubscriptionId, customerId: accounts.paddleCustomerId })
    .from(accounts)
    .where(eq(accounts.ownerEmail, ownerEmail))
    .limit(1)
  if (!row?.subscriptionId && !row?.customerId) return 'clear'

  const paddle = paddleClient()
  if (paddle === null) return 'clear'

  try {
    const found = new Map<string, SubscriptionState>()
    const read = (subscription: { id: string; status: string; scheduledChange?: { action: string } | null }) =>
      found.set(subscription.id, { status: subscription.status, scheduledAction: subscription.scheduledChange?.action ?? null })

    if (row.customerId) {
      for await (const subscription of paddle.subscriptions.list({ customerId: [row.customerId], status: [...OPEN_STATUSES] })) {
        read(subscription)
      }
    }
    if (row.subscriptionId && !found.has(row.subscriptionId)) read(await paddle.subscriptions.get(row.subscriptionId))

    return deletionBlockOf([...found.values()])
  } catch (error) {
    console.error('deletionBlockFor could not read the subscription', error)
    return 'unreadable'
  }
}
