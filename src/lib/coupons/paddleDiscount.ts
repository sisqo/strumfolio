/**
 * One campaign, translated into the Paddle Discount entities that actually take the money off.
 *
 * Pure and `node:test`-covered, like `discount.ts` beside it: no database, no SDK, no clock and
 * no `process.env` — the price ids arrive as a resolver the caller supplies, so the same
 * function serves the sandbox, a preview and production without knowing which it is in.
 * `paddleDiscountSync.ts` is the half that talks to Paddle.
 *
 * **Three entities per campaign, and the reason is arithmetic rather than taste.** Paddle's
 * `maximum_recurring_intervals` counts *billing periods*, and `coupon_campaigns.discount_months`
 * is one figure in *months*, so three months is `3` on a monthly price and `1` on a yearly one.
 * A single discount cannot hold both numbers. `couponCampaigns` has carried
 * `paddle_discount_id_monthly` / `_annual` / `_lifetime` since `0037_coupons.sql` for exactly
 * this, with the translation written out in its own comment; this file is that comment made
 * executable. The reference document's `ABC` / `ABC-Y` / `ABC-LT` terna reappears here and only
 * here — one campaign row still, three entities derived from it, never three rows to keep in
 * step.
 *
 * **Measured against the sandbox on 2026-09-14**, because a field being accepted is not a field
 * being applied — the same lesson `tax_mode` taught in the root `CLAUDE.md`. A 30% discount
 * restricted to Standard monthly, attached to a transaction by its id, answered
 * `subtotal 349, discount 105, total 244`: €2.44, which is the cent-for-cent figure
 * `discountedAmount` computes and the row the commercial deck's own promo table holds. So
 * Paddle rounds this the way this repository does, and /pricing's struck price is the price
 * Paddle charges rather than one that merely looks like it.
 *
 * And the duration, measured in the same run: a discount of three intervals attached to a
 * monthly subscription came back `starts_at 2026-10-13` / `ends_at 2027-01-13` — three whole
 * months from the start, which is `discountEnd`'s own arithmetic. That is what lets
 * `accounts.discount_ends_at` be **computed once at redemption** instead of read back from
 * Paddle later: the two agree by construction, and this repository's standing rule is that two
 * writers for one fact is how the two come to disagree.
 */

import { PAID_PLANS, type BillingPeriod, type CheckoutPlan } from '@/lib/plans/prices'

import { discountCycles } from './discount'

/**
 * Which of the three entities a purchase needs — the shape of the columns, not of the plans.
 *
 * `annual` rather than `yearly` because that is what the column is called
 * (`paddle_discount_id_annual`), and a name that differs from its column by one word is the
 * kind of thing that reads fine and resolves to `undefined`.
 */
export const DISCOUNT_KINDS = ['monthly', 'annual', 'lifetime'] as const

export type DiscountKind = (typeof DISCOUNT_KINDS)[number]

/** The three columns, as any reader of the campaign row has them. */
export interface DiscountIds {
  paddleDiscountIdMonthly: string | null
  paddleDiscountIdAnnual: string | null
  paddleDiscountIdLifetime: string | null
}

/** What each kind covers, for the one screen that has to say which half of a campaign is missing. */
export const DISCOUNT_KIND_LABEL = {
  monthly: 'the monthly plans',
  annual: 'the yearly plans',
  lifetime: 'the Lifetime',
} as const satisfies Record<DiscountKind, string>

export const DISCOUNT_ID_COLUMN = {
  monthly: 'paddleDiscountIdMonthly',
  annual: 'paddleDiscountIdAnnual',
  lifetime: 'paddleDiscountIdLifetime',
} as const satisfies Record<DiscountKind, keyof DiscountIds>

/**
 * Which entity covers a given purchase.
 *
 * The same mismatch `paddlePriceId` refuses: a cycle passed for Lifetime, or none passed for a
 * plan that renews, is a caller bug and answers `null` rather than picking one.
 */
export function discountKindFor(plan: CheckoutPlan, cycle: BillingPeriod | null): DiscountKind | null {
  if (plan === 'lifetime') return cycle === null ? 'lifetime' : null
  if (cycle === null) return null
  return cycle === 'year' ? 'annual' : 'monthly'
}

/**
 * The `dsc_…` to hand Paddle for this purchase, or `null` when this campaign has none.
 *
 * **`null` is the whole safety property of the feature**, so it is worth saying plainly what
 * the caller must do with it: refuse the sale. A campaign whose sync has not run, or has run
 * and failed, or covers no Lifetime, reaches here with nothing to pass — and selling at the
 * listino to somebody the page has just promised 30% off is the shown-price/charged-price gap
 * inverted into the direction that takes *more* money than was advertised. `paddleCheckout.ts`
 * answers `coupon-unsupported`, which is the refusal that has been there since the campaigns
 * had no Paddle side at all, narrowed from «a coupon exists» to «this coupon has no discount
 * behind it».
 *
 * A value that is not a `dsc_` reads as absent, `paddlePriceId`'s own rule about `pri_`: a
 * column holding something else is a column nothing should be charged against.
 */
export function discountIdFor(ids: DiscountIds, plan: CheckoutPlan, cycle: BillingPeriod | null): string | null {
  const kind = discountKindFor(plan, cycle)
  if (kind === null) return null

  const held = ids[DISCOUNT_ID_COLUMN[kind]]
  return held !== null && held.startsWith('dsc_') ? held : null
}

