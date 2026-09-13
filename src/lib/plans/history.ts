/**
 * Payment history, read and written through `paddle_events` — the same table a real Paddle
 * webhook will one day fill, not a second one built just for the mock.
 * The point of sharing the table is that the day the real webhook lands,
 * the user's and the operator's history screens need no new read path at all.
 *
 * `webhookApply.ts` is the only writer: one row per verified Paddle event, payload and all.
 * `eventType` carries a `mock.` prefix so these rows stay visually and query-ably distinct
 * from Paddle's own dotted names (`subscription.created`, ...) the moment those start
 * arriving in the same table.
 */

import { desc, eq } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { accountIdOf } from '@/lib/db/ids'
import { paddleEvents } from '@/lib/db/schema'

import { LIFETIME, PRICES } from './prices'
import type { BillingPeriod } from './prices'
import { readPlan } from './types'
import type { Plan } from './types'

/**
 * What the mock used to write — the vocabulary the rows it left behind still speak.
 *
 * **Nothing writes these any more**, and they are kept for the reason `paddle_events`' own
 * schema comment gives: the ledger's job is to have the event. Rows the mock wrote are still in
 * the development database, and a reader that stopped understanding them would show them as
 * bare «Event» lines with no amount — a worse screen for nothing gained. `PADDLE_ACTIONS` below
 * is the live vocabulary.
 *
 * `cancelled_now` is not a duplicate of `scheduled_change` with `plan: 'free'`: that one says
 * "at the end of the period", and the mock had a branch where there was no period left to end
 * (a row with no `planExpiresAt`), which dropped the plan on the spot.
 * Logging both the same way put "Scheduled: cancel at period end" in the history directly under
 * a confirmation saying the account was already back on Free.
 */
export type MockEventAction = 'purchase' | 'scheduled_change' | 'cancelled_now' | 'force_expired' | 'kept_current'

/**
 * What a *real* Paddle event did, in the same vocabulary a ledger line is read in.
 *
 * Separate from `MockEventAction` rather than folded into it, because the two describe
 * different worlds: the mock's actions are what a stand-in *decided*, these are what a payment
 * processor *reported*. Only `payment` moves money — `paymentSummary` collects on that and on
 * `purchase`, and on nothing else.
 */
export type PaddleEventAction =
  | 'payment'
  | 'started'
  | 'activated'
  | 'changed'
  | 'cancelled'
  | 'past_due'
  | 'paused'
  | 'resumed'
  /* Money going back, which is the other direction and needs its own words — see below. */
  | 'refund_pending'
  | 'refunded'
  | 'refund_rejected'
  | 'credited'
  | 'chargeback'
  | 'reversed'

const PADDLE_ACTIONS: Record<string, PaddleEventAction> = {
  'transaction.completed': 'payment',
  'subscription.created': 'started',
  'subscription.activated': 'activated',
  'subscription.updated': 'changed',
  'subscription.canceled': 'cancelled',
  'subscription.past_due': 'past_due',
  'subscription.paused': 'paused',
  'subscription.resumed': 'resumed',
}

/**
 * An adjustment as a ledger line — money going the other way, which arrived in this table the
 * day the destination was subscribed to `adjustment.created`/`adjustment.updated` and had
 * nothing here to read it.
 *
 * **The row was the bare «Event» this file already documents having fixed once**, and on the
 * worst possible day: a refunded Lifetime loses its plan (`adjustmentEffect`) and the customer's
 * own payment history said only that something had happened, with no amount. The ledger had the
 * event; the screen could not say it.
 *
 * **Read from `action` and `status` together, never from the event name.** Both event types
 * carry both fields, a refund is created `pending_approval` and *becomes* `approved` — so the
 * pair of rows a real refund writes reads «requested» then «refunded», which is what happened,
 * rather than the same sentence twice. The same gate `adjustmentEffect` applies to deciding
 * whether to revoke, pointed at deciding what to *say*.
 *
 * **Only an `approved` refund, a chargeback or a credit is money that has actually gone back**,
 * which is what `moneyBack` marks and what earns the minus sign on the screen. A request still
 * pending must never be drawn as a repayment: Paddle rejects some of them.
 *
 * `credit` is not a repayment to a card at all but a balance against future invoices — the
 * distinction `plans/CLAUDE.md` spends a paragraph on for B7 — so it is its own word here too.
 *
 * Documented, not measured: the payload shape is Paddle's published example for these two
 * events, since nobody has yet driven a real refund through the sandbox. Everything is read
 * defensively, so an unexpected shape falls back to a dated row rather than throwing.
 */
