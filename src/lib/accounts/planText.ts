/**
 * Every sentence `/accounts` says about a plan, in one place — the list row's badge and
 * Status column (`rowStatus`, whose tone also decides the "Needs attention" tab), the
 * "Paying" tab's own predicate, and the detail page's four longer lines (subscription, gift,
 * audit, in force). Plain functions, no `'use server'`/`'use client'`: both the list
 * (`app/accounts/page.tsx`) and the detail page (`app/accounts/[email]/page.tsx`), both
 * server components, import from here directly, and nothing here needs the database or a
 * browser API either.
 *
 * A single module rather than each screen keeping its own copy (v3.8):
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
 * glance (v3.7). Free carries no color of its own on purpose: see DESIGN.md's
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
 * (v3.7) there is no plan, which is also exactly why such an account cannot get
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
 * A gift that was given and then taken away — `grantedPlan` back to null while `grantedBy`
 * still records who cleared it, the second of the two meanings `giftLine` has to tell apart
 * (`setGrant` writes the caller and the moment on the clear path too).
 *
 * A predicate of its own because the *list* could not see this state at all. Such a row ends up
 * `plan: 'free'`, `planChosen: true` (the gift stamped it and clearing never unstamps), which
 * `noPlanYet` reads as false — on every plan column, byte for byte an account that chose Free
 * deliberately. Only the detail page said otherwise, so the one screen built for finding
 * accounts was the one screen that could not find these; `rowStatus` now prints it in the
 * Status column, which is the one place the list can still tell the two apart.
 */
export function giftWithdrawn(line: AccountPlanLine): boolean {
  return line.grantedPlan === null && line.grantedBy !== null
}

/**
 * A gift, not a subscription, decides this account's limits right now — the list row's other
 * gift flag, alongside `giftWithdrawn`. The two never coincide: this reads `source`, which
 * `planStateFor` only ever sets to `'grant'` when a live gift is actually winning, and a gift
 * that is winning cannot also be the withdrawn one.
 */
export function giftActive(line: AccountPlanLine): boolean {
  return line.source === 'grant'
}

/**
 * The badge for one account: its plan's name and colour, or the "No plan" marker when there is
 * no plan to name. One function rather than each screen deciding, so `/accounts` and
 * `/accounts/[email]` cannot come to disagree about what a row *is*.
 *
 * "No plan" is neutral (`.plan-badge-none`), not the danger red it used to borrow from the
 * "Awaiting choice" marker: `Accounts.dc.html` keeps Free and No plan both on the ink ramp and
 * tells them apart in the Status column instead (`rowStatus`) — a row that never chose anything
 * is not an error, it is the ordinary state of every account before its first `/pricing` visit.
 * The list's initials avatar takes the same class, so the row's two coloured marks agree.
 */
export function planBadge(line: AccountPlanLine): { label: string; className: string } {
  if (noPlanYet(line)) return { label: 'No plan', className: 'plan-badge-none' }
  return { label: PLAN_LABEL[line.effectivePlan], className: PLAN_BADGE_CLASS[line.effectivePlan] }
}

/**
 * Whether money is (or is meant to be) changing hands for this account right now — the
 * "Paying" tab on `/accounts`. Reads `subscriptionPlan`, the live subscription alone, never
 * `effectivePlan`: a gifted premium on a free account is exactly what this tab must *not*
 * count. `grace` still counts — a retrying card is a paying customer whose payment is late,
 * and `liveSubscription` reports the plan for it on purpose.
 */
export function isPaying(line: AccountPlanLine): boolean {
  return line.subscriptionPlan !== null && line.subscriptionPlan !== 'free'
}

/** How the Status column is coloured: red for a state an operator should act on, grey for one worth reading, faint for "nothing has happened here yet". */
export type RowTone = 'normal' | 'alert' | 'faint'

export interface RowStatus {
  text: string
  tone: RowTone
}

/**
 * The Status column of the list row (`Accounts.dc.html`): dates, a scheduled change, the
 * gate not yet passed — everything the badge's plain plan name does not already say. The
 * plan name is never repeated here, and neither is the word "gift": the Gift column beside
 * it already tells a gift from a subscription, so the two answer the same question the same
 * way («Until 2027-03-14»).
 *
 * The tone is load-bearing, not decoration: `'alert'` is *the* definition of the "Needs
 * attention" tab — the page filters on it rather than keeping a second list of the same
 * states, so a state added here turns up in that tab without anyone remembering to. Two
 * states earn it, both of them an account that shows a paid badge while its owner cannot
 * actually use the plan: a plan assigned but the mandatory choice still not made
 * (`stillAwaitingChoice`), and a card that is failing (`grace`). A withdrawn gift, an
 * expired subscription, an account that never signed in are all *facts*, not to-dos — grey
 * or faint, never red, so the tab stays a list of things to do rather than a list of
 * everything that ever went slightly wrong.
 *
 * `grace` is checked before the `untilOn` branch and not inside it, and this has to agree with
 * `subscriptionLine` below: a failing card is virtually always already past period end (the whole reason
 * `liveSubscription` ignores dates for `grace`), so «Until 2026-06-30» on such a row would
 * read as lapsed and invite an operator to re-gift a plan the customer already holds.
 *
 * `signInCount` is here for one line only: a "No plan" account that has never signed in is
 * the most ordinary row in the list (a registration that went nowhere) and says so faintly,
 * where the same account *with* sign-ins is somebody who reached `/pricing` and left — the
 * same «Awaiting choice» words the residual assigned-plan case uses, but grey, because there
 * nothing is wrong: the choice is genuinely the reader's to make.
 */
