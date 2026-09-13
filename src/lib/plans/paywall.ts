/**
 * The vocabulary for one screen's worth of upgrade copy: what to call a feature that a plan
 * refused, and the one plan that would grant it — read by `FeaturePaywallModal`, never
 * inlined at a call site, so a fifth gated feature gets the same three sentences the first
 * four already say instead of a hand-worded fifth version of them.
 *
 * A plain module rather than `'use client'` or `'use server'`, for `paddleClient.ts`'s own
 * reason (see this repo's `CLAUDE.md`): the copy rules below are worth a synchronous test,
 * and neither of those module kinds may export one.
 *
 * This is deliberately narrower than `LimitReason` (`types.ts`). Only the four gates below
 * ever resolve to `'plan-required'` — `entitlements.ts`'s `refused` has four more fields
 * (`createSongbook`, `createSong`, `editRepertoire`, `lead`) that never do — so
 * `PlanUpgradeModal` still owns the numbered caps and the freeze, and this file's copy
 * template ("Included in Plus") never has to say something as vague as "included in Plus"
 * about going over a song count, where the honest answer is a number.
 *
 * **`lead` was the fifth and is deliberately gone**, and the argument is worth keeping because
 * the obvious repair is the wrong one. Every row of `PLANS` now carries `mayLead: true` — free
 * leads a Strum Together session with one follower — so `refused.lead` can never answer
 * `'plan-required'` and, more to the point, there is no `minPlan` that could be written here
 * without lying: the template would title itself "Included in Standard" about something Free
 * already includes. An entry whose plan cannot be named honestly is not a gate with a stale
 * label, it is not a gate. What free does *not* get is a second follower, and that refusal is
 * counted rather than sold — `admits` (`strumTogether/devices.ts`) turns the guest away and
 * the leader's own panel says so through `audienceSentence`, which names the mechanism and
 * never a purchase.
 */

import { PLAN_LABEL, type Plan } from './types'

/** The four `Entitlements['refused']` fields (`entitlements.ts`) that ever answer `'plan-required'`. */
export type PaywallGate = 'booklet' | 'bookletCustomFooter' | 'ukulele' | 'featureRequest'

export interface PaywallFeature {
  /**
   * Lowercase, plural or uncountable, no article — the copy template has no verb for it to
   * agree with, and this is what keeps every rendered sentence grammatical with no
   * conditional logic reading it.
   *
   * The rule has no exceptions now that `lead` is gone. It had exactly one, and it was that
   * entry: "Strum Together" is a proper noun the rest of the app capitalizes, and the template
   * read grammatically either way. A future proper-noun feature may claim the same exemption
   * on the same grounds — declare it here and in `paywall.test.ts` together, which is the pair
   * that stopped it from being a licence to capitalize anything.
   */
  label: string
  /** The plan whose row first grants this — see each entry's own comment for the `PLANS` fields it reads. */
  minPlan: Plan
}

export const PAYWALL_FEATURES: Record<PaywallGate, PaywallFeature> = {
  // PLANS.free.booklet === 'no', PLANS.standard.booklet === 'branded'.
  booklet: { label: 'printable booklets', minPlan: 'standard' },
  // PLANS.plus.booklet === 'plain', PLANS.premium.booklet === 'custom' — the one tier that
  // may replace the fixed footer line with the reader's own.
  bookletCustomFooter: { label: 'custom booklet footers', minPlan: 'premium' },
  // PLANS.free.ukulele === false, PLANS.standard.ukulele === true. Named for the diagrams
  // `ReadingPanel`'s instrument tap actually gates, matching the pricing table's own "Chord
  // shapes" row rather than the instrument alone.
  ukulele: { label: 'ukulele chord shapes', minPlan: 'standard' },
  // PLANS.standard.featureRequests === 'no', PLANS.plus.featureRequests === 'yes'.
  featureRequest: { label: 'feature requests', minPlan: 'plus' },
}

/** "Included in {plan}" — the title, and the first of the two places `plan` is allowed to appear. */
export function paywallTitle(plan: Plan): string {
  return `Included in ${PLAN_LABEL[plan]}`
}

/**
 * "Upgrade to use {feature}, and everything else in the tier." — deliberately says "the
 * tier" rather than naming `plan` a second time here; the plan name belongs to the title and
 * the primary button alone, see `paywallTitle`/`paywallPrimaryLabel`.
 */
export function paywallBody(feature: string): string {
  return `Upgrade to use ${feature}, and everything else in the tier.`
}

/** "See {plan}" — the primary button, and the second and last place `plan` may appear. */
export function paywallPrimaryLabel(plan: Plan): string {
  return `See ${PLAN_LABEL[plan]}`
}