export function adjustmentAction(action: string | null, status: string | null): PaddleEventAction | 'unknown' {
  if (action === 'chargeback_reverse' || action === 'chargeback_warning_reverse' || status === 'reversed') {
    return 'reversed'
  }
  if (status === 'rejected') return 'refund_rejected'
  if (action === 'chargeback' || action === 'chargeback_warning') return 'chargeback'
  if (action === 'credit') return 'credited'
  if (action === 'refund') return status === 'approved' ? 'refunded' : 'refund_pending'
  return 'unknown'
}

/** The three that mean the customer has their money, or its value, back. */
const MONEY_BACK: ReadonlySet<PaddleEventAction | 'unknown'> = new Set(['refunded', 'chargeback', 'credited'])

/**
 * Cents as Paddle sends them, as euro as `PRICES` prints it: `'9999'` → `'99.99'`.
 *
 * String arithmetic rather than a division, for `yearlyTotalOfMonthly`'s reason turned around:
 * `9999 / 100` is exact today and `Number.toFixed` hides the case where it is not, and this is
 * a figure somebody was charged. Anything that is not a run of digits answers `null`, because a
 * total this cannot read must show as «no amount» rather than as a number nobody was billed.
 */
function centsToEuro(cents: string): string | null {
  if (!/^\d+$/.test(cents)) return null
  return `${cents.slice(0, -2) || '0'}.${cents.slice(-2).padStart(2, '0')}`
}

/**
 * One row of history, already parsed for a screen to render — never the raw `payload`, which
 * stays this file's own concern.
 *
 * `action` and `plan`/`cycle`/`amount` are independently nullable-ish because a row this file
 * did not write itself can still land in `paddle_events` one day (a real Paddle event, or one
 * corrupted beyond parsing): it must still show up, dated, rather than vanish or throw — see
 * `paymentHistoryFor`'s own comment.
 */
export interface PaymentHistoryLine {
  id: string
  occurredAt: Date
  action: MockEventAction | PaddleEventAction | 'unknown'
  plan: Plan | null
  cycle: BillingPeriod | null
  /** Euro, as `PRICES`/`LIFETIME` already print it — a fake charge, never a real one. */
  amount: string | null
  /**
   * The coupon redeemed on this line, and what the listino said at the time.
   *
   * Read back out of the payload, never re-derived: that is the whole reason the writer
   * takes an explicit `amount` now rather than calling `amountFor` itself — a later re-price
   * must not rewrite what somebody already paid, nor what they were shown it was reduced from.
   * `null` on every line that had no coupon, which is most of them.
   */
  couponCode: string | null
  couponPercent: string | null
  fullAmount: string | null
  /**
   * Whether this line's `amount` went **back** to the customer rather than being taken from
   * them — an approved refund, a chargeback, a credit. A separate flag rather than a negative
   * `amount`, because every reader of that field treats it as a magnitude (`paymentSummary`
   * sums it, `euro()` prefixes a symbol) and a minus sign smuggled into the string would be
   * arithmetic hiding in a label.
   */
  moneyBack: boolean
}

/**
 * The price this mock would have shown before the purchase this event records — never a real
 * charge.
 *
 * Exported because the thank-you email names the same figure (`purchaseEmail`, sent from
 * the checkout): two copies of "what does this plan cost for this cycle" are two copies that
 * drift, and a receipt disagreeing with the ledger row written in the same breath is the exact
 * kind of contradiction this feature keeps avoiding elsewhere.
 */
