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
import { planOfPrice, readDowngradeStamp } from './webhook'

/** A date Paddle sends as a string, or null — the SDK types it as `string` and sends none. */
export function readDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

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
  | {
      ok: true
      id: string
      /**
       * **The plan that has been paid for, which is not always the plan on the items.** While a
       * downgrade of this app's own is scheduled, Paddle's items already name the cheaper plan
       * — that is how the change was made, with `do_not_bill` — while the period running is one
       * the customer paid at the *old* price. Every caller here is deciding what a further
       * change would mean, and deciding it against the items would read «back to Premium» as an
       * upgrade and charge for a period already paid in full. So this is the paid plan, and
       * `pendingDowngrade` below is where the other one is said.
       */
      plan: Plan
      cycle: BillingPeriod | null
      /**
       * Where a downgrade already arranged is taking this subscription, and on what day —
       * `null` when none is. Read from the stamp in `custom_data` (`webhook.ts`), so the screen
       * and the webhook agree about it without either asking the other.
       */
      pendingDowngrade: { plan: Plan; cycle: BillingPeriod | null; at: Date } | null
      /** The end of the period now paid for — what a downgrade arranged today would wait for. */
      periodEndsAt: Date | null
      /**
       * Whether a cancellation (or pause) is already scheduled on this subscription — Paddle's
       * own `scheduled_change`, not the stamp above, and the two are unrelated. Carried here
       * **from the same fetch that read the status**, rather than left for the caller to ask
       * again. Two fetches are two snapshots, and a cancellation landing between them is
       * invisible to exactly the clear-first step that exists to handle it: the plan change
       * would then go out against a subscription Paddle still believes is cancelling, and be
       * refused for carrying a scheduled change. One read, one answer.
       */
      scheduledChange: boolean
      /**
       * Paddle's `custom_data` verbatim, because **an update replaces it wholesale**. A writer
       * that assigns a fresh object drops `account_id` with it, and the symptom is not an error
       * but an event that finds no account — see `webhook.ts`'s three ways of looking one up.
       * Carried from the same fetch as everything else so the merge is made from what is
       * actually there.
       */
      customData: Record<string, unknown> | null
      /** `accounts.id`, so a `custom_data` that has somehow lost its stamp can be given one. */
      accountId: number
    }
  | { ok: false; reason: NoLiveSubscription }

/**
 * What this account has paid Paddle for, and what is arranged to happen to it.
 *
 * Not «what Paddle is billing», which is the same thing until a downgrade is scheduled and then
 * quietly is not: `do_not_bill` moves the items the day the reader presses the button and
 * leaves the period they paid for running at the old price. The plan reported here is the one
 * they *hold*; `pendingDowngrade` is the one Paddle will bill next.
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

    const customData = (subscription.customData ?? null) as Record<string, unknown> | null
    /*
     * The same reader the webhook uses on the same field, and retired by the same rule: a
     * period that starts at or after the stamp's date is one the downgrade has already landed
     * in, so the items are simply the truth again. No clock is consulted on either side, which
     * is what keeps the screen and the account row from disagreeing about the day.
     */
    const stamp = readDowngradeStamp(customData, subscription.currentBillingPeriod?.startsAt)

    return {
      ok: true,
      id: subscription.id,
      plan: stamp?.fromPlan ?? read.plan,
      cycle: stamp === null ? read.cycle : stamp.fromCycle,
      pendingDowngrade: stamp === null ? null : { plan: read.plan, cycle: read.cycle, at: stamp.at },
      periodEndsAt: readDate(subscription.currentBillingPeriod?.endsAt),
      scheduledChange: subscription.scheduledChange != null,
      customData,
      accountId: account.id,
    }
  } catch (error) {
    console.error('livePaddleSubscription failed', error)
    return { ok: false, reason: 'unreadable' }
  }
}

/**
 * The `custom_data` to send with a change of items, which is **the whole object Paddle will
 * keep**: an update replaces it rather than merging into it, so what is not carried over is
 * lost. `account_id` is the field that matters — it is the only one of `webhook.ts`'s three
 * ways to find an account that does not depend on a column already written — and dropping it
 * fails silently, as an event recorded `unmatched` rather than as an error anywhere.
 *
 * `downgrade` is written on **every** change, `null` included. A stamp left standing through a
 * later upgrade or cycle change would go on claiming a plan the subscription has moved off,
 * and «only write it when there is one» is how that happens.
 */
export function customDataFor(
  live: Extract<LivePaddleSubscription, { ok: true }>,
  stamp: Record<string, unknown> | null,
): Record<string, unknown> {
  return {
    ...(live.customData ?? {}),
    account_id: live.customData?.account_id ?? live.accountId,
    downgrade: stamp,
  }
}
