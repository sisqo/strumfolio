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

export const PRICES: Record<PaidPlan, Record<BillingPeriod, PlanPrice>> = {
  standard: {
    year: { amount: '19', paddleId: '' },
    month: { amount: '2.49', paddleId: '' },
  },
  plus: {
    year: { amount: '39', paddleId: '' },
    month: { amount: '4.99', paddleId: '' },
  },
  premium: {
    year: { amount: '69', paddleId: '' },
    month: { amount: '8.99', paddleId: '' },
  },
}

/**
 * Premium bought once, with no renewal date — and the day it stops being for sale.
 *
 * The closing date is data and not a sentence in the page's JSX, because it is the one fact
 * on that page with an expiry: it appears in the copy, and one day it decides whether the
 * block is rendered at all. A date typed into a paragraph cannot be compared with anything.
 *
 * `closesOn` is the last day the offer is in the catalogue, inclusive, and `closesOnLabel` is
 * how that same day is written for a reader. Two fields rather than one formatted at render
 * time deliberately: `toLocaleDateString` would put the page's wording at the mercy of the
 * runtime's locale data, and this page is English wherever it is read.
 *
 * **What actually reads this, and what it cannot do.** `LIFETIME_OPEN` in
 * `app/pricing/page.tsx` compares this date and renders the lifetime block, and the lifetime
 * clause of the page's meta description, only while it holds. That page is statically
 * generated, so the comparison is evaluated when the page is built and not when it is read:
 * the block leaves on the first build after 31 December 2026, not at midnight. So there is a
 * duty here that no code discharges — **take the block out by hand on that day**, or accept
 * that it lives until the next deploy. It is written here rather than only there because this
 * is the field somebody edits when the date moves, and the date moving is when the duty moves
 * with it.
 */
export const LIFETIME = {
  amount: '189',
  /**
   * The struck-through anchor beside `amount` — never charged, never stored anywhere a
   * purchase touches (`checkout.ts` writes only `plan`/`planStatus`/`planExpiresAt`, the same
   * three columns every other plan writes, with no price of any kind among them). Its only
   * job is the one line on `/pricing` that shows both numbers at once.
   */
  originalAmount: '249',
  paddleId: '',
  /** ISO, so a comparison is a comparison and not a parse of prose. */
  closesOn: '2026-12-31',
  closesOnLabel: '31 December 2026',
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
