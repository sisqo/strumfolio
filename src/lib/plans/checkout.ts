'use server'

/**
 * A stand-in checkout that writes the same columns a real Paddle webhook will one day write —
 * `plan`, `planStatus`, `planExpiresAt`, and now `pendingPlan`/`pendingCycle` for a change
 * scheduled ahead of time — so the entitlement gates, the account menu's plan badge, the
 * freeze path and now a payment history can all be exercised for real before there is an
 * actual payment processor behind any of it. Never touches `paddleCustomerId` or
 * `paddleSubscriptionId`: those two columns are for the real webhook to key on, and seeding
 * them with invented ids would leave rows that look real to a future lookup and resolve to
 * nothing at Paddle. Never touches the `granted*` columns either, for the reason `setGrant`
 * (`accounts/actions.ts`) exists at all: a renewal re-asserting `plan`/`planStatus` would
 * silently erase a gift living in those same columns, which is why the two are kept apart.
 *
 * Deliberately open to any signed-in reader, on whichever account their session currently
 * resolves to — `currentUser().accountOwnerEmail`, which already respects the account
 * switcher, so a global owner testing the free plan's flow buys as whichever account they
 * have switched into. There is no `isOwner` check anywhere in this file, and that is a real,
 * standing decision: while `mockCheckoutEnabled()` answers true, anybody who reaches
 * `/checkout` or `/billing` can give their own account any plan for nothing, because nothing
 * here actually charges a card. `mockCheckoutEnabled` is the only fence, meant to stand for a
 * short test window and come down again — see its own comment in `resolve.ts`.
 *
 * Upgrade timing versus downgrade/cancellation timing, decided once here rather than at every
 * call site: buying a plan that outranks what is currently live applies immediately, the same
 * way Paddle, Stripe and every other subscription seller does it — nobody who just paid more
 * waits for a renewal to see the benefit. Buying a plan that ranks *below* what is currently
 * live, or cancelling outright, is scheduled for the date the account has already paid
 * through instead: `pendingPlan`/`pendingCycle` record what it becomes, and
 * `resolveSubscription` (`entitlements.ts`) is what makes that date self-enforcing with no
 * cron and no further write — see that function's own comment, and `PLAN.md` (v3.6) for the
 * whole design.
 */

import { and, eq, isNotNull, sql } from 'drizzle-orm'

import { auth } from '@/auth'
import { isOwner, normalizeEmail } from '@/lib/allowlist'
import { currentUser } from '@/lib/auth/session'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { notifyTelegram } from '@/lib/telegram/notify'

import { liveSubscription, resolveSubscription } from './entitlements'
import type { SubscriptionColumns } from './entitlements'
import { amountFor, logMockEvent, mostRecentCycleFor, paymentHistoryFor } from './history'
import type { PaymentHistoryLine } from './history'
import { buildThanksPreview } from './preview'
import { entitlementsOf, mockCheckoutEnabled } from './resolve'
import { euro, isCheckoutPlan, periodEnd, readPendingCycle } from './prices'
import type { BillingPeriod } from './prices'
import { PLAN_LABEL, PLAN_RANK, readPendingPlan, readPlan, readPlanStatus } from './types'
import type { Plan, PlanStatus } from './types'
import { sendEmail } from '@/lib/email/send'
import { planChangeEmail, purchaseEmail } from '@/lib/email/templates'

/* The one spelling of a date for a reader, already shared by `/billing`, `/checkout` and
   `/thanks` — imported here rather than kept as this file's own fourth copy of the same
   `toLocaleDateString('en-GB', …)` call. No cycle: `subscriptionCopy.ts` reaches back into
   this module for a *type* only, which erases. */
import { formatPlanDate, scheduledChangeDay } from './subscriptionCopy'

export type MockCheckoutFailure =
  | 'disabled'
  | 'no-session'
  | 'no-database'
  | 'invalid-plan'
  /** Nothing live to cancel/expire/downgrade, or the live plan is `lifetime`, which never is. */
  | 'not-applicable'
  /** `forceExpireNow` only: the caller is not a global owner. */
  | 'not-allowed'
  | 'failed'

export interface MockSubscriptionState {
  plan: Plan
  status: PlanStatus
  expiresAt: Date | null
  /** A downgrade or cancellation (`'free'`) already scheduled, ahead of `expiresAt`. */
  pendingPlan: Plan | null
}

/**
 * The raw subscription columns for one account, read as `SubscriptionColumns` — the narrow
 * shape `liveSubscription`/`resolveSubscription` actually need, with no grant fields to fill
 * with filler values this file never uses (see that interface's own comment).
 */
