/**
 * What each plan costs, in euro, once.
 *
 * Beside `types.ts` rather than inside it, and deliberately not a field on `PlanLimits`:
 * `PLAN_RANK`'s own comment already draws the line this module lives on — "ranking is not
 * pricing" — and money is a fact with a different lifetime from a limit. A limit changes
 * when the product changes; a price changes when the business changes, and a re-price must
 * never require touching the table the gates read. The rejected alternative was constants
 * local to `app/pricing/page.tsx`, which is the copy that disagrees the first time a
 * checkout is written and names the amounts a second time.
 *
 * **This table and Paddle's catalogue are two things that must agree, and nothing in this
 * repository can check that they do.** Paddle holds the prices that are actually charged;
 * this holds the prices that are shown. Until the checkout exists there is no API call to
 * compare them with, so the agreement is maintained by hand, in one direction: a price is
 * changed in Paddle first and here second, in the same change, and the Paddle price id is
 * written into `PlanPrice.paddleId` at the same time. The day the checkout lands, the
 * verification that replaces the manual rule is a single script that reads Paddle's
 * `/prices` and asserts every `paddleId` here still carries these `amount` values — which
 * is why the field exists now, empty, rather than being added later: an empty string is a
 * visible gap in a table, and a missing field is not.
 *
 * Euro only, and tax-inclusive: the number written here is the number the customer pays,
 * wherever they are — a statement about *tax*, and about nothing else. It does not say what a
 * non-euro cardholder's statement will read, which is their bank's rate and their bank's fee
 * and is not ours to promise; /pricing's lede says so in as many words, and this sentence is
 * not the licence to take that clause back out. No currency map, no conversion, no Paddle.js on
 * the page — the page that renders these is statically generated and knows nothing about who is
 * reading it, so a localised price would be a claim it cannot make. That is also why the
 * amounts are strings and not numbers: nothing here does arithmetic on them except
 * `yearlyTotalOfMonthly`, and a string is what a page prints. `2.49` as a float would invite
 * exactly one bug — a total rendered as `29.880000000000003`.
 *
 * `free` is absent, and that is the shape rather than an omission: it is what an account
 * already is, not something with a price. A `Record<Plan, …>` would have demanded a row for
 * it and an amount of `'0'` to fill the row, which is a price for a thing that is not sold.
 */

import type { Plan } from './types'

/** The plans that cost money on a recurring basis. `lifetime` is not here: it is not recurring. */
export type PaidPlan = Extract<Plan, 'standard' | 'plus' | 'premium'>

export const PAID_PLANS = ['standard', 'plus', 'premium'] as const satisfies readonly PaidPlan[]

/**
 * The plans the mock checkout (`lib/plans/checkout.ts`, `/checkout`) can sell: the three
 * recurring ones, plus the one-time Lifetime. Pure vocabulary, here rather than in
 * `checkout.ts` itself, because that file carries `'use server'`, and a Next.js Server
 * Actions module may only export async functions — a plain constant or a synchronous type
 * guard sitting beside them fails the build, not just a lint rule. This is also, independent
 * of that constraint, where it belongs: `checkout.ts` decides what a purchase *does*, and
 * this is only the closed list of what may be named as one, the same kind of fact `PaidPlan`
 * and `PAID_PLANS` already are.
 */
export const CHECKOUT_PLANS = [...PAID_PLANS, 'lifetime'] as const satisfies readonly Plan[]

export type CheckoutPlan = (typeof CHECKOUT_PLANS)[number]

/** Whether a route param or a form value is one of the plans this mock actually sells. */
export function isCheckoutPlan(value: string): value is CheckoutPlan {
  return (CHECKOUT_PLANS as readonly string[]).includes(value)
}

/** How a plan is billed. `year` is the default the pricing page opens on — see `PricingPlans`. */
export type BillingPeriod = 'year' | 'month'

/**
 * Reads `accounts.pendingCycle` — a closed set of two literals, so membership is the whole
 * check. An unrecognised value means the same as a missing one: no cycle to carry into the
 * plan a downgrade is scheduled to become, the same generous direction `readPendingPlan`
 * (`types.ts`) takes for its own column.
 */
export function readPendingCycle(value: unknown): BillingPeriod | null {
  return value === 'year' || value === 'month' ? value : null
}

