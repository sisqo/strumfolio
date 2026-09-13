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
 * cron and no further write — see that function's own comment for the whole design.
 */

import { eq, sql } from 'drizzle-orm'

import { auth } from '@/auth'
import { isOwner } from '@/lib/allowlist'
import { currentUser } from '@/lib/auth/session'
import { liveDiscount } from '@/lib/coupons/discount'
import type { LiveDiscount } from '@/lib/coupons/discount'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'

import { liveSubscription, resolveSubscription } from './entitlements'
import type { SubscriptionColumns } from './entitlements'
import { paymentHistoryFor } from './history'
import type { PaymentHistoryLine } from './history'
import { buildThanksPreview } from './preview'
import { entitlementsOf } from './resolve'
import { readPendingCycle } from './prices'
import { readPendingPlan, readPlan, readPlanStatus } from './types'
import type { Plan, PlanStatus } from './types'

/**
 * What a reader's subscription looks like to every screen that shows one.
 *
 * Called `MockSubscriptionState` until the mock came out, which by then named the wrong thing:
 * these are the columns a real Paddle webhook writes, and the screens reading them are showing
 * a real plan somebody is really paying for.
 */
export interface SubscriptionState {
  plan: Plan
  status: PlanStatus
  expiresAt: Date | null
  /** A downgrade or cancellation (`'free'`) already scheduled, ahead of `expiresAt`. */
  pendingPlan: Plan | null
  /**
   * The coupon still in force on this account, or `null`.
   *
   * Already resolved through `liveDiscount` by the time it reaches this shape, which is the
   * whole point of it being here rather than three raw columns: `discountEndsAt` is a date
   * that passes with no request there to observe it, so anything reading the columns directly
   * would keep promising a reduction that had ended. The same reason `plan`, `status` and
   * `expiresAt` above arrive resolved rather than raw.
   */
  discount: LiveDiscount | null
}

/**
 * The three coupon columns, resolved — read **separately from the subscription ones, and
 * guarded**, which is the whole reason this is its own function.
 *
 * `settings/read.ts` states the rule this follows in as many words: the ordinary state of
 * affairs between deploying code and applying its migration is that the column is not there
 * yet, and a read must survive it. Selected in the same query as the subscription columns,
 * a missing `coupon_code` takes down `loadCheckoutStatus` and `loadPurchaseSummary` — neither
 * of which has a `try` of its own — and with them `/billing`, `/checkout` and `/thanks`, which
 * is the entire payment surface. Split out, the cost of a migration not yet applied is one
 * missing line on `/billing`.
 *
 * That also makes the deploy order stop mattering, which matters here more than usual:
 * production's `DATABASE_URL` is unreachable from this CLI (see `CLAUDE.md`), so `0037` is
 * applied by hand from the Neon console, and code and schema cannot be made to land together.
 *
 * Never the raw columns out of this — see `liveDiscount`, and `SubscriptionState.discount`.
 */
async function liveDiscountOf(accountOwnerEmail: string): Promise<LiveDiscount | null> {
  try {
    const rows = await db()
      .select({
        couponCode: accounts.couponCode,
        couponPercent: accounts.couponPercent,
        discountEndsAt: accounts.discountEndsAt,
      })
      .from(accounts)
      .where(eq(accounts.ownerEmail, accountOwnerEmail))
      .limit(1)

    const row = rows[0]
    return row === undefined ? null : liveDiscount(row, new Date())
  } catch (error) {
    /* Logged, never rethrown, and resolving to "no discount" — the same direction
       `loadNotifySettings` takes for the same reason: a screen without one line is a smaller
       loss than a screen that does not render. */
    console.error('liveDiscountOf failed', error)
    return null
  }
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
 * What plan this account holds, resolved — the read both `/billing` and `/checkout/[plan]` open
 * with.
 *
 * **Deliberately not gated on `mockCheckoutEnabled()`**, and it used to be, which broke
 * `/billing` outright wherever the mock was off. `SONGBOOK_MOCK_CHECKOUT` exists in neither
 * Production nor Preview — checked 2026-09-13 — so every reader who opened Billing from the
 * user menu, a link nothing gates, was told «Billing is not switched on right now». Which plan
 * an account holds is a fact about the account, exactly as `loadFreezeState` and
 * `loadMyPaymentHistory` beside it already argue about theirs; the flag was only ever about
 * whether a *fake purchase* could be made, and a screen that reports a real subscription must
 * not go dark when the fake one is switched off. Gating a read on a write's flag is the shape
 * of the mistake, not the flag itself.
 */
export async function loadCheckoutStatus(): Promise<
  | { ok: false; reason: 'no-session' | 'no-database' }
  | { ok: true; current: SubscriptionState; live: Plan | null }
> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  const [raw, discount] = await Promise.all([
    subscriptionColumnsOf(user.accountOwnerEmail),
    liveDiscountOf(user.accountOwnerEmail),
  ])
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
      discount,
    },
    live: liveSubscription(raw, now),
  }
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
  { ok: true; current: SubscriptionState; live: Plan | null } | { ok: false; reason: 'no-session' | 'no-database' }
> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  const [raw, discount] = await Promise.all([
    subscriptionColumnsOf(user.accountOwnerEmail),
    liveDiscountOf(user.accountOwnerEmail),
  ])
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
      discount,
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
  { ok: true; current: SubscriptionState; live: Plan | null } | { ok: false; reason: 'no-session' | 'not-owner' }
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
 * Marks the mandatory plan-choice step (v3.7) complete when a reader picks
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