export function rowStatus(line: AccountPlanLine, signInCount: number): RowStatus {
  if (stillAwaitingChoice(line)) return { text: 'Awaiting choice', tone: 'alert' }
  if (noPlanYet(line)) {
    return signInCount === 0 ? { text: 'Never signed in', tone: 'faint' } : { text: 'Awaiting choice', tone: 'normal' }
  }

  if (line.source === 'grant') {
    return { text: line.untilOn === null ? 'No end' : `Until ${line.untilOn}`, tone: 'normal' }
  }

  if (line.effectivePlan === 'free') {
    /*
     * A deliberate Free says nothing — the badge already does. The three rows that look
     * exactly like it on every plan column and are not (`giftWithdrawn`'s reason to exist)
     * each get their one clause here, since this column is now the only place the list can
     * tell them apart from a Free that was chosen.
     */
    if (giftWithdrawn(line)) return { text: 'Gift withdrawn', tone: 'normal' }
    if (line.grantedPlan !== null && line.grantEnded) {
      return { text: `Gift ended ${line.grantedUntilOn}`, tone: 'normal' }
    }
    if (line.plan !== 'free') {
      const when = line.planExpiresOn === null ? '' : ` ${line.planExpiresOn}`
      return { text: `${PLAN_LABEL[line.plan]} expired${when}`, tone: 'normal' }
    }
    return { text: '', tone: 'normal' }
  }

  if (line.status === 'grace') return { text: 'Payment retrying', tone: 'alert' }
  const pendingClause = line.pendingPlan !== null ? `, then ${PLAN_LABEL[line.pendingPlan]}` : ''
  if (line.untilOn !== null) return { text: `Until ${line.untilOn}${pendingClause}`, tone: 'normal' }
  return { text: `No end${pendingClause}`, tone: 'normal' }
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
  const label = PLAN_LABEL[line.plan]
  if (line.status === 'expired') return `Subscription — ${label}, expired.`
  // `grace` deliberately says nothing about the date: a failing card is virtually always
  // already past period end, which is the whole reason `liveSubscription` ignores dates here.
  if (line.status === 'grace') return `Subscription — ${label}, payment retrying.`

  const pendingClause = line.pendingPlan === null ? '' : `, then ${PLAN_LABEL[line.pendingPlan]}`
  if (line.planExpiresOn === null) {
    return line.plan === 'free' ? `Subscription — ${label}.` : `Subscription — ${label}, no end.`
  }
  return `Subscription — ${label}, until ${line.planExpiresOn}${pendingClause}.`
}

/**
 * The gift side as one sentence, for the detail page.
 *
 * `grantedPlan === null` has **two** meanings and they must not be printed the same way:
 * never gifted, and gifted then withdrawn — `grantedBy` is what tells them apart, because
 * `setGrant` records the caller and the moment on the clear path too. `grantEnded` is the
 * third case: a gift that is still written down but whose own date has passed, which must
 * never be printed as "no end".
 *
 * Every branch ends in a full stop, as `subscriptionLine`, `auditLine` and `inForceLine` all
 * now do: the four render as sibling paragraphs in one block on `/accounts/[email]`, and two of
 * them punctuating their sentences while two did not was visible as a mismatch on that screen
 * — this function was even inconsistent with itself, its "No gift." branch already carrying the
 * stop its "Gift — Premium, no end" ones lacked.
 */
export function giftLine(line: AccountPlanLine): string {
  if (line.grantedPlan === null) {
    return line.grantedBy === null ? 'No gift.' : 'No gift: the last one was removed.'
  }
  const label = PLAN_LABEL[line.grantedPlan]
  if (line.grantedUntilOn === null) return `Gift — ${label}, no end.`
  if (line.grantEnded) return `Gift — ${label}, ended ${line.grantedUntilOn}.`
  return `Gift — ${label} until ${line.grantedUntilOn}.`
}

/** Who decided, and when — the giving or the taking away, whichever the row last recorded. */
export function auditLine(line: AccountPlanLine): string | null {
  if (line.grantedBy === null || line.grantedOn === null) return null
  const verb = line.grantedPlan === null ? 'Removed' : 'Given'
  return `${verb} by ${line.grantedBy} on ${line.grantedOn}.`
}

/** Which of the two sides actually decides this account's limits right now. */
export function inForceLine(line: AccountPlanLine): string {
  if (line.effectivePlan === 'free') return `In force: ${PLAN_LABEL.free}.`
  const side = line.source === 'grant' ? 'the gift' : 'the subscription'
  return `In force: ${PLAN_LABEL[line.effectivePlan]}, from ${side}.`
}