export function amountFor(plan: Plan, cycle: BillingPeriod | null): string | null {
  if (plan === 'lifetime') return LIFETIME.amount
  if (plan === 'free' || cycle === null) return null
  return PRICES[plan][cycle].amount
}

/**
 * The cycle the most recent purchase of this exact plan actually paid for — the one fact
 * `accounts` never stores as a column of its own (see `subscriptionCopy.ts`'s own comment on
 * `lastPaymentLine`, which reads the same ledger for the same reason). `null` when this plan
 * was never bought through this ledger at all — a manually granted plan, most likely — and a
 * caller wanting to offer "the other cycle" has no honest opposite to offer then.
 *
 * `history` newest-first, matched on `plan` and not only on the action, for the same reason
 * `lastPaymentLine` matches on both: an upgrade's own row must win over the cheaper plan
 * underneath it, or this would answer with the cycle of a plan no longer held.
 */
export function mostRecentCycleFor(plan: Plan, history: PaymentHistoryLine[]): BillingPeriod | null {
  const paid = history.find((line) => line.action === 'purchase' && line.plan === plan)
  return paid?.cycle ?? null
}

/** Everything a ledger line says beyond its id and its date. */
export type LineFields = Omit<PaymentHistoryLine, 'id' | 'occurredAt'>

const NOTHING: LineFields = {
  action: 'unknown',
  plan: null,
  cycle: null,
  amount: null,
  couponCode: null,
  couponPercent: null,
  fullAmount: null,
  moneyBack: false,
}

/** The mock's own payload: flat fields this file wrote itself. */
function fromMockPayload(eventType: string, payload: Record<string, unknown>): LineFields {
  const { plan, cycle, amount, couponCode, couponPercent, fullAmount } = payload

  return {
    action: eventType.slice('mock.'.length) as MockEventAction,
    plan: typeof plan === 'string' ? readPlan(plan) : null,
    cycle: cycle === 'year' || cycle === 'month' ? cycle : null,
    amount: typeof amount === 'string' ? amount : null,
    couponCode: typeof couponCode === 'string' ? couponCode : null,
    couponPercent: typeof couponPercent === 'string' ? couponPercent : null,
    fullAmount: typeof fullAmount === 'string' ? fullAmount : null,
    /* The mock never gave anything back — it had no way to. */
    moneyBack: false,
  }
}

/**
 * A real Paddle webhook payload, which is shaped nothing like the mock's.
 *
 * **This is why the Payments panel read blank the day real events started arriving**: everything
 * above reads flat top-level fields, and a Paddle event keeps all of it under `data` — so plan,
 * cycle and amount all came back null and the action fell through to `'unknown'`, which the
 * table prints as a bare «Event».
 *
 * The plan comes from the `custom_data` stamped on the price at catalogue creation, the same
 * field `webhook.ts` grants from — so the ledger and the entitlement can never disagree about
 * what was bought. The amount comes from the transaction's own totals and **only from
 * `transaction.completed`**: a subscription event describes a state, not a charge, and reading
 * a figure off one would invent money that never moved. `total` rather than `subtotal` because
 * these prices are tax-inclusive — it is the number the customer actually paid.
 *
 * Non-euro totals answer `null` rather than being printed: `euro()` would stamp a € on them.
 * The listino is euro-only, so this is a guard against a future that has not happened yet.
 */
