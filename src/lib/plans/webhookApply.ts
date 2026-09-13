/**
 * Writing a verified Paddle event into the account it belongs to.
 *
 * The rules live in `webhook.ts` and are tested there; this is the database half. It writes
 * the same `plan`/`planStatus`/`planExpiresAt`/`pendingPlan`/`pendingCycle` columns the mock
 * checkout writes — `checkout.ts`'s header is the description of this file's job, written
 * before it existed — plus the two `paddle_*` id columns the mock deliberately never touches,
 * which are exactly what lets the *next* event find this account without a `custom_data` stamp.
 *
 * **It never touches the `granted*` columns**, and that is the same standing decision
 * `mockPurchase` records: a gift lives in those columns, and a renewal re-asserting
 * `plan`/`planStatus` over them would silently erase it. `setGrant` is the only writer there.
 *
 * **Idempotency is the primary key and not a second ledger.** `paddle_events.event_id` is the
 * PK and Paddle re-sends the same `event_id` on every retry, so the insert *is* the dedup:
 * `onConflictDoNothing` returning no row means this event has already been applied, and the
 * route answers 200 so Paddle stops retrying. Everything happens in one transaction, so an
 * event can never be recorded as handled by a delivery whose write then failed — the retry
 * would otherwise find the row present, conclude "already applied", and the account would
 * never be updated at all.
 *
 * The event is recorded **whether or not** an account was found. A payment that arrives for
 * nobody is precisely the thing worth having a row for, and `paddle_events`' own schema
 * comment says so: «the ledger's job is to have the event, not to have understood it».
 */

import { eq } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { accounts, paddleEvents } from '@/lib/db/schema'
import { sendEmail } from '@/lib/email/send'
import { purchaseEmail } from '@/lib/email/templates'
import { notifyTelegram } from '@/lib/telegram/notify'

import { readLine } from './history'
import { euro } from './prices'
import { formatPlanDate } from './subscriptionCopy'
import { PLAN_LABEL } from './types'
import {
  subscriptionEffect,
  transactionEffect,
  transactionPeriodEnd,
  type AccountRef,
  type PaddleEventEffect,
} from './webhook'

/** What the route hands over, already verified and deserialised. */
export interface IncomingPaddleEvent {
  eventId: string
  eventType: string
  occurredAt: Date | null
  data: unknown
}

export type ApplyOutcome =
  /** Columns written, or the event was recorded and said nothing about a subscription. */
  | 'applied'
  /** This `event_id` had already been handled — a retry. Still a 200. */
  | 'duplicate'
  /** Recorded, but no account here answers to it. Still a 200: retrying will not find one. */
  | 'unmatched'

function effectOf(event: IncomingPaddleEvent): PaddleEventEffect | null {
  const data = event.data as never

  if (event.eventType.startsWith('subscription.')) return subscriptionEffect(data)
  if (event.eventType === 'transaction.completed') return transactionEffect(data)

  return null
}

/**
 * The account this event belongs to, tried in the order of what a *first* purchase can
 * possibly carry: the stamp the checkout put on the transaction, then either id column a
 * previous event will have written.
 */
async function findAccount(ref: AccountRef) {
  const columns = { id: accounts.id, ownerEmail: accounts.ownerEmail }

  if (ref.accountId !== null) {
    const [row] = await db().select(columns).from(accounts).where(eq(accounts.id, ref.accountId)).limit(1)
    if (row) return row
  }

  if (ref.paddleSubscriptionId !== null) {
    const [row] = await db()
      .select(columns)
      .from(accounts)
      .where(eq(accounts.paddleSubscriptionId, ref.paddleSubscriptionId))
      .limit(1)
    if (row) return row
  }

  if (ref.paddleCustomerId !== null) {
    const [row] = await db()
      .select(columns)
      .from(accounts)
      .where(eq(accounts.paddleCustomerId, ref.paddleCustomerId))
      .limit(1)
    if (row) return row
  }

  return null
}

