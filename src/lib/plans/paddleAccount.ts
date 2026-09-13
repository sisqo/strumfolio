/**
 * What Paddle knows this account by, and what it is actually billing — the reads three callers
 * share.
 *
 * A plain module rather than part of either `'use server'` file that needs it, for
 * `paddleClient.ts`'s reason: those may only export async *actions*, and every export of one
 * becomes an endpoint the browser can post to. A loader answering «which subscription is this
 * account's» has no business being one of those.
 */

import { eq } from 'drizzle-orm'

import { currentUser } from '@/lib/auth/session'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'

import { paddleClient } from './paddleClient'
import type { BillingPeriod } from './prices'
import type { Plan } from './types'
import { planOfPrice } from './webhook'

export interface PaddleAccountRef {
  /** The numeric `accounts.id`, which is what a checkout stamps into `custom_data`. */
  id: number
  /**
   * **«Has had a subscription», not «has one».** It is written by the webhook on *every*
   * subscription event, `subscription.canceled` included, and nothing ever nulls it — so a
   * customer who cancelled and lapsed back to free still carries the id of the subscription
   * they left. Reading it as «this account pays us» is the mistake `livePaddleSubscription`
   * exists to stop: it is a pointer to ask Paddle about, never an answer on its own.
   */
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

/**
 * Why there is no subscription here to move.
 *
 * **`gone` and `not-live` are split on purpose, and the split is the whole point of this type.**
 * A `canceled` subscription is over: that reader is back to free, and what they want from a
 * checkout is to *buy*, exactly as a first-timer would. A `past_due` or `paused` one is still
 * running — the card is failing or the billing is held — and starting a fresh checkout beside
 * it would leave two subscriptions on one account, both billing. So `gone` is the only reason
 * a caller may answer by selling, and the rest all mean «do not open a second one».
 *
 * `unreadable` covers both a price this app cannot map and Paddle simply not answering, and it
 * deliberately falls on the cautious side of that line for the same reason: an account that has
 * a subscription id and an unreadable answer is not an account to sell a second subscription to.
 */
export type NoLiveSubscription = 'no-subscription' | 'gone' | 'not-live' | 'unexpected-items' | 'unreadable'

export type LivePaddleSubscription =
  | { ok: true; id: string; plan: Plan; cycle: BillingPeriod | null }
  | { ok: false; reason: NoLiveSubscription }

/**
 * What Paddle is billing this account for right now.
 *
 * **Asked of Paddle, never of this database**, and for two reasons that both cost money. The
 * column above cannot tell a live subscription from a cancelled one. And `accounts` has no
 * column for the live *cycle* — there has never been one — so the direction of a plan change
 * cannot be decided without asking; `planChange.ts` needs both halves.
 *
 * It costs one API call, and only for an account that has an id at all: a reader making their
 * first purchase — every reader, once — pays a single indexed read and nothing more.
 *
 * `planOfPrice` does the reading, the same function the webhook uses on the same shape, so a
 * price whose `custom_data` this app cannot read refuses a change here exactly as it declines to
 * grant anything there. The SDK hands back a camelCase entity whose `customData` is that object
 * under another name; the cast below is that one rename and nothing more — see the SDK trap in
 * the root `CLAUDE.md` for why the two spellings are never treated as interchangeable elsewhere.
 */
export async function livePaddleSubscription(): Promise<LivePaddleSubscription> {
  const paddle = paddleClient()
  if (paddle === null) return { ok: false, reason: 'no-subscription' }

  const account = await paddleAccountRef()
  if (!account?.subscriptionId) return { ok: false, reason: 'no-subscription' }

  try {
    const subscription = await paddle.subscriptions.get(account.subscriptionId)

    if (subscription.status === 'canceled') return { ok: false, reason: 'gone' }
    /* `active` only. `past_due` and `paused` are live relationships in trouble, and the reader's
       next move on either is a card rather than a plan; `trialing` cannot occur, since no price
       in this catalogue carries a trial. All three refuse rather than being sold around. */
    if (subscription.status !== 'active') return { ok: false, reason: 'not-live' }

    const items = (subscription.items ?? []).filter((item) => item.status === 'active')
    if (items.length !== 1) return { ok: false, reason: 'unexpected-items' }

    const read = planOfPrice({
      id: items[0].price?.id ?? '',
      custom_data: (items[0].price?.customData ?? null) as { plan?: unknown; cycle?: unknown } | null,
    })
    if (read === null) return { ok: false, reason: 'unreadable' }

    return { ok: true, id: subscription.id, plan: read.plan, cycle: read.cycle }
  } catch (error) {
    console.error('livePaddleSubscription failed', error)
    return { ok: false, reason: 'unreadable' }
  }
}