function fromPaddleEvent(eventType: string, payload: Record<string, unknown>): LineFields {
  const data = payload.data
  if (data === null || typeof data !== 'object') return NOTHING

  /*
   * **An adjustment is read before anything else, because it is shaped differently.** Its
   * totals sit at the top of `data` rather than under `details`, and its `items` carry a
   * transaction item rather than a price — so there is no `custom_data` stamp on it and the
   * plan stays null, which is why none of the labels this maps to name one. Saying «Refunded
   * an unknown plan» would be worse than saying «Refunded».
   */
  if (eventType.startsWith('adjustment.')) return fromAdjustment(data as Record<string, unknown>)

  const { items, details } = data as Record<string, unknown>

  const stamp = Array.isArray(items)
    ? (items
        .map((item) => (item as { price?: { custom_data?: unknown } } | null)?.price?.custom_data)
        .find((custom) => custom !== null && typeof custom === 'object') as
        | { plan?: unknown; cycle?: unknown }
        | undefined)
    : undefined

  const totals = (details as { totals?: { total?: unknown; currency_code?: unknown } } | undefined)?.totals
  const chargeable = eventType === 'transaction.completed' && totals?.currency_code === 'EUR'

  return {
    ...NOTHING,
    action: PADDLE_ACTIONS[eventType] ?? 'unknown',
    plan: typeof stamp?.plan === 'string' ? readPlan(stamp.plan) : null,
    cycle: stamp?.cycle === 'year' || stamp?.cycle === 'month' ? stamp.cycle : null,
    amount: chargeable && typeof totals?.total === 'string' ? centsToEuro(totals.total) : null,
  }
}

/** An adjustment's `data`, which `adjustmentAction` turns into a word and a direction. */
function fromAdjustment(data: Record<string, unknown>): LineFields {
  const read = (value: unknown): string | null => (typeof value === 'string' ? value : null)
  const action = adjustmentAction(read(data.action), read(data.status))

  const totals = data.totals as { total?: unknown; currency_code?: unknown } | undefined
  /* Euro only, the same guard a transaction gets and for the same reason: `euro()` would stamp
     a € on a figure in another currency. The listino is euro-only, so this is a guard against
     a future that has not happened. */
  const total = totals?.currency_code === 'EUR' && typeof totals.total === 'string' ? centsToEuro(totals.total) : null

  return { ...NOTHING, action, amount: total, moneyBack: MONEY_BACK.has(action) }
}

/**
 * One stored row as a ledger line, whichever of the two payload shapes it holds.
 *
 * An unparseable payload answers `NOTHING`, so the row still shows with its date and a bare
 * event label — `paddle_events`' own promise that «the ledger's job is to have the event, not
 * to have understood it», kept on the reading side too.
 */
export function readLine(eventType: string, payload: string): LineFields {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return NOTHING
  }

  if (parsed === null || typeof parsed !== 'object') return NOTHING

  return eventType.startsWith('mock.')
    ? fromMockPayload(eventType, parsed as Record<string, unknown>)
    : fromPaddleEvent(eventType, parsed as Record<string, unknown>)
}

/**
 * One account's payment history, newest first — every row in `paddle_events` for that
 * address, not only the ones this file wrote. A row whose `eventType` carries no `mock.`
 * prefix, or whose `payload` this cannot parse as its own shape, still returns as a bare
 * `{ action: 'unknown', plan: null, cycle: null, amount: null }` line rather than being
 * dropped or throwing — the ledger's job is to have the event, the same principle
 * `db/schema.ts` states for the table itself.
 *
 * Callers decide who may ask for whose history: this function itself checks nothing, the
 * same split `checkout.ts`'s self-scoped read and `accounts/actions.ts`'s owner-gated read
 * already draw for every other query in this feature.
 */
export async function paymentHistoryFor(accountOwnerEmail: string): Promise<PaymentHistoryLine[]> {
  const rows = await db()
    .select({
      eventId: paddleEvents.eventId,
      eventType: paddleEvents.eventType,
      occurredAt: paddleEvents.occurredAt,
      receivedAt: paddleEvents.receivedAt,
      payload: paddleEvents.payload,
    })
    .from(paddleEvents)
    /* By the id and not the address (v4.7): an account that changed address keeps its
       payment history, without anything having had to move the old rows to the new
       address — which is what `changeAccountEmail` used to do, and must not. */
    .where(eq(paddleEvents.accountId, accountIdOf(accountOwnerEmail)))
    .orderBy(desc(paddleEvents.receivedAt))

  return rows.map((row) => ({
    id: row.eventId,
    occurredAt: row.occurredAt ?? row.receivedAt,
    ...readLine(row.eventType, row.payload),
  }))
}