async function subscriptionColumnsOf(accountOwnerEmail: string): Promise<SubscriptionColumns | null> {
  const rows = await db()
    .select({
      plan: accounts.plan,
      status: accounts.planStatus,
      expiresAt: accounts.planExpiresAt,
      pendingPlan: accounts.pendingPlan,
      pendingCycle: accounts.pendingCycle,
    })
    .from(accounts)
    .where(eq(accounts.ownerEmail, accountOwnerEmail))
    .limit(1)

  const row = rows[0]
  if (row === undefined) return null

  return {
    plan: readPlan(row.plan),
    status: readPlanStatus(row.status),
    expiresAt: row.expiresAt,
    pendingPlan: readPendingPlan(row.pendingPlan),
    pendingCycle: readPendingCycle(row.pendingCycle),
  }
}

/**
 * What the checkout/billing screen needs on arrival: whether it may show at all, what this
 * account already holds, and — the part no screen may work out for itself — whether that
 * holding is still **live**.
 *
 * `live` is `liveSubscription`'s own answer at the one instant this read uses, and it exists
 * because the three screens that render `current` were each deciding "is this plan still on"
 * from `status` alone. That is not the rule: a row keeps `planStatus: 'active'` for ever, and
 * nothing in this repository renews anything, so *every* plan bought here eventually sits at
 * `active` with a `planExpiresAt` in the past while the gates have already dropped the account
 * to free. `/billing` then said "Standard, active until 3 May 2026", `/thanks` said "You're in"
 * over the same past date, and "Cancel my plan" offered an action `mockCancel` would refuse.
 * One answer, computed where the clock and the rule already live — the same reason
 * `subscriptionCopy.ts` exists for the sentence itself.
 *
 * Null means nothing is running: expired, or lapsed by date. `grace` is deliberately non-null
 * — a failing card is not a lapsed customer, and `liveSubscription` carries that rule.
 */
export async function loadCheckoutStatus(): Promise<
  | { ok: false; reason: 'disabled' | 'no-session' | 'no-database' }
  | { ok: true; current: MockSubscriptionState; live: Plan | null }
> {
  if (!mockCheckoutEnabled()) return { ok: false, reason: 'disabled' }
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  const raw = await subscriptionColumnsOf(user.accountOwnerEmail)
  if (raw === null) return { ok: false, reason: 'no-session' }

  const now = new Date()
  const resolved = resolveSubscription(raw, now)
  return {
    ok: true,
    current: { plan: resolved.plan, status: resolved.status, expiresAt: resolved.expiresAt, pendingPlan: resolved.pendingPlan },
    live: liveSubscription(raw, now),
  }
}

/**
 * The cycle this account most recently actually bought `plan` on — what "Change billing
 * cycle" on /pricing needs so it can land on the *other* one, the one there is anything to buy.
 * `CheckoutScreen` cannot answer that from the URL's own `?cycle=`, which merely carries
 * whatever /pricing's Monthly/Yearly toggle happened to be showing — a price-comparison control
 * with no idea what this account is actually paying for — so half the time that link pointed
 * the reader right back at the cycle they were already on.
 *
 * Its own action, deliberately not folded into `loadCheckoutStatus` above even though
 * `CheckoutScreen` calls both on the same mount: `BillingScreen` calls `loadCheckoutStatus` too,
 * already alongside its own `loadMyPaymentHistory` for the payment table on the same screen — a
 * `currentCycle` field bolted onto `loadCheckoutStatus` would have made every /billing load read
 * this same ledger twice. This function is the one place that pays for it, and only the one
 * caller with a use for it does.
 *
 * `null` when this account never bought `plan` through this ledger at all — a plan reached by
 * upgrading, downgrading, buying for the first time, or a manual grant, none of which have an
 * honest "other cycle" to name. `CheckoutScreen` falls back to the URL's own guess then, rather
 * than showing nothing.
 */
export async function loadMostRecentCycleFor(plan: Plan): Promise<BillingPeriod | null> {
  if (!hasDatabase) return null

  const user = await currentUser()
  if (user === null) return null

  return mostRecentCycleFor(plan, await paymentHistoryFor(user.accountOwnerEmail))
}

/**
 * What the thank-you page needs: the plan this account holds right now, resolved.
 *
 * Its own read rather than `loadCheckoutStatus` above, for one reason that matters — it is
 * deliberately **not** gated on `mockCheckoutEnabled()`. A thank-you is read *after* a purchase,
 * so switching the mock off (or replacing it with a real processor, which is that flag's whole
 * purpose) must not turn the page confirming a genuinely active plan into «the test checkout is
 * not switched on right now». Everything else about it is `loadCheckoutStatus`'s own shape,
 * including the `no-session` a missing row answers with — a reader with no account has no
 * purchase to be thanked for either.
 */
