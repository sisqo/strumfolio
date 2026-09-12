/**
 * Reading a Paddle webhook as this app's own subscription columns.
 *
 * Pure and `node:test`-covered, with no database and no SDK instance, for the reason
 * `catalogue.ts` gives: the route handler is fetching and writing, and the rules — which
 * plan a price means, what a Paddle status is called here, when a change is scheduled rather
 * than immediate — are the part worth testing. The narrow payload interfaces below are
 * deliberately ours rather than the SDK's: a test builds one in four lines, and the fields
 * this app actually reads are then written down in one place instead of being implied by the
 * code that reaches into them.
 *
 * **The account contract, which the checkout has to satisfy and does not exist yet.** A
 * webhook has to answer «whose account is this», and it gets three chances, in this order:
 * `custom_data.account_id` on the subscription or transaction, then
 * `accounts.paddle_subscription_id`, then `accounts.paddle_customer_id`. The first is the only
 * one that works on a *first* purchase, when neither column has been written yet, so **the
 * checkout must stamp the numeric `accounts.id` into the transaction's `custom_data`** — see
 * `accountRefFrom`. Numeric id and not the email, per `db/CLAUDE.md`: `accounts` is not one of
 * the four tables keyed by an address, and an email in Paddle's records goes stale the day
 * somebody changes theirs.
 *
 * **`resolveSubscription` states two requirements on this file and they are unguessable from
 * the outside**, so they are repeated here. A renewal that lands *after* period end downgrades
 * a paying customer for that window, because a past `expiresAt` ends a subscription even while
 * the status still says `active` — so the expiry written here is always Paddle's
 * `current_billing_period.ends_at`, which is the end of the period *now being paid for*. And
 * `grace` ignores dates entirely, which is what makes it the right home for a failing card:
 * by the time a payment has failed the paid period is virtually always already over.
 */

import type { SubscriptionColumns } from './entitlements'
import { readPendingCycle, type BillingPeriod } from './prices'
import { PLAN_VALUES, type Plan, type PlanStatus } from './types'

/** The price as it rides inside an event, snapshotted when it joined the subscription. */
export interface PaddlePriceRef {
  id: string
  custom_data?: { plan?: unknown; cycle?: unknown } | null
}

export interface PaddleItemRef {
  price?: PaddlePriceRef | null
}

/** `data` on `subscription.created` / `.updated` / `.canceled`, narrowed to what is read. */
export interface PaddleSubscriptionData {
  id: string
  customer_id?: string | null
  status: string
  custom_data?: { account_id?: unknown } | null
  current_billing_period?: { ends_at?: string | null } | null
  scheduled_change?: { action?: string | null; effective_at?: string | null } | null
  items?: PaddleItemRef[] | null
}

/** `data` on `transaction.completed`, narrowed the same way. */
export interface PaddleTransactionData {
  id: string
  customer_id?: string | null
  subscription_id?: string | null
  status?: string | null
  custom_data?: { account_id?: unknown } | null
  items?: PaddleItemRef[] | null
}

/** How the webhook proposes to find the account this event belongs to. */
export interface AccountRef {
  /** From `custom_data.account_id` — the only one that works on a first purchase. */
  accountId: number | null
  paddleSubscriptionId: string | null
  paddleCustomerId: string | null
}

/**
 * What one event asks to be written. `null` columns mean "this event says nothing about the
 * subscription" — a customer.updated, or a renewal transaction whose subscription events
 * carry the real state.
 */
export interface PaddleEventEffect {
  account: AccountRef
  columns: SubscriptionColumns | null
}

/**
 * The plan and cycle a price stands for, read from the `custom_data` stamped on it when the
 * catalogue was created.
 *
 * **Answers `null` rather than a plan for anything it cannot read**, and that direction is the
 * whole point: `readPlan` degrades an unknown value to `'free'`, which here would mean a
 * webhook silently *revoking* somebody's plan because a price was renamed or a new one was
 * added without a stamp. Null reaches the caller as "this event changes nothing", which leaves
 * the account exactly as it was — the same asymmetry `readPlan` and `readPendingPlan` already
 * argue for in `types.ts`.
 */
