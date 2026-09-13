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
 * the status still says `active` — so the expiry written here is the end of the period *now
 * being paid for*: Paddle's `current_billing_period.ends_at`, or, while a downgrade of this
 * app's own is scheduled, the date stamped with it, which is that same field copied at the
 * moment of the change. And `grace` ignores dates entirely, which is what makes it the right
 * home for a failing card: by the time a payment has failed the paid period is virtually always
 * already over.
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
  custom_data?: { account_id?: unknown; downgrade?: unknown } | null
  /**
   * `starts_at` is read for one thing only, and it is the thing that makes `readDowngradeStamp`
   * need no clock: at a renewal Paddle opens a period beginning exactly where the old one
   * ended, so a period that starts at or after a stamp's date is a period the scheduled
   * downgrade has already landed in.
   */
  current_billing_period?: { starts_at?: string | null; ends_at?: string | null } | null
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
  /** The period this particular payment bought. Absent on a one-time purchase. */
  billing_period?: { ends_at?: string | null } | null
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

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * A downgrade this app has scheduled, as it travels on the subscription's own `custom_data`.
 *
 * **Paddle has nowhere else to put it.** `scheduled_change` models `cancel`, `pause` and
 * `resume` and nothing else, so «move this subscription to Standard on the day the period ends»
 * cannot be expressed. What *can* be done is to swap the items now with
 * `proration_billing_mode: do_not_bill` — no charge, no credit, the billing period untouched,
 * and the next renewal billing the new, lower price by itself. Paddle is then correct about the
 * money and wrong about the entitlement: its items say Standard from today, while the customer
 * has paid for Premium until the period ends. This stamp is the missing half, and it is what
 * lets `subscriptionEffect` write the plan they **paid for** with the cheaper one behind it as
 * `pendingPlan` — which `resolveSubscription` then collapses on the date, by pure reading, with
 * no cron and no renewal-time write.
 *
 * It rides in `custom_data` rather than in a column of this database because the webhook has to
 * be able to reach the same conclusion from the payload alone: an event replayed, or one
 * arriving for an account this app has not matched yet, carries its own explanation.
 *
 * **`custom_data` is replaced wholesale on every update, so a writer must merge rather than
 * assign** — `account_id` lives in the same object and losing it breaks the first of the three
 * ways an event finds its account. `downgradeStamp` below is only the value; `paddlePlanChange`
 * owns the merge.
 */
export interface DowngradeStamp {
  /** The plan paid for through `at` — what the customer keeps until then. */
  fromPlan: Plan
  fromCycle: BillingPeriod | null
  /** The end of the period paid at the old price: the day the cheaper items take over. */
  at: Date
}

/** The stamp as it is written. Snake_case, like everything else Paddle stores for us. */
export function downgradeStamp(from: { plan: Plan; cycle: BillingPeriod | null }, at: Date): Record<string, unknown> {
  return { from_plan: from.plan, from_cycle: from.cycle, at: at.toISOString() }
}

/**
 * The stamp, if one is still standing — and `null` the moment it is spent.
 *
 * **Nothing ever clears a stamp out of `custom_data`**: Paddle keeps it until something
 * overwrites it, so the one left behind by a downgrade that has already happened would, read
 * naively, go on granting the old plan for ever. The period's own `starts_at` is what retires
 * it, and it needs no clock to do so: a renewal opens a period beginning exactly where the paid
 * one ended, so `starts_at >= at` says the downgrade has landed and the items are now simply
 * the truth. Every renewal after that says the same thing, so the stamp is inert rather than
 * dangerous, and the next change of plan overwrites it anyway.
 *
 * A stamp this cannot read answers `null`, which means the items are believed and the tier
 * drops at once — the generous direction everywhere else in this file, reversed here on
 * purpose. This app writes these itself, so an unreadable one is its own bug; and the
 * alternative, holding somebody on a plan with no date attached, is a plan that never ends.
 */
export function readDowngradeStamp(
  custom: { downgrade?: unknown } | null | undefined,
  periodStartsAt: string | null | undefined,
): DowngradeStamp | null {
  const stamp = custom?.downgrade
  if (stamp === null || typeof stamp !== 'object') return null

  const { from_plan: fromPlan, from_cycle: fromCycle, at } = stamp as Record<string, unknown>

  if (typeof fromPlan !== 'string' || !PLAN_VALUES.includes(fromPlan as Plan)) return null
  /* Neither is a plan anybody can downgrade *from* on a subscription: `free` is what having no
     subscription is, and Lifetime has none to update. A stamp naming either is not a stamp. */
  if (fromPlan === 'free' || fromPlan === 'lifetime') return null

  const on = asDate(typeof at === 'string' ? at : null)
  if (on === null) return null

  const started = asDate(periodStartsAt)
  if (started !== null && started.getTime() >= on.getTime()) return null

  return { fromPlan: fromPlan as Plan, fromCycle: readPendingCycle(fromCycle), at: on }
}

/**
 * A subscription event as columns.
 *
 * A `scheduled_change` of `cancel` is the one Paddle action this app already has a shape for:
 * `pendingPlan: 'free'` is exactly what `resolveSubscription` reads as "cancel at period end".
 * `pause` and `resume` are deliberately ignored — neither is a change of *plan*, and the
 * status arriving as `paused` already answers them through `grace`.
 *
 * **A downgrade this app scheduled is the other way to fill `pendingPlan`**, and the two can be
 * true at once: somebody who moved down to Standard and then cancelled. **The cancellation
 * wins**, because it is the later decision and because `'free'` is where that subscription is
 * actually going — leaving Standard there would schedule a plan the account will never reach.
 * What the stamp still decides in that case is the *current* plan: the period is paid at the
 * old price either way.
 *
 * The expiry under a live stamp is the stamp's own date rather than
 * `current_billing_period.ends_at`. The two are the same day by construction — the stamp is
 * written from that very field — and where they ever differ the stamp is the promise that was
 * made to the customer, which is the one this app has to keep.
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
  const scheduled = readDowngradeStamp(data.custom_data, data.current_billing_period?.starts_at)

  if (scheduled !== null) {
    return {
      account,
      columns: {
        plan: scheduled.fromPlan,
        status: statusOf(data.status),
        expiresAt: scheduled.at,
        pendingPlan: cancelling ? 'free' : read.plan,
        pendingCycle: cancelling ? null : read.cycle,
      },
    }
  }

  return {
    account,
    columns: {
      plan: read.plan,
      status: statusOf(data.status),
      expiresAt: asDate(data.current_billing_period?.ends_at),
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

/**
 * The day the period *this payment* bought runs out — what a confirmation email names.
 *
 * Read from the transaction rather than from `subscriptionEffect`'s columns, because for a
 * subscription purchase those columns are deliberately `null`: `transactionEffect` declines to
 * write anything for a transaction carrying a `subscription_id`, so the event that knows the
 * money moved is precisely the one holding no period. The field is here instead, on the
 * transaction, which is the more truthful place for it anyway — `current_billing_period` is
 * where the subscription is *now*, `billing_period` is what this charge was *for*, and on a
 * renewal that lands late the two are not the same day.
 *
 * `null` for the Lifetime, which buys no period at all, and for anything unparseable — the
 * email has a dateless sentence for both.
 */
export function transactionPeriodEnd(data: PaddleTransactionData): Date | null {
  return asDate(data.billing_period?.ends_at)
}