/**
 * The kinds this campaign ought to have and does not — what `/coupons` marks in red.
 *
 * Every campaign needs the two recurring entities; only one that covers the Lifetime needs the
 * third. An empty answer means every sale this campaign can make is a sale it can make at the
 * discounted price; anything else is a plan whose checkout will refuse, which is safe and
 * invisible, and therefore exactly the kind of thing that has to be shown on a screen.
 */
export function missingDiscounts(campaign: { appliesToLifetime: boolean } & DiscountIds): DiscountKind[] {
  const wanted: DiscountKind[] = campaign.appliesToLifetime ? ['monthly', 'annual', 'lifetime'] : ['monthly', 'annual']

  return wanted.filter((kind) => {
    const held = campaign[DISCOUNT_ID_COLUMN[kind]]
    return held === null || !held.startsWith('dsc_')
  })
}

/** What `discounts.create`/`discounts.update` are given, in this app's own words. */
export interface DiscountSpec {
  kind: DiscountKind
  /** Paddle's internal label, never shown to a customer. Carries the code so a human can find it. */
  description: string
  /** `'0.01'`…`'100'` — the campaign's percentage, unchanged. */
  amount: string
  recur: boolean
  /** Billing periods the discount holds for, `null` for as long as the subscription lasts. */
  maximumRecurringIntervals: number | null
  /** The prices this may be applied to. Never empty — see `discountSpecs`. */
  restrictTo: string[]
  expiresAt: Date | null
}

/** The fields of a campaign this translation needs. A shape of its own, `CampaignFacts`' rule. */
export interface DiscountableCampaign {
  code: string
  discountPercent: string
  discountMonths: number | null
  appliesToLifetime: boolean
  expiresAt: Date | null
}

/** How the caller names a price. `paddlePriceId` has this signature; a test passes a table. */
export type PriceIdResolver = (plan: CheckoutPlan, cycle: BillingPeriod | null) => string | null

/**
 * The entities this campaign needs, one per kind that can be built completely.
 *
 * **`restrict_to` is all-or-nothing per kind, and that is the rule with money behind it.**
 * `paddlePriceId` can name Standard and Plus and not Premium — a half-filled
 * `PADDLE_PRICE_IDS`, a live catalogue built one product at a time — and a monthly discount
 * restricted to two prices out of three attaches to a Premium transaction perfectly happily,
 * discounts nothing on it, and charges the listino. Paddle reports no error, because nothing is
 * wrong from its side: the discount simply matched no item. So a kind whose every price cannot
 * be named is not created at all, its column stays empty, and `discountIdFor` above then
 * refuses the sale instead of taking full price for a discounted one.
 *
 * **The Lifetime is `recur: false` with no interval count**, which is not a special case so
 * much as the absence of one: it is bought once and has no billing period for a number of
 * periods to mean anything about. It is built only when `appliesToLifetime` is on, for the
 * reason that column exists — «an abbonamento discount costs N months, a Lifetime discount
 * costs forever».
 *
 * **No `code` is ever passed**, and no `usage_limit`. The first is what makes `enabled_for
 * _checkout: false` hold: with no code generated and none supplied there is nothing for anybody
 * to type into Paddle's own field, so the second path that could hand out a discount without a
 * `coupon_redemptions` row cannot be reopened by a setting. The second is because Paddle's
 * limit is «an overall limit for this discount, rather than a per-customer limit», while this
 * app's two ceilings are per plan family and its once-per-account rule is an index — three
 * entities and two ceilings do not map onto one number each, and `coupon_redemptions_once` is
 * what makes the ceilings verifiable rather than mirrored. `expires_at` *is* passed, because
 * there it costs nothing and buys a second refusal at Paddle's end for a campaign that lapsed
 * between two page loads.
 */
export function discountSpecs(campaign: DiscountableCampaign, priceId: PriceIdResolver): DiscountSpec[] {
  const specs: DiscountSpec[] = []

  const recurring: { kind: DiscountKind; cycle: BillingPeriod }[] = [
    { kind: 'monthly', cycle: 'month' },
    { kind: 'annual', cycle: 'year' },
  ]

  for (const { kind, cycle } of recurring) {
    const prices = PAID_PLANS.map((plan) => priceId(plan, cycle))
    if (prices.some((id) => id === null)) continue

    specs.push({
      kind,
      description: paddleDescription(campaign, kind),
      amount: campaign.discountPercent,
      recur: true,
      maximumRecurringIntervals: discountCycles(campaign.discountMonths, cycle),
      restrictTo: prices as string[],
      expiresAt: campaign.expiresAt,
    })
  }

  if (campaign.appliesToLifetime) {
    const lifetime = priceId('lifetime', null)
    if (lifetime !== null) {
      specs.push({
        kind: 'lifetime',
        description: paddleDescription(campaign, 'lifetime'),
        amount: campaign.discountPercent,
        recur: false,
        maximumRecurringIntervals: null,
        restrictTo: [lifetime],
        expiresAt: campaign.expiresAt,
      })
    }
  }

  return specs
}

/**
 * What the discount is called inside Paddle's dashboard.
 *
 * Nobody outside sees it, and it is written for the one person who will ever read it: somebody
 * looking at a transaction in Paddle and asking which campaign here produced it. The code and
 * the kind are enough to find the row, which is why neither the percentage nor the dates are in
 * it — both can be changed on the entity and a stale copy in its own label would be the
 * two-places-must-agree failure this repository keeps a list of.
 */
function paddleDescription(campaign: DiscountableCampaign, kind: DiscountKind): string {
  return `${campaign.code} — Strumfolio ${kind}`
}
