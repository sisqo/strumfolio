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
 * `setGrant` (`accounts/actions.ts`) exists for: a gift lives in those columns, and a renewal re-asserting
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
import { paddleClient } from './paddleClient'
import { PLAN_LABEL, readPlan } from './types'
import {
  adjustmentEffect,
  mayWritePlan,
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
  /* Money going back. Only ever acts on an adjustment with no subscription behind it — which in
     this catalogue means the Lifetime, the one purchase Paddle cannot revoke on our behalf by
     cancelling something. `adjustmentEffect` carries the whole argument. */
  if (event.eventType.startsWith('adjustment.')) return adjustmentEffect(data)

  return null
}

/**
 * The account this event belongs to, tried in the order of what a *first* purchase can
 * possibly carry: the stamp the checkout put on the transaction, then either id column a
 * previous event will have written.
 */
async function findAccount(ref: AccountRef) {
  /* `plan` and the subscription id are read here rather than in a second query because both
     decide what this event is allowed to do: a Lifetime account refuses a subscription event's
     columns (`mayWritePlan`), and a Lifetime *purchase* has to know which subscription is still
     running so it can end it. Both are read as they stood **before** this event. */
  const columns = {
    id: accounts.id,
    ownerEmail: accounts.ownerEmail,
    plan: accounts.plan,
    paddleSubscriptionId: accounts.paddleSubscriptionId,
  }

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

/**
 * Ending the subscription somebody was still paying for when they bought Lifetime.
 *
 * **A Lifetime beside a running subscription is the one shape this must never leave behind**:
 * two payments for one account, the smaller one recurring for ever against a plan that has
 * already been bought outright. It is the reason `/checkout/lifetime` refused a subscriber at
 * all until now, and doing it here — after the money has arrived — is the only order that is
 * safe. Cancelling first and then failing to take the payment would leave somebody with
 * neither.
 *
 * **`next_billing_period`, not `immediately`, and the reason is that one of them cannot be
 * undone.** Paddle refunds nothing either way — a cancellation stops billing and returns no
 * money, whichever date it takes effect on — so the customer loses nothing by keeping the
 * period they paid for, and Lifetime outranks it in the meantime anyway. What differs is what
 * happens if the Lifetime purchase is withdrawn inside the fourteen days this app publishes on
 * `/` and in the Terms: «You can't reinstate a canceled subscription», so an immediate cancel
 * would leave that reader with no plan at all and no way back to the one they had. A scheduled
 * cancellation is undone by clearing it, which is a single call.
 *
 * Read before cancelling, because `paddle_subscription_id` means «has had a subscription», not
 * "has one" — cancelling a subscription that has already ended answers an error, which would
 * reach the operator as a false alarm.
 *
 * **It cannot fail the delivery and it cannot retry**, running after the transaction has
 * committed like `announcePayment` beside it. So a failure is told to the operator with both
 * ids in the message: the remedy is one click in Paddle's own dashboard, and the cost of nobody
 * knowing is a subscription that renews for ever beside a Lifetime.
 *
 * **Both messages name the account by its number and never by its address**, and that is a
 * published promise rather than a preference: outside the one line sent when an account is
 * created, the Privacy Policy states in two places that these notifications carry no personal
 * data, which is what lets it describe Telegram — established outside the EEA, under no
 * adequacy decision — as receiving none. The root `CLAUDE.md` settles which half gives way if
 * the two ever disagree: stop sending the field, do not soften the sentence. Nothing is lost
 * operationally, since the actionable handle is the subscription id beside it.
 */
async function endSubscriptionBoughtOut(account: { id: number; paddleSubscriptionId: string | null; plan: string }) {
  const subscriptionId = account.paddleSubscriptionId

  /*
   * **No pointer, but we thought they were subscribed.** Every ordinary Lifetime sale reaches
   * here with no subscription id and nothing to do, so this must not become an alert on each
   * one — the stored plan is what tells the two apart. A recurring paid plan with no
   * subscription id is an account this app believed was billing and cannot name, which is worth
   * a person looking even though nothing here can act on it.
   */
  if (subscriptionId === null) {
    const was = readPlan(account.plan)
    if (was !== 'free' && was !== 'lifetime') {
      await notifyTelegram(
        'purchase',
        `⚠️ Lifetime comprato dall'account ${account.id}, che risultava su ${PLAN_LABEL[was]} ma senza ` +
          'subscription id: controlla su Paddle se ne ha una viva da disdire.',
      )
    }
    return
  }

  const paddle = paddleClient()
  if (paddle === null) return

  try {
    const subscription = await paddle.subscriptions.get(subscriptionId)

    /* Already over, or already on its way out: nothing to do and nothing to report. */
    if (subscription.status === 'canceled') return
    if (subscription.scheduledChange?.action === 'cancel') return

    /*
     * **Every status that is not `canceled` gets cancelled, `paused` included**, and that one is
     * the reason this is not a check for `active`. A paused subscription is not a dead one: it
     * resumes and bills, so skipping it would leave exactly the thing this function exists to
     * prevent, sitting quietly for however long the pause lasts. `past_due` is the same
     * argument — dunning that succeeds is a charge.
     */
    await paddle.subscriptions.cancel(subscriptionId, { effectiveFrom: 'next_billing_period' })
  } catch (error) {
    console.error('endSubscriptionBoughtOut failed', subscriptionId, error)
    await notifyTelegram(
      'purchase',
      `⚠️ Lifetime comprato dall'account ${account.id} ma la subscription ${subscriptionId} non si è riusciti a ` +
        'disdirla: va disdetta a mano su Paddle, altrimenti rinnova accanto al Lifetime.',
    )
  }
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
           arrived for, the id is the pointer every read uses. */
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

    /*
     * **A subscription event may not write over a Lifetime.** See `mayWritePlan`: the
     * cancellation of the subscription a Lifetime buyer was still paying for arrives *after*
     * the Lifetime is granted, and carries that subscription's own plan and an `expired`
     * status. Writing it would take away the plan they just bought for ever.
     */
    const columns = mayWritePlan(readPlan(account.plan), event.eventType) ? effect.columns : null

    /*
     * **Neither id column is ever nulled once it has a value**, and that is a fix rather than a
     * precaution. A Lifetime is a transaction with no `subscription_id` at all, so this used to
     * write `null` over the pointer to the subscription still running beside it — erasing, in
     * the same statement that granted the Lifetime, the one thing needed to end that
     * subscription. It also cost every later event the second of `findAccount`'s three ways to
     * recognise the account.
     */
    /*
     * **One column, and deliberately not four.** An adjustment says money went back; it says
     * nothing about which plan was bought, when the period ends, or what is scheduled next —
     * and `plan` surviving a revocation is what lets a contested chargeback be undone by
     * writing `active` back over it. It is guarded like any other write over a Lifetime, which
     * here means allowed: `mayWritePlan` withholds only `subscription.` events, and revoking a
     * refunded Lifetime is the entire point of this branch.
     */
    const statusOnly = effect.statusOnly ?? null

    if (columns || statusOnly || effect.account.paddleCustomerId || effect.account.paddleSubscriptionId) {
      await tx
        .update(accounts)
        .set({
          ...(columns
            ? {
                plan: columns.plan,
                planStatus: columns.status,
                planExpiresAt: columns.expiresAt,
                pendingPlan: columns.pendingPlan,
                pendingCycle: columns.pendingCycle,
              }
            : {}),
          ...(statusOnly && !columns ? { planStatus: statusOnly } : {}),
          ...(effect.account.paddleCustomerId ? { paddleCustomerId: effect.account.paddleCustomerId } : {}),
          ...(effect.account.paddleSubscriptionId
            ? { paddleSubscriptionId: effect.account.paddleSubscriptionId }
            : {}),
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
  if (outcome === 'applied' && account) {
    await announcePayment(event, rawBody, account.ownerEmail)

    /*
     * The Lifetime is the one purchase that ends something else — see `endSubscriptionBoughtOut`.
     * Read from the effect rather than from the guarded `columns` inside the transaction, and
     * that is the same value here rather than a shortcut: `mayWritePlan` only ever withholds a
     * *subscription* event's columns, and this branch is a transaction's. The event type is
     * named anyway so the condition says what it means, and so a second Lifetime transaction on
     * an account that already holds one still reaches a function that finds nothing to do.
     *
     * The subscription id is the one read *before* this event, which is why the write above
     * stopped nulling it.
     */
    if (event.eventType === 'transaction.completed' && effect?.columns?.plan === 'lifetime') {
      await endSubscriptionBoughtOut(account)
    }
  }

  return outcome
}