/**
 * The two messages a payment is worth sending, decided on their own merits rather than
 * inherited: Paddle is the Merchant of Record and sends its own invoice, so neither of these is
 * a receipt.
 *
 * **The operator's line** exists because nothing else says out loud that money arrived. Paddle's
 * dashboard has it, a phone away from a signed-in browser does not, and `registrationNotice`
 * already argues that «something happened, go and look» is not worth a notification.
 *
 * **The customer's line** exists because Paddle's invoice names a *price* and a *product*, and
 * the thing a reader actually wants to know is which plan they now have and until when. That
 * sentence is this app's to write; no one else holds both facts.
 *
 * **Only on `transaction.completed`, and only on the first delivery of it.** Money moving is a
 * transaction; a subscription event describes a state, and notifying on those too would send
 * three messages for one purchase — the same reason `history.ts` reads an amount from this event
 * and no other. The first-delivery part is free: the caller runs this only when the insert
 * actually recorded a row, so a retry, which finds the `event_id` already present, sends nothing.
 *
 * **Nothing here can fail the delivery.** `sendEmail` and `notifyTelegram` each swallow their
 * own errors by construction, and the whole call is awaited *after* the transaction has
 * committed — a throw would be a 500, and a 500 is retried for three days, which would mean
 * three days of emails about one payment.
 *
 * Renewals reach this too, and that is right rather than an oversight: a renewal is money
 * arriving, the operator wants to know, and the customer is entitled to the same confirmation
 * they got the first time. Paddle sends its own invoice beside it; this is the one that says
 * which plan, and until when.
 */
async function announcePayment(event: IncomingPaddleEvent, rawBody: string, ownerEmail: string) {
  if (event.eventType !== 'transaction.completed') return

  /* The same reader the payment history uses, so the ledger line and the email cannot name
     different amounts for one event. */
  const line = readLine(event.eventType, rawBody)
  const planLabel = line.plan === null ? null : PLAN_LABEL[line.plan]
  const periodEnd = transactionPeriodEnd(event.data as never)

  const label = `${line.plan ?? 'piano'}${line.cycle === null ? '' : `/${line.cycle}`}`
  const paidClause = line.amount === null ? '' : ` · ${euro(line.amount)}${line.cycle === null ? ' una tantum' : ''}`
  await notifyTelegram('purchase', `💰 Acquisto: ${label}${paidClause}`)

  /* No plan to name is no confirmation worth sending: a transaction whose price carries no
     stamp is one this app cannot describe, and a receipt that names nothing is worse than
     Paddle's own, which the customer has already received. */
  if (planLabel === null) return

  await sendEmail({
    to: ownerEmail,
    ...purchaseEmail({
      planLabel,
      amount: line.amount,
      cycle: line.cycle,
      /* The period this payment bought — read from the transaction, not from the columns, which
         for a subscription purchase are deliberately empty. `transactionPeriodEnd` says why. */
      endsOn: periodEnd === null ? null : formatPlanDate(periodEnd),
      /* No coupon: `lib/coupons/` has no Paddle Discount behind any campaign, and
         `startPaddleCheckout` refuses the sale outright while one is redeemable. When that
         changes, the discount rides on the transaction and is read here. */
      coupon: null,
    }),
  })
}

export async function applyPaddleEvent(event: IncomingPaddleEvent, rawBody: string): Promise<ApplyOutcome> {
  const effect = effectOf(event)
  const account = effect ? await findAccount(effect.account) : null

  const outcome: ApplyOutcome = await db().transaction(async (tx) => {
    const recorded = await tx
      .insert(paddleEvents)
      .values({
        eventId: event.eventId,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        /* Both columns, and not redundant: the address is the historical fact of who this
           arrived for, the id is the pointer every read uses. `logMockEvent` says the same. */
        accountOwnerEmail: account?.ownerEmail ?? null,
        accountId: account?.id ?? null,
        paddleSubscriptionId: effect?.account.paddleSubscriptionId ?? null,
        /* Paddle's own bytes, not a re-serialisation: the payload is evidence, and the day a
           mapping turns out to be wrong this is what the correction is replayed from. */
        payload: rawBody,
      })
      .onConflictDoNothing({ target: paddleEvents.eventId })
      .returning({ eventId: paddleEvents.eventId })

    if (recorded.length === 0) return 'duplicate'
    if (!effect || !account) return effect && !account ? 'unmatched' : 'applied'

    if (effect.columns) {
      await tx
        .update(accounts)
        .set({
          plan: effect.columns.plan,
          planStatus: effect.columns.status,
          planExpiresAt: effect.columns.expiresAt,
          pendingPlan: effect.columns.pendingPlan,
          pendingCycle: effect.columns.pendingCycle,
          paddleCustomerId: effect.account.paddleCustomerId,
          paddleSubscriptionId: effect.account.paddleSubscriptionId,
        })
        .where(eq(accounts.id, account.id))
    }

    return 'applied'
  })

  /*
   * After the transaction has committed, never inside it: these are an HTTP call and an email,
   * and holding a database connection open across either is how a webhook with a five-second
   * budget runs out of one. Only on `applied`, which is also only on the *first* delivery — a
   * retry answers `duplicate` above and says nothing to anybody.
   */
  if (outcome === 'applied' && account) await announcePayment(event, rawBody, account.ownerEmail)

  return outcome
}