export function planOfPrice(price: PaddlePriceRef | null | undefined): { plan: Plan; cycle: BillingPeriod | null } | null {
  const stamped = price?.custom_data?.plan
  if (typeof stamped !== 'string' || !PLAN_VALUES.includes(stamped as Plan)) return null

  return { plan: stamped as Plan, cycle: readPendingCycle(price?.custom_data?.cycle) }
}

/** The first item of an event that names a plan this app sells. */
export function planOfItems(items: PaddleItemRef[] | null | undefined): { plan: Plan; cycle: BillingPeriod | null } | null {
  for (const item of items ?? []) {
    const read = planOfPrice(item.price)
    if (read) return read
  }
  return null
}

/**
 * Paddle's subscription status in this app's three-value vocabulary.
 *
 * `past_due` and `paused` both answer `grace`, which keeps the plan's entitlements: a failing
 * card is not a lapsed customer, and a pause is not a cancellation either. There is
 * deliberately no fourth `PlanStatus` for a pause — `PlanStatus` feeds `resolveSubscription`
 * and every gate in the app, and a value none of them know would be read by `readPlanStatus`
 * as `active` anyway.
 *
 * An **unrecognised** status answers `active`, matching `readPlanStatus`'s stated asymmetry:
 * an unreadable plan must never grant, and an unreadable status must never revoke. A Paddle
 * status this app has never heard of is not evidence that anybody lapsed.
 */
export function statusOf(paddleStatus: string): PlanStatus {
  switch (paddleStatus) {
    case 'canceled':
      return 'expired'
    case 'past_due':
    case 'paused':
      return 'grace'
    default:
      return 'active'
  }
}

function readAccountId(custom: { account_id?: unknown } | null | undefined): number | null {
  const raw = custom?.account_id
  const id = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN
  return Number.isInteger(id) && id > 0 ? id : null
}

function endsAt(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * A subscription event as columns.
 *
 * A `scheduled_change` of `cancel` is the one Paddle action this app already has a shape for:
 * `pendingPlan: 'free'` is exactly what `resolveSubscription` reads as "cancel at period end".
 * `pause` and `resume` are deliberately ignored — neither is a change of *plan*, and the
 * status arriving as `paused` already answers them through `grace`.
 */
export function subscriptionEffect(data: PaddleSubscriptionData): PaddleEventEffect {
  const account: AccountRef = {
    accountId: readAccountId(data.custom_data),
    paddleSubscriptionId: data.id,
    paddleCustomerId: data.customer_id ?? null,
  }

  const read = planOfItems(data.items)
  if (!read) return { account, columns: null }

  const cancelling = data.scheduled_change?.action === 'cancel'

  return {
    account,
    columns: {
      plan: read.plan,
      status: statusOf(data.status),
      expiresAt: endsAt(data.current_billing_period?.ends_at),
      pendingPlan: cancelling ? 'free' : null,
      pendingCycle: null,
    },
  }
}

/**
 * A completed transaction as columns — which for all but one case means *no* columns.
 *
 * `transaction.completed` fires for every renewal too, and those carry a `subscription_id`
 * whose own `subscription.updated` is the authoritative account of what changed. Acting on
 * both would have two events racing to write the same row with the second one's expiry
 * possibly older. So this reads exactly one thing: the **Lifetime**, which is a one-time
 * purchase, has no subscription at all, and would otherwise arrive nowhere.
 *
 * Its `expiresAt` is `null`, meaning never — the same value `free` carries, and the reason
 * `SubscriptionColumns.expiresAt`'s own comment warns that reading null the other way round
 * expires every account in the installation.
 */
export function transactionEffect(data: PaddleTransactionData): PaddleEventEffect {
  const account: AccountRef = {
    accountId: readAccountId(data.custom_data),
    paddleSubscriptionId: data.subscription_id ?? null,
    paddleCustomerId: data.customer_id ?? null,
  }

  if (data.subscription_id) return { account, columns: null }

  const read = planOfItems(data.items)
  if (!read || read.plan !== 'lifetime') return { account, columns: null }

  return {
    account,
    columns: { plan: 'lifetime', status: 'active', expiresAt: null, pendingPlan: null, pendingCycle: null },
  }
}