export interface PlanPrice {
  /** Euro, tax included, as it is printed: no thousands separator, `.` as the decimal point. */
  amount: string
  /**
   * The id of the matching price in Paddle's catalogue, or `''` while the catalogue does not
   * exist yet. Empty is honest and a placeholder like `'pri_TODO'` is not: an id-shaped string
   * that resolves to nothing is the one value a future checkout could pass to Paddle without
   * noticing, where an empty string cannot survive the first call.
   */
  paddleId: string
}

/*
 * The listino, as the commercial configuration deck closes it («Il listino è chiuso su tutti
 * i piani e cicli», `Strumfolio_Configurazione_Commerciale.pdf` v1.0, September 2026) —
 * replacing the €19/€2.49 · €39/€4.99 · €69/€8.99 table that shipped before coupons existed.
 *
 * The `.99` endings are not decoration: the deck's own promo column is these amounts less
 * 30%, and `discountedAmount` (`lib/coupons/discount.ts`) reproduces all seven of its figures
 * exactly, which is what makes that table a test fixture rather than a claim. Change an amount
 * here and `discount.test.ts` says which row of the deck stopped being true.
 */
export const PRICES: Record<PaidPlan, Record<BillingPeriod, PlanPrice>> = {
  standard: {
    year: { amount: '34.99', paddleId: '' },
    month: { amount: '3.49', paddleId: '' },
  },
  plus: {
    year: { amount: '69.99', paddleId: '' },
    month: { amount: '6.99', paddleId: '' },
  },
  premium: {
    year: { amount: '99.99', paddleId: '' },
    month: { amount: '9.99', paddleId: '' },
  },
}

/**
 * Premium bought once, with no renewal date.
 *
 * **Three fields left this constant when coupons landed**, and the removal is the decision
 * rather than a tidy-up: `originalAmount` (`'249'`, the struck anchor beside `'189'`),
 * `closesOn` and `closesOnLabel`. This plan had a promotional mechanism entirely of its own —
 * one struck price, one hard-coded closing date, one pill — and `lib/coupons/` is now that
 * mechanism for every plan at once. €199.99 is the listino, flat; €139.99 exists only while a
 * campaign covers the Lifetime (`applies_to_lifetime`), and the date beside it is that
 * campaign's `expires_at`, not a constant anybody has to remember to move.
 *
 * What replaces `closesOn` for the other question it answered — whether the Lifetime is in
 * the catalogue at all — is the `lifetime.on_sale` row in `app_settings`
 * (`lib/settings/types.ts`), read per request. `lifetimeOpen()` in `app/pricing/page.tsx` had
 * already been converted from a module constant to a function precisely because a date in the
 * code closes an offer on the first deploy after that day rather than on that day; a switch an
 * owner flips finishes the job the conversion started.
 */
export const LIFETIME = {
  amount: '199.99',
  paddleId: '',
} as const

/** `19` → `€19`. One place, so no page has to decide where the symbol goes. */
export function euro(amount: string): string {
  return `€${amount}`
}

/**
 * `from` + one billing period — a calendar month or a calendar year, never a fixed day count.
 *
 * Here rather than in `checkout.ts`, where it was born and where it is still the one thing that
 * decides a purchase's `planExpiresAt`, because a second reader appeared: `/checkout/[plan]`
 * has to be able to say, *before* the button is pressed, which day this purchase would move the
 * renewal to — and that sentence is only worth printing if it names the same day the write will
 * actually store. That file carries `'use server'`, so a synchronous helper cannot live beside
 * `mockPurchase`; this module is where the rest of the billing-period vocabulary already is.
 */
export function periodEnd(cycle: BillingPeriod, from: Date): Date {
  const until = new Date(from)
  if (cycle === 'year') until.setFullYear(until.getFullYear() + 1)
  else until.setMonth(until.getMonth() + 1)
  return until
}

/**
 * What twelve months of a monthly plan add up to, as euro.
 *
 * Rendered on the monthly side of the toggle instead of a sentence about savings: the reader
 * compares `€29.88` against `€19` unaided, which is a comparison they make correctly and
 * faster than they read a claim about it. `Math.round` over cents rather than
 * `(price * 12).toFixed(2)` on the euro amount, because the second one is where floating
 * point shows up in the shop window — 2.49 × 12 is 29.880000000000003 in binary, and
 * `toFixed` hides that only until an amount comes along where it does not.
 */
export function yearlyTotalOfMonthly(amount: string): string {
  const cents = Math.round(Number(amount) * 100) * 12
  const whole = Math.trunc(cents / 100)
  const rest = cents % 100
  return euro(rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(2, '0')}`)
}
