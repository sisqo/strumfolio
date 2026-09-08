/**
 * Every sentence `/accounts` says about a plan, in one place — the list row's badge and
 * Status column (`rowStatus`, whose tone also decides the "Needs attention" tab), the
 * "Paying" tab's own predicate, and the detail page's summary cells and strips
 * (`giftCell`, `giftHeadline`, `giftDetail`, `subscriptionHeadline`). Plain functions, no
 * `'use server'`/`'use client'`: both the list
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
import { PLAN_LABEL, PLAN_RANK } from '@/lib/plans/types'
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
 * What the detail page's Plan & gift tab says for a `noPlanYet` account, instead of the
 * gift/subscription forms that account has nothing to show yet. The summary strip's own
 * badge and Status cell only go as far as "No plan" / "Awaiting choice" — true, but not the
 * fact an operator opening this tab actually needs: that the account is not merely
 * undecided, it is locked out of the app entirely until it picks one.
 */
export const NO_PLAN_LINE =
  'No plan chosen yet: this account is sent to the pricing page on sign-in and cannot use the app until it picks one.'

/**
 * A gift that was given and then taken away — `grantedPlan` back to null while `grantedBy`
 * still records who cleared it, the second of the two meanings `giftCell` has to tell apart
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
 * `subscriptionHeadline` below: a failing card is virtually always already past period end (the whole reason
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
     * A deliberate Free says nothing — the badge already does. The four rows that look
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
    // A cancellation whose scheduled date has passed resolves `plan` to `'free'` too
    // (`resolveSubscription`), which must not read the same as the row above it —
    // `subscriptionHeadline`'s own "Subscription: cancelled" is what this agrees with.
    if (line.everSubscribed) return { text: 'Cancelled', tone: 'normal' }
    return { text: '', tone: 'normal' }
  }

  if (line.status === 'grace') return { text: 'Payment retrying', tone: 'alert' }
  const pendingClause = line.pendingPlan !== null ? `, then ${PLAN_LABEL[line.pendingPlan]}` : ''
  if (line.untilOn !== null) return { text: `Until ${line.untilOn}${pendingClause}`, tone: 'normal' }
  return { text: `No end${pendingClause}`, tone: 'normal' }
}


/**
 * The Gift cell of the detail page's summary strip (`Account Detail.dc.html`) — the plan
 * written down, and one clause about when it ends.
 *
 * `plan` is null in the two cases there is no plan to name, and they are not the same
 * sentence: never gifted, and gifted then withdrawn, told apart by `grantedBy` exactly as
 * `giftWithdrawn` tells them apart for the list. A cell reading "No gift" over an account
 * whose gift an operator took away last week is the one thing this cell must not say.
 */
export interface GiftCell {
  plan: Plan | null
  text: string
}

export function giftCell(line: AccountPlanLine): GiftCell {
  if (line.grantedPlan === null) {
    return { plan: null, text: line.grantedBy === null ? 'No gift' : 'Gift removed' }
  }
  if (line.grantedUntilOn === null) return { plan: line.grantedPlan, text: 'No end date' }
  return {
    plan: line.grantedPlan,
    text: line.grantEnded ? `ended ${line.grantedUntilOn}` : `until ${line.grantedUntilOn}`,
  }
}

/**
 * The gift strip's own heading on the detail page — what is written down and where it stands,
 * in the mock's voice («Gift of Plus, active until 2026-12-31»), with no full stop: it is a
 * heading over `giftDetail`, not a sentence in a paragraph the way the four lines this
 * replaces were.
 *
 * Null — and only then — when nothing about a gift was ever recorded, which is the page's
 * signal not to draw the strip at all. A *withdrawn* gift still gets a heading, because its
 * `giftDetail` carries the audit of who took it away and when: that is the whole reason this
 * does not simply key on `grantedPlan`.
 */
export function giftHeadline(line: AccountPlanLine): string | null {
  if (line.grantedPlan === null) {
    return line.grantedBy === null ? null : 'No gift: the last one was removed'
  }
  const label = PLAN_LABEL[line.grantedPlan]
  if (line.grantedUntilOn === null) return `Gift of ${label}, with no end date`
  if (line.grantEnded) return `Gift of ${label}, ended ${line.grantedUntilOn}`
  return `Gift of ${label}, active until ${line.grantedUntilOn}`
}

