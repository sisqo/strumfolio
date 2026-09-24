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

import { randomUUID } from 'crypto'

import { and, count, eq, gt, like, ne, or } from 'drizzle-orm'

import { discountEnd, discountedAmount, durationCopy } from '@/lib/coupons/discount'
import { db } from '@/lib/db/client'
import { accounts, couponCampaigns, couponRedemptions, paddleEvents } from '@/lib/db/schema'
import { sendEmail } from '@/lib/email/send'
import { purchaseEmail } from '@/lib/email/templates'
import { notifyTelegram } from '@/lib/telegram/notify'

import { readLine } from './history'
import { euro, isCheckoutPlan, LIFETIME, PRICES, type BillingPeriod } from './prices'
import { formatPlanDate } from './subscriptionCopy'
import { paddleClient } from './paddleClient'
import { PLAN_LABEL, readPlan } from './types'
import {
  adjustmentEffect,
  adjustmentStatusFor,
  couponCampaignOf,
  isNewPurchase,
  subscriptionRelation,
  mayWritePlan,
  stampCredible,
  subscriptionEffect,
  transactionEffect,
  transactionPeriodEnd,
  type AccountRef,
  type PaddleEventEffect,
  type SubscriptionRelation,
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

const ACCOUNT_COLUMNS = {
  id: accounts.id,
  ownerEmail: accounts.ownerEmail,
  plan: accounts.plan,
  planStatus: accounts.planStatus,
  paddleSubscriptionId: accounts.paddleSubscriptionId,
}

type AccountRow = NonNullable<Awaited<ReturnType<typeof findAccount>>>

/**
 * Whether an adjustment recorded for this account *occurred* after this one and itself moves
 * the plan's status — in which case this one arrived late and is already answered.
 *
 * Reads Paddle's own `occurred_at`, never `received_at`: the gap between the two is exactly a
 * retry. An event with no `occurred_at` cannot be ordered and is applied as before. A stored
 * payload that no longer parses says nothing, rather than blocking the event in hand.
 */
async function laterAdjustmentDecides(tx: Tx, accountId: number, event: IncomingPaddleEvent): Promise<boolean> {
  if (event.occurredAt === null) return false

  const later = await tx
    .select({ payload: paddleEvents.payload })
    .from(paddleEvents)
    .where(
      and(
        eq(paddleEvents.accountId, accountId),
        like(paddleEvents.eventType, 'adjustment.%'),
        gt(paddleEvents.occurredAt, event.occurredAt),
        ne(paddleEvents.eventId, event.eventId),
      ),
    )

  return later.some(({ payload }) => {
    try {
      const data = (JSON.parse(payload) as { data?: unknown }).data
      return data !== undefined && adjustmentEffect(data as never).statusOnly != null
    } catch {
      return false
    }
  })
}

/**
 * Whether the ledger already holds a subscription event that *occurred* after this one and
 * supersedes it: a later event of the same subscription, or — for a `subscription.created` that
 * would count as a second subscription — the creation of the subscription the account holds now,
 * which makes this one the older of the two rather than the newer.
 *
 * `occurred_at` and never `received_at`, for `laterAdjustmentDecides`' reason. An event without
 * one cannot be ordered and is applied as before.
 */
async function laterSubscriptionEvent(
  tx: Tx,
  event: IncomingPaddleEvent,
  subscriptionId: string | null,
  storedSubscriptionId: string | null,
): Promise<boolean> {
  if (event.occurredAt === null || subscriptionId === null) return false

  const sameSubscription = eq(paddleEvents.paddleSubscriptionId, subscriptionId)
  const newerStored =
    storedSubscriptionId === null
      ? undefined
      : and(eq(paddleEvents.paddleSubscriptionId, storedSubscriptionId), eq(paddleEvents.eventType, 'subscription.created'))

  const [later] = await tx
    .select({ eventId: paddleEvents.eventId })
    .from(paddleEvents)
    .where(
      and(
        like(paddleEvents.eventType, 'subscription.%'),
        gt(paddleEvents.occurredAt, event.occurredAt),
        ne(paddleEvents.eventId, event.eventId),
        newerStored === undefined ? sameSubscription : or(sameSubscription, newerStored),
      ),
    )
    .limit(1)

  return later !== undefined
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
  const columns = ACCOUNT_COLUMNS

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

/** A redemption this delivery actually recorded — never one an earlier delivery already had. */
interface Redemption {
  code: string
  percent: string
  /** The listino on the day, from `PRICES`: what the discount came off. */
  fullAmount: string
  /** What Paddle actually took, read from the same totals the payment history reads. */
  paidAmount: string
  months: number | null
  cycle: BillingPeriod | null
  discountEndsAt: Date | null
}

/**
 * What one event asks of the account's three `coupon*` columns — three answers and not two.
 *
 * `cleared` is the one that is easy to leave out and expensive to: those columns say «what will
 * this account pay next», so a purchase made at full price has to *erase* the code the last one
 * left, or somebody who bought the Lifetime at the listino goes on being described as living
 * under a campaign from July. `untouched` is everything else — a renewal, a subscription event,
 * a redemption already counted — and it is the answer for anything unreadable, because no
 * payload this app cannot parse should take a discount away.
 */
type CouponWrite =
  | { kind: 'redeemed'; redemption: Redemption }
  | { kind: 'cleared' }
  | { kind: 'untouched' }

const UNTOUCHED: CouponWrite = { kind: 'untouched' }

type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0]

/**
 * The `coupon_redemptions` row — the writer that table had been missing since 2026-09-13.
 *
 * Between the mock checkout's demolition and this commit the table had readers and no writer, so
 * `timesUsed` counted zero for ever and `redeemability`'s once-per-account gate could never
 * refuse anybody. Both were unreachable rather than exploitable, because a redeemable coupon
 * refused the sale outright — and this function is exactly the half that had to come back **in
 * the same commit** that lets a coupon be sold, or every campaign ceiling would be silently
 * uncapped.
 *
 * **The insert is the clock, and everything else hangs off that.** `transaction.completed` fires
 * on every renewal, and Paddle carries a transaction's `custom_data` onto the subscription it
 * opens — so the campaign stamp arrives again every month, for as long as the subscription
 * lives. Reading the stamp as «a coupon was redeemed» would push `accounts.discount_ends_at`
 * forward at each renewal and the discount would never end. What separates the first payment
 * from the ninetieth is `coupon_redemptions_once`: the insert takes a row once and never again,
 * and the account's three discount columns are written only when it did. Renewals are therefore
 * harmless by construction rather than by a test on some field of the payload.
 *
 * **`onConflictDoNothing()` with no target, deliberately.** This table carries *two* unique
 * indexes — by `account_id` and by `account_owner_email`, and `db/schema.ts` argues at length
 * that neither subsumes the other. A targeted clause covers one of them; the other would then
 * raise inside the webhook's transaction, which is a 500, which Paddle retries for three days —
 * and the payment would never be recorded at all. The bare form absorbs both.
 *
 * **`discount_ends_at` is computed here and read back from nowhere.** Measured against the
 * sandbox on 2026-09-14: a discount of three intervals attached to a monthly subscription came
 * back `starts_at 2026-10-13` / `ends_at 2027-01-13`, three whole months from the start — which
 * is `discountEnd`'s own arithmetic, because `maximum_recurring_intervals` is a number this app
 * set from the same `discount_months`. The two agree by construction, so reading Paddle's copy
 * back would buy nothing and cost the thing this repository keeps warning about: two writers for
 * one fact is how the two come to disagree.
 *
 * Both amounts are stored and neither is derived later, `couponRedemptions`' own rule: the
 * listino is what it said **on the day**, and re-deriving it from `PRICES` after a re-price is
 * how history that already happened gets quietly rewritten.
 */
async function recordCouponRedemption(
  tx: Tx,
  event: IncomingPaddleEvent,
  rawBody: string,
  account: { id: number; ownerEmail: string },
  alerts: string[],
): Promise<CouponWrite> {
  if (event.eventType !== 'transaction.completed') return UNTOUCHED

  const purchase = isNewPurchase(event.data as never)
  const campaignId = couponCampaignOf(event.data as never)

  /* A purchase carrying no campaign at all is what has to *clear* the columns — see
     `isNewPurchase`. A renewal carrying none leaves them exactly as they are. */
  if (campaignId === null) return purchase ? { kind: 'cleared' } : UNTOUCHED

  const [campaign] = await tx
    .select({
      code: couponCampaigns.code,
      discountPercent: couponCampaigns.discountPercent,
      discountMonths: couponCampaigns.discountMonths,
      usageLimitSubscription: couponCampaigns.usageLimitSubscription,
      usageLimitLifetime: couponCampaigns.usageLimitLifetime,
    })
    .from(couponCampaigns)
    .where(eq(couponCampaigns.id, campaignId))
    /* Locked so two redemptions of one campaign count one after the other: read unlocked, the
       last two seats taken at once each counted without the other's row, neither crossed the
       ceiling, and nobody was told. `NO KEY UPDATE` for the account lock's reason — the insert
       below references this row. */
    .for('no key update')
    .limit(1)

  /* A stamp naming no campaign is a campaign deleted — which cannot happen, since archiving is
     the only retirement — or an id from another installation. Either way there is nothing to
     record and nothing to promise. */
  if (campaign === undefined) return purchase ? { kind: 'cleared' } : UNTOUCHED

  /* The same reader the payment history and the confirmation email use, so a redemption row and
     the line beside it in `/billing` can never name different amounts for one event. */
  const line = readLine(event.eventType, rawBody)
  if (line.plan === null || !isCheckoutPlan(line.plan)) return UNTOUCHED

  const cycle = line.plan === 'lifetime' ? null : line.cycle
  if ((line.plan === 'lifetime') !== (cycle === null)) return UNTOUCHED

  const fullAmount = line.plan === 'lifetime' ? LIFETIME.amount : PRICES[line.plan][cycle as BillingPeriod].amount
  const paidAmount = line.amount ?? discountedAmount(fullAmount, campaign.discountPercent)

  /* Null for the Lifetime, which is bought once and has no period for a duration to run over,
     and null for a campaign whose discount never lapses. */
  const discountEndsAt = cycle === null ? null : discountEnd(campaign.discountMonths, cycle, new Date())

  const recorded = await tx
    .insert(couponRedemptions)
    .values({
      id: randomUUID(),
      campaignId,
      accountOwnerEmail: account.ownerEmail,
      accountId: account.id,
      code: campaign.code,
      discountPercent: campaign.discountPercent,
      plan: line.plan,
      cycle,
      fullAmount,
      paidAmount,
      discountEndsAt,
      /* The pointer back to the delivery that caused this, so `/billing`'s ledger can strike
         the listino through on the one line it belongs to — see the column's own comment. */
      eventId: event.eventId,
    })
    .onConflictDoNothing()
    .returning({ id: couponRedemptions.id })

  /*
   * The insert took nothing, so this campaign is already on this account's ledger: a renewal, a
   * retry Paddle sent again, or the second half of a race. Nothing is written and nothing is
   * cleared — whatever the first delivery decided stands.
   */
  if (recorded.length === 0) {
    /*
     * **A purchase whose insert took nothing is a coupon used twice**, and Paddle has already
     * applied the discount. The once-per-account rule is checked when the transaction is
     * created, never when it is paid, so one account holding two discounted checkouts open and
     * paying both gets the discount on both. Nothing here can take the money back; somebody has
     * to know. A renewal takes nothing too, and is not a purchase — `isNewPurchase` is the line.
     */
    if (purchase) {
      alerts.push(
        `⚠️ Coupon ${campaign.code} applicato una seconda volta all'account ${account.id} ` +
          `(${line.plan}${cycle === null ? '' : ` ${cycle}`}, evento ${event.eventId}): il limite di un uso per account ` +
          'è controllato solo all\'apertura del checkout. Valuta un rimborso parziale su Paddle.',
      )
    }
    return UNTOUCHED
  }

  /*
   * **The ceiling, counted again now that the row exists.** `redeemability` counts it when a
   * checkout opens, and every checkout opened before the ceiling was reached stays payable
   * after it — so a campaign can close over the limit by as many transactions as were open.
   * The row is kept (the sale happened, and `coupon_redemptions` is the ledger of what did);
   * the operator is told.
   */
  const limit = line.plan === 'lifetime' ? campaign.usageLimitLifetime : campaign.usageLimitSubscription
  if (limit !== null) {
    const [held] = await tx
      .select({ n: count() })
      .from(couponRedemptions)
      /* Counted exactly as `redeemability` counts it, or this would fire later than the checkout
         refuses: the Lifetime ceiling over Lifetime rows alone, the subscription ceiling over
         every row the campaign has (`redeemedCount`). */
      .where(
        line.plan === 'lifetime'
          ? and(eq(couponRedemptions.campaignId, campaignId), eq(couponRedemptions.plan, 'lifetime'))
          : eq(couponRedemptions.campaignId, campaignId),
      )
    const n = held?.n ?? 0
    if (n > limit) {
      alerts.push(
        `⚠️ Coupon ${campaign.code} oltre il tetto: ${n} riscatti${line.plan === 'lifetime' ? ' Lifetime' : ''} ` +
          `su ${limit} (account ${account.id}, evento ${event.eventId}). Erano checkout aperti prima che il tetto si chiudesse.`,
      )
    }
  }

  return {
    kind: 'redeemed',
    redemption: {
      code: campaign.code,
      percent: campaign.discountPercent,
      fullAmount,
      paidAmount,
      months: campaign.discountMonths,
      cycle,
      discountEndsAt,
    },
  }
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
async function announcePayment(
  event: IncomingPaddleEvent,
  rawBody: string,
  ownerEmail: string,
  redemption: Redemption | null,
) {
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
      /*
       * **Only on the delivery that actually recorded the redemption**, which is what makes this
       * a purchase confirmation and not a monthly reminder: the stamp rides on every renewal, and
       * `recordCouponRedemption` answers null for all of them. The duration is
       * `durationCopy` — the very sentence /checkout showed above the button — rather than one
       * composed here, because two wordings of one promise is how the two come to differ.
       */
      coupon:
        redemption === null
          ? null
          : {
              code: redemption.code,
              fullAmount: redemption.fullAmount,
              duration:
                redemption.cycle === null
                  ? null
                  : durationCopy(redemption.fullAmount, redemption.paidAmount, redemption.months, redemption.cycle),
            },
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
 * **Both messages name the account by its number and never by its address.** A number and
 * Paddle's ids name nobody on their own, but under the GDPR a pseudonymous identifier is still
 * personal data, so since 2026-09-22 the Privacy Policy says so in all three places it describes
 * Telegram (§2, the processors list, §5) instead of claiming these carry none. Adding a field to
 * an alert — an address above all — is a change to those three sentences, the rule the root
 * `CLAUDE.md` states for the registration notice.
 */
async function endSubscriptionBoughtOut(account: { id: number; paddleSubscriptionId: string | null; plan: string }): Promise<boolean> {
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
    return false
  }

  const paddle = paddleClient()
  if (paddle === null) return false

  try {
    const subscription = await paddle.subscriptions.get(subscriptionId)

    /* Already over, or already on its way out: nothing to do and nothing to report. */
    if (subscription.status === 'canceled') return false
    if (subscription.scheduledChange?.action === 'cancel') return false

    /*
     * **Every status that is not `canceled` gets cancelled, `paused` included**, and that one is
     * the reason this is not a check for `active`. A paused subscription is not a dead one: it
     * resumes and bills, so skipping it would leave exactly the thing this function exists to
     * prevent, sitting quietly for however long the pause lasts. `past_due` is the same
     * argument — dunning that succeeds is a charge.
     */
    await paddle.subscriptions.cancel(subscriptionId, { effectiveFrom: 'next_billing_period' })
    return true
  } catch (error) {
    console.error('endSubscriptionBoughtOut failed', subscriptionId, error)
    await notifyTelegram(
      'purchase',
      `⚠️ Lifetime comprato dall'account ${account.id} ma la subscription ${subscriptionId} non si è riusciti a ` +
        'disdirla: va disdetta a mano su Paddle, altrimenti rinnova accanto al Lifetime.',
    )
    return false
  }
}

export async function applyPaddleEvent(event: IncomingPaddleEvent, rawBody: string): Promise<ApplyOutcome> {
  let effect = effectOf(event)
  /* Which account, and nothing more: every decision is taken on the row as re-read *inside* the
     transaction, locked — see below. */
  const found = effect ? await findAccount(effect.account) : null

  /* What an operator has to hear about this event, sent after the commit — see below. */
  const alerts: string[] = []

  /* The account as it stood before this event, and how the event's subscription relates to it —
     both decided inside the transaction and carried out for the alerts after the commit. */
  /* Asserted rather than annotated: assigned only inside the callback, which TypeScript does
     not follow, so an annotation would leave both narrowed to their initial value below. */
  let account = null as AccountRow | null
  let relation = 'own' as SubscriptionRelation

  /* Carried out of the transaction so the confirmation email can name the coupon. Assigned
     inside it, and only when the insert took a row — a rollback throws before anything reads
     this, and a retry finds `duplicate` and never reaches the insert at all. */
  let coupon: CouponWrite = UNTOUCHED

  const outcome: ApplyOutcome = await db().transaction(async (tx) => {
    /*
     * **The row every decision reads is locked, and read here rather than before the
     * transaction.** Paddle sends `subscription.created`, `.activated` and
     * `transaction.completed` for one checkout within milliseconds of each other, and each
     * decision below — whose subscription this is, whether a stamp is credible, whether a
     * Lifetime may be written over — reads the pointer and the plan. Read outside the
     * transaction, two deliveries both saw the state before either: the second subscription's
     * `.activated` could find the *first* one stored, come out `foreign`, be dropped and be
     * recorded — so its retry answered `duplicate` and it was lost for good. With `.created` and
     * `.activated` carrying the same state that loss is invisible (five two-process runs against
     * the dev database, 2026-09-23, ended identically before and after this change); it costs
     * something only when the dropped event says what the other does not, and the lock makes
     * that impossible rather than unlikely.
     *
     * **Before the ledger insert, and `NO KEY UPDATE`, and both are load-bearing.** That insert
     * references `accounts.id`, so it takes `FOR KEY SHARE` on this same row; taking the lock
     * after it, with `FOR UPDATE`, had two deliveries each holding the share the other's update
     * waited on — a deadlock, measured the same day, which Postgres answers by failing one of
     * them. `NO KEY UPDATE` is what the `UPDATE accounts` below takes anyway, does not conflict
     * with a key share, and still queues a second delivery behind the first.
     */
    const locked = found
      ? ((
          await tx
            .select(ACCOUNT_COLUMNS)
            .from(accounts)
            .where(eq(accounts.id, found.id))
            .for('no key update')
            .limit(1)
        )[0] ?? null)
      : null

    const recorded = await tx
      .insert(paddleEvents)
      .values({
        eventId: event.eventId,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        /* Both columns, and not redundant: the address is the historical fact of who this
           arrived for, the id is the pointer every read uses. */
        accountOwnerEmail: locked?.ownerEmail ?? null,
        accountId: locked?.id ?? null,
        paddleSubscriptionId: effect?.account.paddleSubscriptionId ?? null,
        /* Paddle's own bytes, not a re-serialisation: the payload is evidence, and the day a
           mapping turns out to be wrong this is what the correction is replayed from. */
        payload: rawBody,
      })
      .onConflictDoNothing({ target: paddleEvents.eventId })
      .returning({ eventId: paddleEvents.eventId })

    if (recorded.length === 0) return 'duplicate'
    /* No account, or one deleted between the two reads: the ledger row stays either way. */
    if (!effect || !locked) return effect && !locked ? 'unmatched' : 'applied'
    account = locked

    /* Read before this event's write, which the lock guarantees is the last one committed. */
    relation = subscriptionRelation(
      { plan: readPlan(locked.plan), planStatus: locked.planStatus, paddleSubscriptionId: locked.paddleSubscriptionId },
      event.eventType,
      effect.account.paddleSubscriptionId,
    )

    /*
     * **A subscription event older than one already applied changes nothing.** Paddle retries a
     * failed delivery for three days and promises no order, so a `subscription.updated` can land
     * after a later one of the same subscription and write its older state back — a plan, a
     * status, a stamp — and a `subscription.created` retried for days can come back as `new`
     * after the account has moved to a newer subscription, and move the pointer back to the
     * older one. Paddle's `occurred_at` decides, read off the ledger under the account lock. The
     * event stays recorded; it simply writes nothing and alerts nobody.
     */
    const stale =
      event.eventType.startsWith('subscription.') &&
      (await laterSubscriptionEvent(
        tx,
        event,
        effect.account.paddleSubscriptionId,
        relation === 'new' ? locked.paddleSubscriptionId : null,
      ))
    if (stale) relation = 'own'

    /*
     * **A downgrade stamp is believed only from somebody who held the plan it names** —
     * `stampCredible`. Otherwise the event is read again as if it carried none, so the items
     * Paddle is actually billing decide the plan, and the operator is told: a stamp this app did
     * not write is somebody trying something.
     */
    const sameSubscription =
      locked.paddleSubscriptionId !== null && locked.paddleSubscriptionId === effect.account.paddleSubscriptionId
    if (
      !stale &&
      effect.stampedFrom !== undefined &&
      !stampCredible(readPlan(locked.plan), locked.planStatus, effect.stampedFrom, sameSubscription)
    ) {
      alerts.push(
        `⚠️ Timbro di downgrade non credibile sull'account ${locked.id} (evento ${event.eventId}): dice ` +
          `${PLAN_LABEL[effect.stampedFrom]} ma l'account era su ${PLAN_LABEL[readPlan(locked.plan)]}. Ignorato; ` +
          'controlla su Paddle da dove viene il custom_data di quella subscription.',
      )
      effect = subscriptionEffect(event.data as never, false)
    }

    /*
     * **An adjustment that a later one has already answered changes nothing.** Revoking and
     * restoring a Lifetime are both one status column, so whichever is *applied* last wins —
     * and Paddle retries a failed delivery for three days, so a `chargeback_warning` can land
     * after the `chargeback_warning_reverse` that settled it, and leave a won dispute revoked
     * for good. What decides is Paddle's `occurred_at`, read off the ledger this transaction
     * has just written into; the account lock above is what makes that read complete.
     */
    if (effect.statusOnly != null && (await laterAdjustmentDecides(tx, locked.id, event))) {
      effect = { ...effect, statusOnly: null, restoresLifetime: undefined }
    }

    /*
     * **A subscription event may not write over a Lifetime.** See `mayWritePlan`: the
     * cancellation of the subscription a Lifetime buyer was still paying for arrives *after*
     * the Lifetime is granted, and carries that subscription's own plan and an `expired`
     * status. Writing it would take away the plan they just bought for ever.
     */
    /*
     * And never from a subscription that is not the account's while the account's is running —
     * `subscriptionRelation`'s `foreign`: the old half of two subscriptions paid side by side.
     */
    const foreign = relation === 'foreign'
    const columns =
      !stale && !foreign && mayWritePlan(readPlan(locked.plan), locked.planStatus, event.eventType) ? effect.columns : null
    const movesPointer = !stale && !foreign && effect.account.paddleSubscriptionId !== null

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
    const statusOnly = adjustmentStatusFor(readPlan(locked.plan), effect.statusOnly ?? null)

    /*
     * **The three `accounts.coupon*` columns get their writer back here, and only here.** They
     * lost theirs with the mock checkout on 2026-09-13, so `liveDiscount` has been resolving
     * nothing ever since. They are written in the same statement as the plan columns and inside
     * the same transaction as the ledger row, so an account can never be told it holds a
     * discount that `coupon_redemptions` has no record of granting.
     */
    coupon = await recordCouponRedemption(tx, event, rawBody, locked, alerts)

    if (
      columns ||
      statusOnly ||
      coupon.kind !== 'untouched' ||
      effect.account.paddleCustomerId ||
      movesPointer
    ) {
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
          ...(statusOnly && !columns && effect.restoresLifetime
            ? { plan: 'lifetime', planExpiresAt: null, pendingPlan: null, pendingCycle: null }
            : {}),
          ...(effect.account.paddleCustomerId ? { paddleCustomerId: effect.account.paddleCustomerId } : {}),
          ...(movesPointer ? { paddleSubscriptionId: effect.account.paddleSubscriptionId } : {}),
          ...(coupon.kind === 'redeemed'
            ? {
                couponCode: coupon.redemption.code,
                couponPercent: coupon.redemption.percent,
                discountEndsAt: coupon.redemption.discountEndsAt,
              }
            : {}),
          ...(coupon.kind === 'cleared'
            ? { couponCode: null, couponPercent: null, discountEndsAt: null }
            : {}),
        })
        .where(eq(accounts.id, locked.id))
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
    const before = account
    /*
     * **Nothing after the commit may fail the delivery, and nothing may skip the steps after it.**
     * The event is recorded, so a thrown error here would answer 500, Paddle would retry, and the
     * retry would find `duplicate` and send nothing — the alerts below lost for good, which is a
     * 2xx-on-failure one delivery late. Each step is therefore run on its own and logged.
     */
    const step = async (what: string, run: () => Promise<unknown>) => {
      try {
        await run()
      } catch (error) {
        console.error(`paddle webhook: ${what} failed after commit`, event.eventId, error)
      }
    }

    await step('announcePayment', () =>
      announcePayment(event, rawBody, before.ownerEmail, coupon.kind === 'redeemed' ? coupon.redemption : null),
    )

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
      await step('endSubscriptionBoughtOut', () => endSubscriptionBoughtOut(before))
    }

    /* The stored pointer is the one read *before* this event, which is what makes the old
       subscription nameable here even though the write above has just moved it. */
    if (relation === 'new') {
      alerts.push(
        `⚠️ Seconda subscription sull'account ${before.id}: la nuova ${effect?.account.paddleSubscriptionId} si ` +
          `aggiunge a ${before.paddleSubscriptionId}, che risultava ancora viva — probabilmente due checkout aperti e ` +
          `pagati entrambi. L'app ora gestisce la nuova e ignora gli eventi della vecchia: disdici e rimborsa ` +
          `${before.paddleSubscriptionId} su Paddle. Non disdire la nuova, o l'account resta senza piano.`,
      )
    }

    /*
     * **A won chargeback puts the Lifetime back, so whatever was bought meanwhile must stop.**
     * While the Lifetime was `expired` a subscription could be recorded (`mayWritePlan`), and once
     * the Lifetime is live again every event of that subscription is withheld — it would bill
     * beside the Lifetime for ever with nobody told. The same remedy as a Lifetime bought over a
     * running subscription, and the same function.
     *
     * **Told only when something was actually cancelled.** The stored pointer can be the
     * subscription the reader had *before* the Lifetime, already cancelled — and the alert used to
     * say «bought meanwhile, consider a refund» about it all the same.
     */
    if (effect?.restoresLifetime && readPlan(before.plan) !== 'lifetime' && before.paddleSubscriptionId !== null) {
      await step('endSubscriptionBoughtOut', async () => {
        if (!(await endSubscriptionBoughtOut(before))) return
        alerts.push(
          `⚠️ Chargeback vinto sul Lifetime dell'account ${before.id}: il Lifetime è di nuovo attivo, e la subscription ` +
            `${before.paddleSubscriptionId} comprata nel frattempo viene disdetta a fine periodo. Valuta un rimborso.`,
        )
      })
    }

    for (const alert of alerts) await step('alert', () => notifyTelegram('purchase', alert))
  }

  return outcome
}
