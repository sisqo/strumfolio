/**
 * Every sentence `/accounts` says about a plan, in one place — the list row's badge and
 * status clause, and the detail page's four longer lines (subscription, gift, audit, in
 * force). Plain functions, no `'use server'`/`'use client'`: both the list
 * (`app/accounts/page.tsx`) and the detail page (`app/accounts/[email]/page.tsx`), both
 * server components, import from here directly, and nothing here needs the database or a
 * browser API either.
 *
 * A single module rather than each screen keeping its own copy (PLAN.md, v3.8):
 * two spellings of "what does this account's subscription say" are two spellings that a
 * later edit to one and not the other leaves disagreeing — the exact risk this file exists
 * to close off.
 */

import type { AccountPlanLine } from './read'
import { PLAN_LABEL } from '@/lib/plans/types'
import type { Plan } from '@/lib/plans/types'

/**
 * Which `.plan-badge-*` modifier (`globals.css`) names a given plan's own color, combined
 * with `.badge` for shape — the badge is what answers «why is this account on premium» at a
 * glance (PLAN.md, v3.7). Free carries no color of its own on purpose: see DESIGN.md's
 * "Plan Badges" section.
 */
const PLAN_BADGE_CLASS: Record<Plan, string> = {
  free: 'plan-badge-free',
  standard: 'plan-badge-standard',
  plus: 'plan-badge-plus',
  premium: 'plan-badge-premium',
  lifetime: 'plan-badge-lifetime',
}

/**
 * Whether this account has no plan at all — nothing chosen by the reader, nothing assigned by
 * an operator.
 *
 * `plan` is `notNull().default('free')`, so the column says `'free'` from the instant the row
 * is inserted, before anybody has decided anything. Reading that as "this account is on the
 * Free plan" is the lie this predicate exists to stop: until the mandatory choice is made
 * (PLAN.md, v3.7) there is no plan, which is also exactly why such an account cannot get
 * into the app at all — it is sent to `/pricing` and kept there.
 *
 * Both halves are required, and the second is not redundant. A gift now stamps
 * `plan_chosen_at` itself (`setGrant`), so from that change on a row with nothing chosen has
 * nothing assigned either; but a row gifted in the window before it — or any future path that
 * assigns a plan without stamping — genuinely *has* a plan, and must show that plan rather
 * than "No plan". `stillAwaitingChoice` is what keeps that residual row from reading as a
 * perfectly ordinary premium account.
 */
export function noPlanYet(line: AccountPlanLine): boolean {
  return !line.planChosen && line.effectivePlan === 'free'
}

/**
 * The one row where a plan *is* assigned and yet the gate has still not been passed — see
 * `noPlanYet` on why that combination is now residual rather than ordinary. Worth a marker of
 * its own because the account is locked out of the app while showing a paid badge, which is
 * the kind of state an operator would otherwise have no way to explain.
 */
export function stillAwaitingChoice(line: AccountPlanLine): boolean {
  return !line.planChosen && line.effectivePlan !== 'free'
}

/**
 * The badge for one account: its plan's name and colour, or the "No plan" marker when there is
 * no plan to name. One function rather than each screen deciding, so `/accounts` and
 * `/accounts/[email]` cannot come to disagree about what a row *is*.
 */
export function planBadge(line: AccountPlanLine): { label: string; className: string } {
  if (noPlanYet(line)) return { label: 'No plan', className: 'plan-badge-unchosen' }
  return { label: PLAN_LABEL[line.effectivePlan], className: PLAN_BADGE_CLASS[line.effectivePlan] }
}

/**
 * The status detail that sits beside the plan badge on the list row: dates, which side is
 * winning, a scheduled change — everything the badge's plain plan name does not already say.
 * The plan name is never repeated here.
 *
 * `free` carries no detail at all — a free row is a live subscription of `free`
 * (`planStateFor` reports `source: 'subscription'` for it), and "subscription" on the vast
 * majority of rows would be noise beside a badge that already says "Free". A gift with no end
 * says so, where an open-ended subscription does not: `lifetime` already means no end,
 * whereas a gift that never runs out is the fact an operator would want to see without
 * opening anything.
 *
 * `grace` is the one state that names itself instead of a date, and this has to agree with
 * `subscriptionLine` below about it because an operator reads the row, then the detail page,
 * one after the other. A failing card is virtually always already past period end (which is
 * the whole reason `liveSubscription` ignores dates for `grace`), so `untilOn` here is a day
 * that has gone by while the plan is genuinely still in force: "subscription until
 * 2026-06-30" reads as lapsed and invites an operator to re-gift a plan the customer already
 * holds. Checked before the `untilOn` branch and not inside it, which also covers the
 * dateless `grace` row that would otherwise print a bare "subscription" and say nothing about
 * the retry.
 */
