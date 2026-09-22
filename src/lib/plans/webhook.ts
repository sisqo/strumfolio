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
 * **The account contract, which the checkout has to satisfy and does.** A
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

/**
 * `data` on `adjustment.created` and `adjustment.updated` — a refund, a credit or a chargeback.
 *
 * `items[].type` is per **item**: there is no adjustment-level «full or partial», which is the
 * one shape surprise here and the reason `adjustmentEffect` has to decide what full means.
 */
export interface PaddleAdjustmentData {
  id: string
  action?: string | null
  status?: string | null
  /** Present when the adjustment belongs to a subscription — the whole gate, see below. */
  subscription_id?: string | null
  transaction_id?: string | null
  customer_id?: string | null
  items?: { type?: string | null }[] | null
}

/** `data` on `transaction.completed`, narrowed the same way. */
export interface PaddleTransactionData {
  id: string
  customer_id?: string | null
  subscription_id?: string | null
  status?: string | null
  /** `web`, `api`, `subscription_recurring`, `subscription_update`… — see `isNewPurchase`. */
  origin?: string | null
  custom_data?: { account_id?: unknown; coupon_campaign_id?: unknown } | null
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
  /**
   * A write of `planStatus` **and nothing else** — the shape an adjustment needs and the reason
   * this is not a `columns`. Revoking must not touch `plan`: what somebody bought is a fact
   * about the past, the four other columns describe a subscription an adjustment says nothing
   * about, and leaving `plan` in place is exactly what lets a contested chargeback be undone by
   * writing `active` back over it.
   */
  statusOnly?: PlanStatus | null
  /**
   * A contested Lifetime chargeback that was won: write the Lifetime back whole, not only its
   * status. `mayWritePlan` lets subscription events through while a Lifetime is `expired`, so an
   * old subscription's cancellation landing inside a chargeback window may have rewritten `plan`
   * in the meantime — and a reverse that restored only `active` would leave that reader on
   * whatever the cancellation wrote, instead of on the Lifetime they paid for.
   */
  restoresLifetime?: boolean
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

/** A field that must be a non-empty string to mean anything — anything else reads as absent. */
function readString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
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
/** How far past the paid period a stamp's date may fall before it is not believed. */
const STAMP_SLACK_MS = 24 * 60 * 60 * 1000

export function readDowngradeStamp(
  custom: { downgrade?: unknown } | null | undefined,
  periodStartsAt: string | null | undefined,
  periodEndsAt?: string | null,
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

  /*
   * **Never later than the period Paddle says is paid for** (a day's slack for rounding). This
   * app writes the stamp *from* `current_billing_period.ends_at`, so a legitimate one is never
   * past it; one that is was not written here. The concern is `custom_data` reaching Paddle from
   * somewhere other than `startPaddleCheckout` — a browser holding the public client token — and
   * without this bound a stamp saying «Premium until 2099» on a €3.49 Standard would be honoured
   * for as long as it said. Bounded, the most any stamp can hold is the period already paid.
   */
  const ends = asDate(periodEndsAt ?? null)
  if (ends !== null && on.getTime() > ends.getTime() + STAMP_SLACK_MS) return null

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
  const scheduled = readDowngradeStamp(
    data.custom_data,
    data.current_billing_period?.starts_at,
    data.current_billing_period?.ends_at,
  )

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
 * Money going back, as a change to what the account holds — `adjustment.created` and
 * `adjustment.updated`, which carry a refund, a credit or a chargeback.
 *
 * **The gate is `subscription_id`, and it is the whole design.** An adjustment that belongs to a
 * subscription is Paddle's business, not this app's: Paddle cancels a subscription itself when
 * one of its transactions is charged back (its own history log records the reason as
 * `chargeback`) and again when a customer exercises the EU right of withdrawal (`eu_withdrawal`),
 * and that cancellation arrives here as `subscription.canceled`, which this file has always read
 * as `expired`. Acting on the adjustment as well would revoke a live subscription over a partial
 * refund of a single renewal — a goodwill gesture turned into a cancellation. It is the same
 * rule `transactionEffect` already applies for the same reason, pointed at the other event.
 *
 * **So what is left is exactly the hole: the Lifetime.** A one-off purchase has no subscription
 * for Paddle to cancel, so a refunded or charged-back Lifetime produced no event this app acted
 * on at all, and the account kept a plan it had been given its money back for — for ever, since
 * nothing later would ever contradict it.
 *
 * Two decisions are written into the table below rather than left to be inferred:
 *
 * - **Only a wholly-full adjustment revokes.** `type` is per item and there is no adjustment-level
 *   «full», so full means every item says so. A partial refund that happens to add up to the whole
 *   price will therefore *not* revoke, which is the safe side of a line that has to be drawn
 *   somewhere: leaving somebody their plan after a partial refund is a business decision, taking
 *   it away after a goodwill gesture is a support ticket. The reader's own document already
 *   decided the full case — «Rimborso pieno, accesso revocato» (E9).
 * - **A refund is only acted on once Paddle has approved it.** Refunds are created
 *   `pending_approval` and become `approved` or `rejected` on a later `adjustment.updated`, so
 *   revoking on creation would take a plan away over a request Paddle may yet reject. Chargebacks
 *   carry no such gate: Paddle creates them already applied, the money already returned.
 *
 * Everything else is deliberately nothing, and says so: a `credit` adjusts an invoice rather than
 * returning money to a card, `credit_reverse` undoes one, a `rejected` refund never happened, and
 * a `pending_approval` one has not happened yet.
 */
export function adjustmentEffect(data: PaddleAdjustmentData): PaddleEventEffect {
  const account: AccountRef = {
    /* An adjustment carries no `custom_data`, so the customer id is the only handle it offers —
       written by the Lifetime's own `transaction.completed` before any of this can happen. */
    accountId: null,
    paddleSubscriptionId: readString(data.subscription_id),
    paddleCustomerId: readString(data.customer_id),
  }

  const nothing: PaddleEventEffect = { account, columns: null, statusOnly: null }

  /* Paddle's to handle — see above. The account is still identified, so the event is recorded
     against it rather than as `unmatched`. */
  if (account.paddleSubscriptionId !== null) return nothing

  const action = readString(data.action)
  const status = readString(data.status)

  /* Contested and won: the money is ours again, so the plan is theirs again. `plan` was never
     cleared, which is what makes this one column wide — the same reversibility that decided
     `next_billing_period` for the Lifetime's own cancellation. */
  if (action === 'chargeback_reverse' || action === 'chargeback_warning_reverse') {
    return { account, columns: null, statusOnly: 'active', restoresLifetime: true }
  }

  const takesTheMoneyBack =
    action === 'refund' ? status === 'approved' : action === 'chargeback' || action === 'chargeback_warning'
  if (!takesTheMoneyBack) return nothing

  /* An adjustment with no items says nothing about how much of the purchase it undid, and an
     unreadable shape must never revoke — `planOfPrice`'s asymmetry, on a bigger lever. */
  const items = Array.isArray(data.items) ? data.items : []
  if (items.length === 0) return nothing
  if (!items.every((item) => readString(item?.type) === 'full')) return nothing

  return { account, columns: null, statusOnly: 'expired' }
}

/**
 * Whether an event may write plan columns over what the account already holds.
 *
 * **Lifetime is terminal, and a subscription event must never demote it.** A reader who buys
 * Lifetime while still paying for a subscription keeps both for a while: the subscription is
 * cancelled at the end of the period they have paid for, so `subscription.updated` (carrying the
 * scheduled cancellation) and then `subscription.canceled` both arrive *after* the Lifetime has
 * been granted. Each of them reads the subscription's own items — Premium, say — and
 * `statusOf('canceled')` answers `expired`. Left alone they would write that over the Lifetime,
 * and the customer who has just made the largest single payment this app takes would be left on
 * nothing, with no event still to come that would put it back.
 *
 * Both event names matter and `.canceled` is the dangerous one, so this matches the whole
 * `subscription.` family rather than naming the two that are known to arrive today.
 *
 * It reads the plan **stored before this event**, so the order the two purchases land in is not
 * a problem: a subscription event arriving *before* the Lifetime writes normally and is then
 * overwritten by the Lifetime, which is the right way round.
 *
 * **Only a Lifetime still in force is protected.** A refund or a chargeback leaves `plan` at
 * `lifetime` and moves only the status to `expired` (`adjustmentEffect`), and the guard used to
 * read the plan alone — so after a refunded Lifetime every later subscription the same reader
 * bought was stripped of its columns: charged every period, and left on the free plan for as
 * long as they paid. Nothing that has been taken back is worth protecting from anything.
 */
export function mayWritePlan(storedPlan: Plan, storedStatus: string, eventType: string): boolean {
  const liveLifetime = storedPlan === 'lifetime' && storedStatus !== 'expired'
  return !(liveLifetime && eventType.startsWith('subscription.'))
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
 * The campaign a purchase was made under, from the stamp `startPaddleCheckout` put on the
 * transaction — and `null` for the overwhelming majority of transactions, which carry none.
 *
 * **It is not evidence of a first purchase.** Paddle carries a transaction's `custom_data` onto
 * the subscription it opens, and a renewal's transaction carries the subscription's — so this
 * answers the same campaign id every month for as long as that subscription lives. Reading it
 * as «a coupon was just redeemed» would move `accounts.discount_ends_at` forward at every
 * renewal and the discount would never end. What tells a redemption from a renewal is
 * `coupon_redemptions_once`: the insert either takes a row or it does not, and `webhookApply`
 * writes the account's discount columns only in the first case. The unique index is the clock,
 * not this field.
 *
 * A campaign id is a UUID this app minted, so anything that is not a non-empty string is
 * absent — and an id naming no campaign simply finds no row, which is the same outcome.
 */
export function couponCampaignOf(data: PaddleTransactionData): string | null {
  return readString(data.custom_data?.coupon_campaign_id)
}

/**
 * Whether this transaction is somebody buying something, as opposed to a subscription billing
 * itself.
 *
 * **It decides one thing only: whether the account's three `coupon*` columns are cleared.** Those
 * columns are «what will this account pay next», and `db/schema.ts` requires that they are
 * always written on a purchase — «a purchase with no coupon has to clear what the last one left
 * rather than inherit it». Somebody who bought Standard with a code in July and buys the
 * Lifetime in October at full price must not still be described as living under that code. But a
 * *renewal* is not a purchase, and clearing on one would wipe a live discount at the first
 * period — the discount would be shown for one month and then vanish while Paddle went on
 * applying it.
 *
 * Paddle's `origin` is what separates them: everything a subscription generates by itself is
 * `subscription_…` (`subscription_recurring`, `subscription_update`,
 * `subscription_payment_method_change`, `subscription_charge`), and a purchase is not.
 *
 * **Read from delivered payloads rather than from the API reference**, because the two are not
 * automatically the same document: fifteen real `transaction.completed` notifications in the
 * sandbox on 2026-09-14 all carried `origin`, `api` for a purchase this app's checkout opened
 * and `subscription_update` for a change of plan. The same run settled the assumption the
 * redemption ledger rests on: the `subscription_update` transaction's `custom_data` carried
 * `downgrade` beside `account_id` — which is the *subscription's* object, not the one the
 * original transaction was created with. So a transaction's `custom_data` really does travel
 * onto later ones, and the campaign stamp really will arrive again and again.
 *
 * **An origin this cannot read answers `false`**, which leaves the columns alone. The asymmetry
 * every reader in this file follows, pointed at the column that matters here: an unreadable
 * payload must never take something away.
 */
export function isNewPurchase(data: PaddleTransactionData): boolean {
  const origin = readString(data.origin)
  return origin !== null && !origin.startsWith('subscription_')
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

/**
 * Whether a `subscription.created` is a **second** subscription on an account that already has
 * one running — the case the checkout cannot close by itself.
 *
 * The transaction behind a checkout is created when the page *loads*, and paying inside
 * Paddle's frame never calls back into this app: two tabs open on two checkouts, paid one after
 * the other, open two subscriptions, and both bill. `wouldBeSecondSubscription` refuses a press
 * made once the first has been recorded; a form that was already on screen is past that check.
 * So the webhook is the last place that sees it, and what it can do is tell somebody —
 * cancelling either one automatically would take money for a plan it then removed, and the key
 * this app holds cannot refund.
 *
 * «Running» is read from the stored row, before this event: a paid recurring plan whose status
 * is not `expired`, with a different subscription id. A reader subscribing again after their
 * last one ended is `expired` and is not a second anything.
 */
export function isSecondSubscription(
  stored: { plan: Plan; planStatus: string; paddleSubscriptionId: string | null },
  eventType: string,
  incomingSubscriptionId: string | null,
): boolean {
  if (eventType !== 'subscription.created') return false
  if (stored.paddleSubscriptionId === null || incomingSubscriptionId === null) return false
  if (stored.paddleSubscriptionId === incomingSubscriptionId) return false
  if (stored.plan === 'free' || stored.plan === 'lifetime') return false
  return stored.planStatus !== 'expired'
}