export async function loadPurchaseSummary(): Promise<
  { ok: true; current: MockSubscriptionState; live: Plan | null } | { ok: false; reason: 'no-session' | 'no-database' }
> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  const raw = await subscriptionColumnsOf(user.accountOwnerEmail)
  if (raw === null) return { ok: false, reason: 'no-session' }

  const now = new Date()
  const resolved = resolveSubscription(raw, now)
  return {
    ok: true,
    current: {
      plan: resolved.plan,
      status: resolved.status,
      expiresAt: resolved.expiresAt,
      pendingPlan: resolved.pendingPlan,
    },
    /* Same field, same reason, as `loadCheckoutStatus` above — and it matters most here: the
     * thank-you page is the one screen a lapsed plan could still be congratulated on. */
    live: liveSubscription(raw, now),
  }
}

/**
 * What `/thanks?preview=<plan>` shows instead of `loadPurchaseSummary` above — a global owner
 * looking at made-up data for a plan of their choosing, so the thank-you page can be checked
 * for every plan (including `free`'s own "nothing bought yet" state) without running the mock
 * checkout for real. Re-checks `isOwner` itself rather than trusting the page's own gate — the
 * same discipline `sendTestEmail` (`lib/email/actions.ts`) already follows for `/emails`, and
 * for the same reason: this is the one thing in this file that hands back a *fabricated*
 * subscription state, so nobody who isn't already trusted to see fake numbers should reach it.
 *
 * `auth()` and not `currentUser()` — the signed-in identity, never whichever account the
 * switcher currently points at, matching `sendTestEmail`'s own comment on why: owner-ness is a
 * property of the person, not of whatever account they happen to be looking at.
 *
 * `planParam` arrives as `unknown` and is normalised with `readPlan` here rather than trusted
 * from the caller, so a stale or hand-edited `?preview=` value falls back to `free`'s own state
 * instead of rendering with an unrecognised plan.
 */
export async function loadThanksPreview(
  planParam: unknown,
): Promise<
  { ok: true; current: MockSubscriptionState; live: Plan | null } | { ok: false; reason: 'no-session' | 'not-owner' }
> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return { ok: false, reason: 'no-session' }
  if (!isOwner(email, process.env.ALLOWED_EMAILS)) return { ok: false, reason: 'not-owner' }

  const current = buildThanksPreview(readPlan(planParam))
  /*
   * `current.plan`, deliberately, and never `liveSubscription` over the fabricated row: every
   * state `buildThanksPreview` builds is a live one by construction, and running the real rule
   * over `SAMPLE_RENEWAL` would make this preview quietly start rendering "This plan has ended"
   * the day that fixed sample date goes by — a preview that changes with the calendar is the
   * one thing `preview.ts` exists to prevent.
   */
  return { ok: true, current, live: current.plan }
}

/**
 * One account's payment history, self-scoped — the reader's own, whichever account their
 * session currently resolves to, the same rule every write in this file already follows.
 */
export async function loadMyPaymentHistory(): Promise<
  { ok: true; history: PaymentHistoryLine[] } | { ok: false; reason: 'no-session' | 'no-database' }
> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  return { ok: true, history: await paymentHistoryFor(user.accountOwnerEmail) }
}

/**
 * Whether this account's repertoire is over its plan's limits — the freeze, asked as a
 * question instead of waiting to be answered by a refusal.
 *
 * Until now `frozen` reached no screen at all, in either direction: it was computed inside
 * `entitlementsFor` for the gates, and a reader met it only as `PlanUpgradeModal`'s «Over your
 * plan's limit» the moment they tried to save something. Which means the state a downgrade or
 * a lapse leaves behind — the whole repertoire readable, nothing editable, only deletions
 * accepted — was invisible until it bit. This is what lets `/billing` and the home screen say
 * it first.
 *
 * `entitlementsOf`, never a second reading of the same rule: `over()` lives in
 * `entitlementsFor` and the notice has to agree with the refusal that follows it, on the same
 * counts and the same caps. That costs the row read plus the two counts, which is why this is
 * its own action rather than a field bolted onto `loadCheckoutStatus` — `/checkout` asks
 * nothing about the freeze and must not pay for it.
 *
 * Deliberately **not** gated on `mockCheckoutEnabled()`, unlike every other function here: a
 * repertoire over its caps is a fact about the account, not about whether a mock checkout is
 * open for business. (It is in `checkout.ts` all the same because this is where the reads the
 * plan screens make already live — the same reason `loadMyPaymentHistory` is here.)
 *
 * Its callers all fail *open* on `ok: false`, and that direction is the point: a banner
 * claiming a freeze that is not there is worse than a freeze discovered a moment later by the
 * refusal that was always going to explain it.
 */
