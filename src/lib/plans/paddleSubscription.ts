'use server'

/**
 * Cancelling a real Paddle subscription.
 *
 * **It takes no arguments, and that is the security design rather than an omission.** The
 * documented shape for this passes a `subscriptionId` from the browser and then checks the
 * signed-in reader owns it — a check that has to be right every time it is written. Reading
 * the id from the session's own account instead removes the question: there is no id to
 * tamper with, because none is sent. The same reasoning `mockPurchase` gives for refusing to
 * take a coupon as a parameter.
 *
 * **`next_billing_period`, never `immediately`.** The reader pressed «cancel», not «cancel and
 * refund the rest»: they have paid through the end of the period and keep it, which is exactly
 * what `mockCancel` did and what `resolveSubscription` already models as
 * `pendingPlan: 'free'`. Immediate cancellation is a different product decision with a
 * proration attached, and it is deliberately not reachable from here.
 *
 * **This writes no plan columns, on purpose.** Paddle answers with the subscription still
 * `active` and a `scheduled_change` attached; the `subscription.updated` that follows is what
 * `webhookApply.ts` turns into `pendingPlan`. Writing them here too would make two writers for
 * one fact, and the webhook is the one that also has to be right for renewals, failures and
 * changes made from Paddle's own portal. The cost is a visible one: for the second or two
 * before that event lands, `/billing` still shows nothing scheduled. `revalidatePath` is what
 * makes the page pick it up without a manual reload.
 */

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { currentUser } from '@/lib/auth/session'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'

import { paddleClient } from './paddleClient'

export type PaddleCancelFailure =
  | 'not-configured'
  | 'no-database'
  | 'no-session'
  /** Nothing to cancel: this account has never completed a Paddle checkout. */
  | 'no-subscription'
  | 'failed'

export type PaddleCancelResult =
  | { ok: true; effectiveAt: string | null }
  | { ok: false; reason: PaddleCancelFailure }

export async function cancelPaddleSubscription(): Promise<PaddleCancelResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const paddle = paddleClient()
  if (paddle === null) return { ok: false, reason: 'not-configured' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  try {
    const [account] = await db()
      .select({ subscriptionId: accounts.paddleSubscriptionId })
      .from(accounts)
      .where(eq(accounts.ownerEmail, user.accountOwnerEmail))
      .limit(1)

    if (!account?.subscriptionId) return { ok: false, reason: 'no-subscription' }

    const canceled = await paddle.subscriptions.cancel(account.subscriptionId, {
      effectiveFrom: 'next_billing_period',
    })

    /* The page reads the account row, which the webhook is about to change. */
    revalidatePath('/billing')

    return { ok: true, effectiveAt: canceled.scheduledChange?.effectiveAt ?? null }
  } catch (error) {
    console.error('cancelPaddleSubscription failed', error)
    return { ok: false, reason: 'failed' }
  }
}