export function planDetail(line: AccountPlanLine): string {
  if (line.effectivePlan === 'free') return ''

  const side = line.source === 'grant' ? 'gift' : 'subscription'
  // Only on the subscription side, and only ahead of its own date: a scheduled downgrade on
  // the subscription while a grant currently wins would not even take effect the day it
  // fires, and naming it here would suggest a change to what the row is showing right now.
  const pendingClause = side === 'subscription' && line.pendingPlan !== null ? `, then ${line.pendingPlan}` : ''
  if (line.status === 'grace' && line.source === 'subscription') return 'subscription, payment retrying'
  if (line.untilOn !== null) return `${side} until ${line.untilOn}${pendingClause}`
  return line.source === 'grant' ? 'gift, no end' : `subscription${pendingClause}`
}

/**
 * What the detail page says instead of the subscription/in-force pair when there is no plan.
 * Both of those sentences would name `free` — the column's default, not a decision anybody
 * made — and the second would go further and call it "in force", which is exactly backwards:
 * nothing is in force, and the account cannot even get past `/pricing`.
 */
export const NO_PLAN_LINE =
  'No plan chosen yet: this account is sent to the pricing page on sign-in and cannot use the app until it picks one.'

/**
 * The subscription side as one sentence, for the detail page: what was bought and where it
 * stands.
 *
 * Printed even when the gift is the side in force, because the alternative — show only the
 * winner — is unreadable as a control panel. A live premium gift under a live premium
 * subscription reports `source: 'subscription'` (the tie goes to the subscription,
 * `planStateFor`), and a winner-only page would tell the operator their gift was never saved.
 *
 * `line.plan`/`.status`/`.planExpiresOn` already come resolved (`listAccountPlans`/
 * `getAccountDetail`, through `resolveSubscription`), so a scheduled downgrade whose date has
 * passed reads here exactly as the account's own gate sees it — never the pre-change plan
 * against a date already gone by. `pendingPlan` is therefore only ever non-null *ahead* of
 * that date, which is exactly when the extra clause belongs.
 */
export function subscriptionLine(line: AccountPlanLine): string {
  if (line.status === 'expired') return `Subscription — ${line.plan}, expired`
  // `grace` deliberately says nothing about the date: a failing card is virtually always
  // already past period end, which is the whole reason `liveSubscription` ignores dates here.
  if (line.status === 'grace') return `Subscription — ${line.plan}, payment retrying`

  const pendingClause = line.pendingPlan === null ? '' : `, then ${line.pendingPlan}`
  if (line.planExpiresOn === null) {
    return line.plan === 'free' ? 'Subscription — free' : `Subscription — ${line.plan}, no end`
  }
  return `Subscription — ${line.plan}, until ${line.planExpiresOn}${pendingClause}`
}

/**
 * The gift side as one sentence, for the detail page.
 *
 * `grantedPlan === null` has **two** meanings and they must not be printed the same way:
 * never gifted, and gifted then withdrawn — `grantedBy` is what tells them apart, because
 * `setGrant` records the caller and the moment on the clear path too. `grantEnded` is the
 * third case: a gift that is still written down but whose own date has passed, which must
 * never be printed as "no end".
 */
export function giftLine(line: AccountPlanLine): string {
  if (line.grantedPlan === null) {
    return line.grantedBy === null ? 'No gift.' : 'No gift: the last one was removed.'
  }
  if (line.grantedUntilOn === null) return `Gift — ${line.grantedPlan}, no end`
  if (line.grantEnded) return `Gift — ${line.grantedPlan}, ended ${line.grantedUntilOn}`
  return `Gift — ${line.grantedPlan} until ${line.grantedUntilOn}`
}

/** Who decided, and when — the giving or the taking away, whichever the row last recorded. */
export function auditLine(line: AccountPlanLine): string | null {
  if (line.grantedBy === null || line.grantedOn === null) return null
  const verb = line.grantedPlan === null ? 'Removed' : 'Given'
  return `${verb} by ${line.grantedBy} on ${line.grantedOn}.`
}

/** Which of the two sides actually decides this account's limits right now. */
export function inForceLine(line: AccountPlanLine): string {
  if (line.effectivePlan === 'free') return 'In force: free.'
  const side = line.source === 'grant' ? 'the gift' : 'the subscription'
  return `In force: ${line.effectivePlan}, from ${side}.`
}