export async function loadFreezeState(): Promise<
  { ok: true; frozen: boolean } | { ok: false; reason: 'no-session' | 'no-database' }
> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  return { ok: true, frozen: (await entitlementsOf(user.accountOwnerEmail)).frozen }
}

/**
 * Marks the mandatory plan-choice step (PLAN.md, v3.7) complete when a reader picks
 * Free — the one plan `mockPurchase` does not sell at all (`CHECKOUT_PLANS` is
 * `PAID_PLANS + lifetime`; `isCheckoutPlan('free')` is false). Choosing Free is not a
 * purchase: `plan`/`planStatus` are already `'free'`/`'active'` from the column defaults, so
 * this writes nothing there, and it logs nothing to `paddle_events` either — that table is a
 * list of real transactions, and a zero-euro row nobody actually bought does not belong in it.
 *
 * Deliberately does **not** check `mockCheckoutEnabled()`, unlike every other write in this
 * file. That flag governs the *paid* checkout only; the Free exit from the mandatory-choice
 * gate in `(home)/page.tsx` has to keep working even while the paid flow is switched off — the
 * alternative is a deployment with `SONGBOOK_PLANS=on` and `SONGBOOK_MOCK_CHECKOUT=off` where a
 * brand-new account has no way through the gate at all.
 *
 * `sql\`coalesce(...)\`` rather than a bare `now()`: calling this twice — a reader who taps
 * "Start free" again, or lands back on `/pricing` after already choosing — must never overwrite
 * a genuine first-activation date with a later one. `mockPurchase` writes the identical
 * expression for the same reason, on the other exit from the same gate.
 */
export async function activatePlanChoice(): Promise<{ ok: true } | { ok: false; reason: 'no-session' | 'no-database' | 'failed' }> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  try {
    const updated = await db()
      .update(accounts)
      .set({ planChosenAt: sql`coalesce(${accounts.planChosenAt}, now())` })
      .where(eq(accounts.ownerEmail, user.accountOwnerEmail))
      .returning({ ownerEmail: accounts.ownerEmail })
    if (updated.length === 0) return { ok: false, reason: 'failed' }
  } catch (error) {
    console.error('activatePlanChoice failed', error)
    return { ok: false, reason: 'failed' }
  }

  return { ok: true }
}

/**
 * "Buys" a plan for the account this session is on. An upgrade (or a first purchase, or
 * re-buying the plan already live) applies at once: `plan`, `planStatus: 'active'`, an expiry
 * one billing period out, and any previously scheduled downgrade/cancellation is dropped —
 * changing your mind about leaving is expressed by buying back in, not by a separate control.
 * A genuine downgrade — a lower-ranked plan than what is currently live — leaves
 * `plan`/`planStatus`/`planExpiresAt` untouched and only schedules `pendingPlan`/
 * `pendingCycle`, so the account keeps what it already paid for until that date arrives.
 *
 * `lifetime`'s `planExpiresAt` is null — never, the same value `free` carries — rather than a
 * special-cased date far in the future. And once `lifetime` is the live plan, no further
 * purchase through this function is offered: there is no date on that row for a downgrade to
 * fire on, and nothing higher-ranked exists to upgrade to, so this refuses with
 * `not-applicable` rather than silently doing nothing useful with either branch.
 *
 * The rank comparison is against `liveSubscription` — the subscription side alone — never
 * against a blended `effectivePlan` that could include a manual grant: an account gifted
 * `lifetime` while paying for `standard` must still read a `plus` purchase as an upgrade of
 * the subscription, not as a downgrade against the gift sitting beside it.
 *
 * `plan` arrives as a bare `string`, not `CheckoutPlan`: it comes from a route param and a
 * form value, neither of which the type system can vouch for, and `isCheckoutPlan` is the
 * actual check — a value this cannot recognise is refused rather than normalised, unlike
 * `readPlan`, which would fall back to `'free'` and write that to a paying account's row
 * with no error for a typo to be seen in.
 */