/**
 * The live subscription that keeps this account's gift dormant, or null when nothing does.
 *
 * `>=`, not `>`: `planStateFor` gives a rank tie to the subscription deliberately, so a gift
 * of the plan somebody already pays for changes nothing — which is exactly the case an
 * operator needs told, since the save otherwise succeeds in silence.
 *
 * An *ended* gift is never reported as outranked. The clause this feeds says the gift "only
 * takes over once the subscription lapses", and for a gift whose own date has passed that is
 * false: it will never take over at all, which `giftHeadline` already says.
 */
export function outrankingSubscription(line: AccountPlanLine): Plan | null {
  if (line.grantedPlan === null || line.subscriptionPlan === null || line.grantEnded) return null
  return PLAN_RANK[line.subscriptionPlan] >= PLAN_RANK[line.grantedPlan] ? line.subscriptionPlan : null
}

/**
 * The gift strip's second line: who decided and why, then whether the gift is doing anything.
 *
 * The reason is folded into the audit sentence rather than printed under it — «Given by
 * op@example.com on 2026-06-02 — “Positive review”.» — because they record one decision, not
 * two. Replaces the old `auditLine`/`giftLine` pair, whose four sibling paragraphs the mock
 * collapses into this strip.
 *
 * Null when there is genuinely nothing to add: a gift given with no note by nobody recorded
 * (rows predating `granted_by`), on an account with no subscription to outrank it.
 */
export function giftDetail(line: AccountPlanLine): string | null {
  const said: string[] = []

  if (line.grantedBy !== null && line.grantedOn !== null) {
    const verb = line.grantedPlan === null ? 'Removed' : 'Given'
    const why = line.grantedNote === null ? '' : ` — “${line.grantedNote}”`
    said.push(`${verb} by ${line.grantedBy} on ${line.grantedOn}${why}.`)
  }

  const outranked = outrankingSubscription(line)
  if (outranked !== null) {
    said.push(`${PLAN_LABEL[outranked]} outranks it, so it only takes over once the subscription lapses.`)
  }

  return said.length === 0 ? null : said.join(' ')
}

/**
 * The subscription strip's heading — the paid side alone, never blended with the gift.
 *
 * Printed even when the gift is the side in force, for the reason the sentence it replaces
 * («Subscription — Premium, until …») already gave: a page that shows only the winner tells an
 * operator their gift was never saved. The summary's In force cell is what names the winner.
 *
 * `line.plan`/`.status`/`.planExpiresOn` arrive already resolved through `resolveSubscription`,
 * so a scheduled downgrade whose date has passed reads here as the account's own gate sees it,
 * and `pendingPlan` is non-null only ahead of that date — which is exactly when its clause
 * belongs. The `free` branch is what an account that never bought anything would print — the
 * detail page does not draw the strip at all for one, and says so where it decides — while a
 * cancellation that has already lapsed also resolves `plan` to `'free'` (see `everSubscribed`
 * on `AccountPlanLine`) and gets its own line rather than being read as the same "never
 * bought anything" account.
 */
export function subscriptionHeadline(line: AccountPlanLine): string {
  const label = PLAN_LABEL[line.plan]
  if (line.plan === 'free') return line.everSubscribed ? 'Subscription: cancelled' : 'No subscription'
  if (line.status === 'expired') return `Subscription: ${label}, expired`
  // `grace` deliberately says nothing about the date: a failing card is virtually always
  // already past period end, which is the whole reason `liveSubscription` ignores dates here.
  if (line.status === 'grace') return `Subscription: ${label}, payment retrying`

  const pendingClause = line.pendingPlan === null ? '' : `, then ${PLAN_LABEL[line.pendingPlan]}`
  if (line.planExpiresOn === null) return `Subscription: ${label}, no end`
  return `Subscription: ${label} until ${line.planExpiresOn}${pendingClause}`
}
