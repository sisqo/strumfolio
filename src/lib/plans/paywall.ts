/**
 * The vocabulary for one screen's worth of upgrade copy: what to call a feature that a plan
 * refused, and the one plan that would grant it — read by `FeaturePaywallModal`, never
 * inlined at a call site, so a fifth gated feature gets the same three sentences the first
 * four already say instead of a hand-worded fifth version of them.
 *
 * A plain module rather than `'use client'` or `'use server'`, for `testCard.ts`'s own
 * reason (see this repo's `CLAUDE.md`): the copy rules below are worth a synchronous test,
 * and neither of those module kinds may export one.
 *
 * This is deliberately narrower than `LimitReason` (`types.ts`). Only the five gates below
 * ever resolve to `'plan-required'` — `entitlements.ts`'s `refused` has three more fields
 * (`createSongbook`, `createSong`, `editRepertoire`) but they only ever answer `frozen` or a
 * numbered cap, never a bare feature refusal — so `PlanUpgradeModal` still owns those two,
 * and this file's copy template ("Included in Plus") never has to say something as vague as
 * "included in Plus" about going over a song count, where the honest answer is a number.
 */

import { PLAN_LABEL, type Plan } from './types'

/** The five `Entitlements['refused']` fields (`entitlements.ts`) that ever answer `'plan-required'`. */
export type PaywallGate = 'lead' | 'booklet' | 'bookletCustomFooter' | 'ukulele' | 'featureRequest'

export interface PaywallFeature {
  /**
   * Lowercase, plural or uncountable, no article — the copy template has no verb for it to
   * agree with, and this is what keeps every rendered sentence grammatical with no
   * conditional logic reading it. `lead`'s "Strum Together" is the one declared exception:
   * a proper noun, capitalized everywhere else in this app (the reading bar's own toggle,
   * the guest screen's `<h1>`, `thanksDevicesCaption`), and "Upgrade to use Strum Together,
   * and everything else in the tier." is exactly as grammatical as the lowercase form would
   * be — the rule's own reason to exist is already satisfied, so lowercasing it here would
   * only misspell a name the rest of the app spells one way.
   */
  label: string
  /** The plan whose row first grants this — see each entry's own comment for the `PLANS` fields it reads. */
  minPlan: Plan
}

export const PAYWALL_FEATURES: Record<PaywallGate, PaywallFeature> = {
  // PLANS.free.mayLead === false, PLANS.standard.mayLead === true.
  lead: { label: 'Strum Together', minPlan: 'standard' },
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