export async function mockPurchase(
  plan: string,
  cycle: BillingPeriod,
): Promise<{ ok: true; effect: 'immediate' | 'scheduled' } | { ok: false; reason: MockCheckoutFailure }> {
  if (!mockCheckoutEnabled()) return { ok: false, reason: 'disabled' }
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  if (!isCheckoutPlan(plan)) return { ok: false, reason: 'invalid-plan' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  try {
    const now = new Date()
    const raw = await subscriptionColumnsOf(user.accountOwnerEmail)
    if (raw === null) return { ok: false, reason: 'failed' }

    const currentLive = liveSubscription(raw, now)
    if (currentLive === 'lifetime') return { ok: false, reason: 'not-applicable' }

    /*
     * A downgrade is scheduled for the date the account has already paid through — so a
     * subscription with **no such date** has nothing to schedule against, and writing
     * `pendingPlan` on it would be a change that never fires: `resolveSubscription` returns a
     * null-`expiresAt` row untouched, for ever. That row is reachable, not hypothetical — it is
     * exactly what a scheduled change leaves behind once it has fired (the new plan is stored
     * with `expiresAt: null`, since nothing here models renewals), so the *second* downgrade
     * anybody makes used to be silently inert: the screen said "scheduled", the ledger logged
     * it, and the date it was waiting for did not exist. With no paid period left to protect,
     * applying it at once is both the honest answer and the generous one.
     *
     * **Asked of the resolved row, never of the raw column**, and the difference is the whole
     * correctness of the sentence `/checkout/[plan]` prints before the button. That screen
     * mirrors this branch from `loadCheckoutStatus`'s `current`, which is resolved; a raw read
     * here disagrees with it on precisely the row above — where the raw column still holds the
     * old, already-past date while the resolved view has collapsed to `null`. The screen would
     * promise a purchase and get a scheduled change back, and the change would then apply on
     * the next page load anyway, leaving a `scheduled_change` row and no receipt for what was
     * in fact an immediate purchase.
     *
     * `grace` keeps its date through `resolveSubscription`'s own early return, so this stays
     * false there and a failing card's downgrade is still scheduled rather than applied — the
     * rule that status exists for, preserved without a second mention of it here.
     */
    /* Resolved once and kept, rather than resolved inline for `nothingPaidThrough` alone: the
       scheduled branch at the foot of this function needs the same row's own `expiresAt` to
       tell the customer which day their change lands on, and two calls are two chances for
       the sentence and the decision to be read off different answers. */
    const resolved = resolveSubscription(raw, now)
    const nothingPaidThrough = resolved.expiresAt === null
    const isUpgradeOrSame =
      plan === 'lifetime' || currentLive === null || nothingPaidThrough || PLAN_RANK[plan] >= PLAN_RANK[currentLive]

    if (isUpgradeOrSame) {
      /*
       * The three facts this whole branch reports, derived once at the top.
       *
       * `lifetime` is the one plan with no cycle to bill and no date to renew on, and that
       * single narrowing used to be rewritten as `plan === 'lifetime' ? … : …` at four separate
       * points here — the column write, the ledger row, the Telegram line and the receipt — as
       * if the four could legitimately disagree. `billedCycle` is that decision, made once;
       * `expiresAt` and `amount` follow from it, so the row, the notification and the email
       * cannot name different dates or different prices. `amount` in particular is `amountFor`,
       * the same function `logMockEvent` uses for the `paddle_events` row it writes below.
       */
      const billedCycle = plan === 'lifetime' ? null : cycle
      const expiresAt = billedCycle === null ? null : periodEnd(billedCycle, now)
      const amount = amountFor(plan, billedCycle)

      const updated = await db()
        .update(accounts)
        .set({
          plan,
          planStatus: 'active',
          planExpiresAt: expiresAt,
          pendingPlan: null,
          pendingCycle: null,
          /*
           * See `activatePlanChoice`'s own comment on the `coalesce`: a plan bought directly,
           * with no Free step first, still has to satisfy the mandatory-choice gate
           * (PLAN.md, v3.7) on its own — but never by overwriting a real first-activation
           * date already sitting on a later upgrade or re-purchase.
           *
           * `now.toISOString()`, never the `Date` itself. Interpolating a JS `Date` into a raw
           * `sql` template makes it a bind parameter, and postgres.js refuses one: «The "string"
           * argument must be of type string or an instance of Buffer or ArrayBuffer. Received an
           * instance of Date». The whole UPDATE then throws, the `catch` below turns it into
           * `failed`, and the checkout screen says «That didn't go through. Try again.» on every
           * single purchase — which is exactly what shipped, and what this line is fixing.
           * Verified against the real database, all three forms: the `Date` throws, `now()` and
           * this one both work. (Drizzle converts a `Date` fine in a plain `.set({ col: date })`
           * — as `planExpiresAt` two lines up does — because that path knows the column's type.
           * Inside `sql` there is no column to infer from, so the driver sees a bare object.)
           *
           * A string rather than SQL's own `now()`: this way the stamp is the same instant as
           * `planExpiresAt` above and as the logged event below, instead of the database's clock
           * a few milliseconds later. `activatePlanChoice` uses `now()` because it has no JS
           * clock of its own to share — don't "unify" the two into one form without that in mind.
           */
          planChosenAt: sql`coalesce(${accounts.planChosenAt}, ${now.toISOString()})`,
        })
        .where(eq(accounts.ownerEmail, user.accountOwnerEmail))
        .returning({ ownerEmail: accounts.ownerEmail })
      if (updated.length === 0) return { ok: false, reason: 'failed' }

      await logMockEvent({
        accountOwnerEmail: user.accountOwnerEmail,
        action: 'purchase',
        plan,
        cycle: billedCycle,
      })

      const label = `${plan}${billedCycle === null ? '' : `/${billedCycle}`}`
      console.warn(`mock checkout: ${user.accountOwnerEmail} => ${label}`)
      /* The amount is what makes this line worth reading on a phone: «premium/year» says what
       * was bought, «€99» says what came in. `una tantum` for lifetime, which has no cycle to
       * bill again. A plan with no price to name (none today — `free` is not sold here) simply
       * omits the clause rather than printing an empty one. */
      const paidClause = amount === null ? '' : ` · ${euro(amount)}${billedCycle === null ? ' una tantum' : ''}`
      await notifyTelegram('purchase', `💰 Acquisto: ${user.accountOwnerEmail} → ${label}${paidClause}`)

      /*
       * The thank-you, sent only on this branch: a scheduled downgrade below is not a purchase
       * to thank anybody for, and `mockCancel` certainly is not. Last of the three side effects
       * and after the write, like the other two — `sendEmail` never throws (see its own comment),
       * so a mail that fails cannot undo a plan the account has already been given.
       *
       * To `accountOwnerEmail`, not `user.email`: the receipt belongs to the account whose plan
       * just changed, which is the same address the ledger row and the Telegram line already
       * name. Worth knowing while the mock is open, since the two come apart — a global owner
       * switched into a customer's account to test a purchase sends that *customer* this email,
       * not themselves.
       */
      /* `endsOn`, not `renewsOn` — this is `planExpiresAt`, and nothing in this file or any
         other renews it. See `purchaseEmail`'s own comment on the rename. */
      const endsOn = expiresAt === null ? null : formatPlanDate(expiresAt)
      await sendEmail({
        to: user.accountOwnerEmail,
        ...purchaseEmail({ planLabel: PLAN_LABEL[plan], amount, cycle: billedCycle, endsOn }),
      })

      return { ok: true, effect: 'immediate' }
    }

    // A genuine downgrade: scheduled for `raw.expiresAt`, which is left untouched here.
    const updated = await db()
      .update(accounts)
      .set({ pendingPlan: plan, pendingCycle: cycle })
      .where(eq(accounts.ownerEmail, user.accountOwnerEmail))
      .returning({ ownerEmail: accounts.ownerEmail })
    if (updated.length === 0) return { ok: false, reason: 'failed' }

    await logMockEvent({ accountOwnerEmail: user.accountOwnerEmail, action: 'scheduled_change', plan, cycle })
    console.warn(`mock checkout: ${user.accountOwnerEmail} => ${plan}/${cycle} scheduled`)
    await notifyTelegram('downgrade', `📉 Downgrade programmato: ${user.accountOwnerEmail} → ${plan}/${cycle}`)

    /*
     * The customer's own copy of what was just arranged — the counterpart of the receipt the
     * immediate branch sends, for the branch where *nothing* arrives in an inbox until now.
     * The Telegram line above goes to the operator, and `/checkout`'s own inline sentence is
     * gone the moment the tab is closed.
     *
     * `currentLive` is non-null here by the `isUpgradeOrSame` test above — a null one is an
     * immediate purchase and never reaches this branch.
     *
     * `scheduledChangeDay`, never `formatPlanDate` on the column: this row's `expiresAt` is
     * non-null by `nothingPaidThrough`, but non-null is not the same as *nameable*. A `grace`
     * row keeps its own date through `resolveSubscription`'s early return and that date is
     * virtually always already in the past, so naming it here would tell a customer whose card
     * is retrying that their downgrade lands on a day that has gone. Answering `null` puts the
     * email on its dateless scheduled sentence instead, which is true in both cases.
     */
    await sendEmail({
      to: user.accountOwnerEmail,
      ...planChangeEmail({
        fromLabel: PLAN_LABEL[currentLive ?? 'free'],
        toLabel: PLAN_LABEL[plan],
        effect: { day: scheduledChangeDay(resolved.status, resolved.expiresAt) },
      }),
    })

    return { ok: true, effect: 'scheduled' }
  } catch (error) {
    console.error('mockPurchase failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * "Cancels" — schedules the account to lapse to free once its already-paid-for period ends,
 * by writing `pendingPlan: 'free'` and leaving `plan`/`planStatus`/`planExpiresAt` exactly as
 * they are. Nothing further has to happen on that date: `resolveSubscription` reads a
 * `pendingPlan` of `'free'` past `expiresAt` exactly the way it would read no pending change
 * at all having ever been written — a lapsed subscription is a lapsed subscription either
 * way. Refuses `not-applicable` when there is nothing live to cancel (already free, already
 * expired) or when the live plan is `lifetime`, which has no period to cancel at the end of —
 * see `mockPurchase`'s own comment on why lifetime refuses both directions.
 *
 * The one exception is a live plan carrying **no** `planExpiresAt`, which cancels immediately
 * rather than at a date that does not exist — `effect` says which of the two happened, so the
 * screen can word it correctly instead of promising a period end either way.
 *
 * For a way to end a plan's entitlements *right now* rather than at the paid-until date, see
 * `forceExpireNow` — kept as a distinct, explicitly test-only action, because the freeze path
 * has to stay exercisable without waiting out a real calendar date.
 */
export async function mockCancel(): Promise<
  { ok: true; effect: 'immediate' | 'scheduled' } | { ok: false; reason: MockCheckoutFailure }
> {
  if (!mockCheckoutEnabled()) return { ok: false, reason: 'disabled' }
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  try {
    const now = new Date()
    const raw = await subscriptionColumnsOf(user.accountOwnerEmail)
    if (raw === null) return { ok: false, reason: 'failed' }

    const currentLive = liveSubscription(raw, now)
    if (currentLive === null || currentLive === 'free' || currentLive === 'lifetime') {
      return { ok: false, reason: 'not-applicable' }
    }

    /*
     * The same hole `mockPurchase`'s own `nothingPaidThrough` closes, on the other exit from a
     * plan: with no `planExpiresAt` there is no period end for a cancellation to wait for, so
     * `pendingPlan: 'free'` would sit on the row unread for ever while the screen reported it as
     * scheduled. Nothing is being taken away early here — a row with no expiry is one nobody has
     * paid through to any date — so the cancellation simply happens.
     *
     * Resolved rather than raw, for the reason spelled out beside `nothingPaidThrough`: the two
     * exits from a plan must not disagree about what "already paid through" means, and the
     * resolved view is the one every screen is looking at. `grace` keeps its date and so stays
     * on the scheduled side.
     */
    const resolved = resolveSubscription(raw, now)
    const immediate = resolved.expiresAt === null

    const updated = await db()
      .update(accounts)
      .set(
        immediate
          ? { plan: 'free', planStatus: 'active', planExpiresAt: null, pendingPlan: null, pendingCycle: null }
          : { pendingPlan: 'free', pendingCycle: null },
      )
      .where(eq(accounts.ownerEmail, user.accountOwnerEmail))
      .returning({ ownerEmail: accounts.ownerEmail })
    if (updated.length === 0) return { ok: false, reason: 'failed' }

    await logMockEvent({
      accountOwnerEmail: user.accountOwnerEmail,
      action: immediate ? 'cancelled_now' : 'scheduled_change',
      plan: 'free',
      cycle: null,
    })
    console.warn(`mock checkout: ${user.accountOwnerEmail} => cancel ${immediate ? 'now' : 'scheduled'}`)
    await notifyTelegram(
      'cancellation',
      `🚫 Cancellazione ${immediate ? 'immediata' : 'programmata'}: ${user.accountOwnerEmail} (era ${currentLive})`,
    )

    /*
     * The written trace a cancellation never had. Same template as the scheduled downgrade
     * above, with `toLabel` of «Free» being the whole of what makes it read as a cancellation.
     *
     * `effect` is read off the same `immediate` this function already decided its *write* with,
     * so the email and the row can never describe two different things — and the scheduled side
     * asks `scheduledChangeDay` rather than formatting the column, for the `grace` reason given
     * at the foot of `mockPurchase`.
     */
    await sendEmail({
      to: user.accountOwnerEmail,
      ...planChangeEmail({
        fromLabel: PLAN_LABEL[currentLive],
        toLabel: PLAN_LABEL.free,
        effect: immediate ? 'now' : { day: scheduledChangeDay(resolved.status, resolved.expiresAt) },
      }),
    })

    return { ok: true, effect: immediate ? 'immediate' : 'scheduled' }
  } catch (error) {
    console.error('mockCancel failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * "I changed my mind" — drops a scheduled downgrade/cancellation without touching anything
 * else, the free/instant counterpart to re-buying the current plan through `mockPurchase`
 * (which also clears it, but re-asserts fresh dates and logs a purchase). Refuses
 * `not-applicable` when nothing is actually scheduled, checked with the same `UPDATE …
 * WHERE … RETURNING` idiom `setGrant` uses for its own "does this address even have a row"
 * question — a plain `set()` against nothing pending would report success for a no-op.
 */
export async function clearPendingChange(): Promise<{ ok: true } | { ok: false; reason: MockCheckoutFailure }> {
  if (!mockCheckoutEnabled()) return { ok: false, reason: 'disabled' }
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  try {
    const updated = await db()
      .update(accounts)
      .set({ pendingPlan: null, pendingCycle: null })
      .where(and(eq(accounts.ownerEmail, user.accountOwnerEmail), isNotNull(accounts.pendingPlan)))
      .returning({ ownerEmail: accounts.ownerEmail, plan: accounts.plan })
    if (updated.length === 0) return { ok: false, reason: 'not-applicable' }

    await logMockEvent({
      accountOwnerEmail: user.accountOwnerEmail,
      action: 'kept_current',
      plan: readPlan(updated[0].plan),
      cycle: null,
    })
    console.warn(`mock checkout: ${user.accountOwnerEmail} => kept ${readPlan(updated[0].plan)}`)
    // The one write in this file that used to notify nobody: an operator would see a
    // scheduled downgrade or cancellation come in and never learn if the customer reversed
    // it — the same event name as the `paddle_events` row just logged above.
    await notifyTelegram('kept_current', `↩️ Piano confermato: ${user.accountOwnerEmail} resta su ${readPlan(updated[0].plan)}`)
  } catch (error) {
    console.error('clearPendingChange failed', error)
    return { ok: false, reason: 'failed' }
  }

  return { ok: true }
}

/**
 * Ends the live plan's entitlements **right now** instead of at its paid-until date, by
 * writing `planStatus: 'expired'` directly — the one way left, after `mockCancel` started
 * deferring to period end, to exercise the freeze/grace path without waiting out a real
 * calendar date. Clears any scheduled change too: there is nothing left for it to fire into.
 * Refuses `not-applicable` under the same two conditions `mockCancel` does.
 *
 * Takes an explicit `ownerEmail` rather than reading `currentUser().accountOwnerEmail`, and
 * checks `isOwner` inside itself before any read or write — restored to the admin's
 * `/accounts/[email]` (`PLAN-account-admin.md`, point 5), where the page is already
 * `isOwner`-gated, but this function does not lean on that alone: it used to sit on
 * `/billing` behind nothing but the words "test only", which — with `SONGBOOK_MOCK_CHECKOUT`
 * on in production — put "expire my plan right now" in front of every paying customer, on
 * the screen they open to manage what they paid for (v3.11). A label is not a permission,
 * which is why this checks its own caller the way every other write in this file does,
 * rather than trusting whichever screen happens to render the button. The explicit target
 * also avoids the self-scoped alternative — an operator having to "Enter as this account"
 * first just to expire it — which is both an extra step and a real chance of expiring the
 * wrong one. Zero callers before this change (confirmed by grep across the repo), so the
 * signature change breaks nothing existing.
 *
 * `mockCheckoutEnabled()` still gates it, deliberately not bypassed for the admin path: it
 * is the leva of a still-fake checkout system, not a second access control alongside
 * `isOwner`. Once `SONGBOOK_MOCK_CHECKOUT` is off for good (real Paddle live), this stops
 * working along with the rest of the mock checkout — correctly, since forcing
 * `planStatus: 'expired'` locally with no real Paddle event behind it would desynchronize
 * the account from its actual subscription state.
 */
export async function forceExpireNow(ownerEmail: string): Promise<{ ok: true } | { ok: false; reason: MockCheckoutFailure }> {
  if (!mockCheckoutEnabled()) return { ok: false, reason: 'disabled' }
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'not-allowed' }
  }

  const target = normalizeEmail(ownerEmail)

  try {
    const now = new Date()
    const raw = await subscriptionColumnsOf(target)
    if (raw === null) return { ok: false, reason: 'failed' }

    const currentLive = liveSubscription(raw, now)
    if (currentLive === null || currentLive === 'free' || currentLive === 'lifetime') {
      return { ok: false, reason: 'not-applicable' }
    }

    const updated = await db()
      .update(accounts)
      .set({ planStatus: 'expired', pendingPlan: null, pendingCycle: null })
      .where(eq(accounts.ownerEmail, target))
      .returning({ ownerEmail: accounts.ownerEmail })
    if (updated.length === 0) return { ok: false, reason: 'failed' }

    await logMockEvent({ accountOwnerEmail: target, action: 'force_expired', plan: currentLive, cycle: null })
    console.warn(`mock checkout: ${target} => forced expiry (admin)`)
  } catch (error) {
    console.error('forceExpireNow failed', error)
    return { ok: false, reason: 'failed' }
  }

  return { ok: true }
}
