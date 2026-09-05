/**
 * The arithmetic and the sentences a coupon turns into — pure, and the only module in this
 * feature a `node:test` file can reach.
 *
 * Nothing here touches the database or the clock on its own: every function that needs to know
 * what time it is takes a `now`, the discipline `resolveSubscription` (`plans/entitlements.ts`)
 * already follows, and it is what lets `campaignStatus` be asserted at both edges of a window
 * rather than only whenever the suite happens to run.
 *
 * **Money is never a float in here.** Amounts arrive as strings (`prices.ts` says why), are
 * converted to integer cents, and come back as strings. `2.49 * 12` is `29.880000000000003` in
 * binary, and `yearlyTotalOfMonthly`'s own comment already names that as the bug this
 * repository refuses to ship in the shop window; a percentage multiplication is the same
 * hazard with more decimals.
 */

import { euro } from '@/lib/plans/prices'
import type { BillingPeriod } from '@/lib/plans/prices'

import { readPercent } from './types'
import type { CampaignStatus } from './types'

/** `'34.99'` → `3499`. `null` for anything that is not a printable decimal amount. */
function toCents(amount: string): number | null {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(amount.trim())) return null
  const [whole, fraction = ''] = amount.trim().split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

/** `3499` → `'34.99'`, `2400` → `'24'`. Trailing `.00` is dropped, matching how `PRICES` writes them. */
function fromCents(cents: number): string {
  const whole = Math.trunc(cents / 100)
  const rest = cents % 100
  return rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(2, '0')}`
}

/**
 * A listino amount less a percentage, rounded half-up to the cent.
 *
 * All integer arithmetic: the percentage becomes basis points (`'30'` → `3000`), and the
 * `+ 5000` before the `/ 10000` is the half-up. `Math.round` on a float would agree on these
 * seven numbers and disagree on some other one later, which is exactly the class of bug that
 * only shows up in production on a price nobody tested.
 *
 * **Validated against the commercial deck's own promo column**, all seven rows —
 * `3.49→2.44`, `6.99→4.89`, `9.99→6.99`, `34.99→24.49`, `69.99→48.99`, `99.99→69.99`,
 * `199.99→139.99`. `discount.test.ts` holds that table as a fixture, so a change to the
 * rounding names the row of the deck that stopped being true rather than failing abstractly.
 *
 * Returns the amount unchanged when the percentage is nonsense — a refusal that reads as "no
 * discount", never as a free plan.
 */
export function discountedAmount(amount: string, percent: string): string {
  const cents = toCents(amount)
  const valid = readPercent(percent)
  if (cents === null || valid === null) return amount

  /* Two decimals of percentage, as basis points — `'12.5'` → `1250`. */
  const basisPoints = Math.round(Number(valid) * 100)
  return fromCents(Math.floor((cents * (10000 - basisPoints) + 5000) / 10000))
}

/**
 * How many billing cycles a campaign's months come to, on a given cycle.
 *
 * The whole reason the reference document's three-discount terna (`ABC`, `ABC-Y`, `ABC-LT`) is
 * not built: that existed because Paddle's `maximum_recurring_intervals` counts cycles rather
 * than months, so one number could not hold three months of a monthly plan and one year of an
 * annual one. A single figure in months derives both.
 *
 * The yearly cycle rounds **up**, always in the customer's favour — so `1` month discounts a
 * whole first year, and `14` discounts two. That is the decision, and it is the reason
 * `couponCampaigns` has no `applies_to_monthly`/`applies_to_annual`: with at least one month
 * always covering at least one cycle of each, every campaign covers both by construction, and
 * there is no way to write one whose banner promises what half of `/pricing` does not show.
 *
 * `null` in, `null` out: a discount that never lapses.
 */
export function discountCycles(months: number | null, cycle: BillingPeriod): number | null {
  if (months === null) return null
  return cycle === 'year' ? Math.ceil(months / 12) : months
}

/**
 * The same duration in months — what `accounts.discountEndsAt` is computed from.
 *
 * **This and `discountCycles` are the pair whose names are adjacent and whose consumers are
 * not**, so getting them the wrong way round is silent. `discountCycles` feeds the *copy* (the
 * number in «the first year», «the first 2 years», «the first 3 months»); this feeds the
 * *date*, and nothing else. One campaign with `discountMonths: 3` therefore says "the first
 * year" on a yearly card and stores a date twelve months out — the same duration, told in the
 * unit each consumer needs.
 */
export function discountedMonths(months: number | null, cycle: BillingPeriod): number | null {
  const cycles = discountCycles(months, cycle)
  if (cycles === null) return null
  return cycle === 'year' ? cycles * 12 : cycles
}

/** `from` plus a number of whole months, or `null` for a discount that never ends. */
export function discountEnd(months: number | null, cycle: BillingPeriod, from: Date): Date | null {
  const total = discountedMonths(months, cycle)
  if (total === null) return null
  const until = new Date(from)
  until.setMonth(until.getMonth() + total)
  return until
}

/**
 * What twelve months of a discounted monthly plan actually cost.
 *
 * `yearlyTotalOfMonthly(discounted)` would be false, and false in the customer's favour,
 * directly under the line that says «then €3.49» — three discounted months plus nine full ones
 * is €38.73, not €29.28. The two sentences sit two centimetres apart on the same card.
 *
 * Capped at twelve on purpose: this line is about the **first year** and does not stretch past
 * it, so a 24-month campaign shows the same first-year total as a 12-month one. The duration
 * line above it still says «for the first 24 months», so the two agree.
 */
export function firstYearTotal(full: string, discounted: string, months: number | null): string | null {
  const fullCents = toCents(full)
  const discountedCents = toCents(discounted)
  if (fullCents === null || discountedCents === null) return null

  const cheap = Math.min(months ?? 12, 12)
  return fromCents(cheap * discountedCents + (12 - cheap) * fullCents)
}

/**
 * A campaign, reduced to the fields that decide its state and its prices.
 *
 * A shape of its own rather than the drizzle row type: this module must stay importable by a
 * client component (`PricingPlans.tsx`'s header explains what pulling `@/lib/db` across that
 * boundary costs), and a row type reaches back into the schema.
 */
export interface CampaignFacts {
  code: string
  discountPercent: string
  discountMonths: number | null
  appliesToLifetime: boolean
  startsAt: Date
  expiresAt: Date | null
  usageLimitSubscription: number | null
  usageLimitLifetime: number | null
  archivedAt: Date | null
}

/**
 * A campaign's state right now — read, never stored.
 *
 * The order of the tests is the meaning: archived beats everything (it is a decision somebody
 * made, not a consequence of the clock), then the window, then the ceiling. A campaign past
 * both its expiry and its ceiling reads as `expired`, because the date is the fact a reader is
 * told about.
 *
 * `redeemed` is the count from `coupon_redemptions`, which is what makes a ceiling verifiable
 * rather than an estimate. It is compared against the **higher** of the two ceilings, so a
 * campaign is only `exhausted` once nothing is left to sell at all: a Lifetime ceiling of 50
 * running out while the subscription ceiling of 500 has room must not close the campaign, and
 * the per-plan refusal for that case lives in `read.ts` where the plan being bought is known.
 * The Lifetime ceiling is ignored entirely when `appliesToLifetime` is off, or a campaign that
 * never sold a Lifetime could be closed by a limit that governed nothing.
 */
export function campaignStatus(facts: CampaignFacts, now: Date, redeemed: number): CampaignStatus {
  if (facts.archivedAt !== null) return 'archived'
  if (now < facts.startsAt) return 'scheduled'
  if (facts.expiresAt !== null && now > facts.expiresAt) return 'expired'

  const ceilings = [facts.usageLimitSubscription, facts.appliesToLifetime ? facts.usageLimitLifetime : null].filter(
    (limit): limit is number => limit !== null,
  )
  if (ceilings.length > 0 && redeemed >= Math.max(...ceilings)) return 'exhausted'

  return 'active'
}

/**
 * How long a cookie carrying this campaign's code may live, in seconds.
 *
 * The smaller of the attribution window and whatever is left of the campaign. The `min` is not
 * tidiness: a cookie that outlives its offer means a reader comes back, sees a struck price,
 * presses «Choose», and has the code refused at the checkout — the worst possible way to learn
 * that a campaign ended. Never negative; a campaign already over yields `0`, which is a cookie
 * that expires immediately.
 */
export function cookieMaxAge(expiresAt: Date | null, now: Date, maxDays: number): number {
  const cap = maxDays * 24 * 60 * 60
  if (expiresAt === null) return cap
  return Math.max(0, Math.min(cap, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)))
}

/**
 * The three `accounts.coupon*` columns, resolved at the moment of reading.
 *
 * **`discountEndsAt` is a date that passes on its own**, with no request there to observe it
 * and nothing to write when it does. Without this function `/billing` would keep printing
 * «ABC −30% until 4 December 2026, then €99.99» on the fifth of December, and `/coupons` would
 * answer "has a live discount" for ever. Exactly the relationship `liveSubscription` has with
 * `plan`/`planExpiresAt`, and for exactly the same reason: the columns are not cleared when
 * they lapse, they are read through something that knows what time it is.
 *
 * Every read of those three columns goes through here — `/billing`, `/coupons`,
 * `/accounts/[email]` — and none of them reads them in the clear.
 */
export interface DiscountColumns {
  couponCode: string | null
  couponPercent: string | null
  discountEndsAt: Date | null
}

export interface LiveDiscount {
  code: string
  percent: string
  /** `null` when the discount holds for as long as the subscription does. */
  endsAt: Date | null
}

export function liveDiscount(columns: DiscountColumns, now: Date): LiveDiscount | null {
  const percent = readPercent(columns.couponPercent)
  if (columns.couponCode === null || percent === null) return null
  if (columns.discountEndsAt !== null && now > columns.discountEndsAt) return null
  return { code: columns.couponCode, percent, endsAt: columns.discountEndsAt }
}

/**
 * The line under a discounted price: what is being paid, for how long, and what comes after.
 *
 * The duration is counted in **cycles** (`discountCycles`), never in the campaign's raw
 * months — «3 months» on a yearly card would be false, since that reader gets twelve. See
 * `discountedMonths` for the other half of that pair.
 *
 * English, like every other sentence in this app.
 */
export function durationCopy(
  full: string,
  discounted: string,
  months: number | null,
  cycle: BillingPeriod,
): string {
  const cycles = discountCycles(months, cycle)
  const unit = cycle === 'year' ? 'year' : 'month'

  if (cycles === null) {
    return cycle === 'year'
      ? `${euro(discounted)} a year, for as long as you stay subscribed.`
      : `${euro(discounted)} a month, for as long as you stay subscribed.`
  }

  const span = cycles === 1 ? `the first ${unit}` : `the first ${cycles} ${unit}s`
  return `${euro(discounted)} for ${span}, then ${euro(full)}.`
}

/**
 * The first-year line on a discounted monthly card: the real total, and the listino's.
 *
 * `null` when there is nothing worth saying — a discount that never lapses makes the twelve
 * months uniform, and the price line above already carries the number.
 */
export function firstYearCopy(full: string, discounted: string, months: number | null): string | null {
  if (months === null) return null
  const real = firstYearTotal(full, discounted, months)
  const listino = firstYearTotal(full, full, months)
  if (real === null || listino === null) return null
  return `${euro(real)} over the first year, instead of ${euro(listino)}.`
}

/**
 * What the bar above the plans says once an offer is applied.
 *
 * Two lines rather than the one this shipped with. The first version read «HAPPYSONG — 30%
 * off, until 3 December 2026» and that is a label, not a description: it named the code and
 * the rate and left out the two things a reader actually needs — how long the reduction lasts,
 * and what happens after. The overlay that advertises the same offer says all of it, so a
 * reader who accepted it there arrived at a bar that told them less than the banner had.
 *
 * **Every sentence is derived**, like `bannerCopy` and `offerCopy` before it, and for the same
 * reason: a bar assembled from what the discount actually does cannot promise what it does
 * not, and a stored headline can.
 *
 * The duration is the one piece with real work in it. `discountMonths` is a single number and
 * the two cycles read it differently — three months is three monthly periods but a whole first
 * year on the yearly plan — so when they differ the bar says both. Without that it would say
 * «30% off for 3 months» directly above a yearly card reading «for the first year», which is
 * the page contradicting itself.
 */
export interface AppliedCopy {
  /** «HAPPYSONG — 30% off for 12 months» — the code and what it does, in one line. */
  headline: string
  /** The rest: the cycle nuance, what is not covered, the reversion, the deadline. */
  detail: string
}

export function appliedCopy(
  facts: Pick<CampaignFacts, 'code' | 'discountPercent' | 'discountMonths' | 'appliesToLifetime' | 'expiresAt'>,
  lifetimeOnSale: boolean,
  formatDay: (value: Date) => string,
): AppliedCopy {
  const { code, discountPercent: percent, discountMonths: months } = facts
  const monthly = discountCycles(months, 'month')
  const yearly = discountedMonths(months, 'year')

  const headline =
    monthly === null
      ? `${code} — ${percent}% off, for as long as you stay subscribed`
      : `${code} — ${percent}% off for ${monthly} ${monthly === 1 ? 'month' : 'months'}`

  const sentences: string[] = []

  /* Only when the two cycles genuinely differ. With `discountMonths` at 12 or more they agree,
     and saying it twice would read as a second, better offer. */
  if (monthly !== null && yearly !== null && yearly !== monthly) {
    sentences.push(yearly === 12 ? 'A full year if you pay yearly.' : `${yearly} months if you pay yearly.`)
  }

  /*
   * The same gap `bannerCopy` covered with the word «subscriptions»: with the Lifetime on sale
   * and not covered, it is the one card on the page still at full price while this bar talks
   * about a discount.
   */
  if (!facts.appliesToLifetime && lifetimeOnSale) {
    sentences.push('The Lifetime is not included.')
  }

  if (monthly !== null) sentences.push('After that, the usual price.')
  if (facts.expiresAt !== null) sentences.push(`Claim it by ${formatDay(facts.expiresAt)}.`)

  return { headline, detail: sentences.join(' ') }
}

/**
 * The offer's own deadline, as the design words it.
 *
 * Four cases, and they are the mock's own — «Last day», «1 day left», «N days left», and past
 * forty-five days «Ends 30 September», where a countdown stops being urgency and starts being
 * noise. `null` for a campaign with no expiry at all, which is legal (`expires_at` is nullable
 * by decision) and simply has no deadline to state.
 *
 * Whole days, rounded **up**: a campaign ending in eight hours is «1 day left» and not «0 days
 * left», because zero is the one number that reads as a fault rather than a countdown.
 */
export function deadlineCopy(expiresAt: Date | null, now: Date): string | null {
  if (expiresAt === null) return null

  const days = Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000)
  if (days <= 0) return 'Last day'
  if (days === 1) return '1 day left'
  if (days > 45) return `Ends ${expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`
  return `${days} days left`
}

/**
 * The three sentences the overlay is built from, all derived — the offer has no stored copy of
 * its own, for `appliedCopy`'s stated reason.
 *
 * The duration is quoted on the **yearly** cycle (`discountedMonths(months, 'year')`), which is
 * the customer's best case and the reading the design's own headline takes: a campaign of three
 * months holds a yearly price for twelve, so «A full year at 30% off» is the true and the
 * strongest thing to say. Twelve is worded «A full year» rather than «12 months» because that
 * is what the mock says, and because a year has a name.
 *
 * `appliedCopy` deliberately words the same campaign differently — it names the monthly figure
 * first and adds the yearly one only when they differ. The two are not inconsistent: this is an
 * advertisement, where the strongest true claim belongs, and that is a confirmation sitting
 * directly above cards that each state their own cycle.
 */
export interface OfferCopy {
  /** «30%» split for the design's own two type sizes — the number, then the sign. */
  percent: string
  /** «12 MONTHS» / «FOREVER» — the ticket stub's lower line. */
  duration: string
  /** «A full year at 30% off, price locked.» */
  headline: string
}

export function offerCopy(percent: string, months: number | null): OfferCopy {
  const yearMonths = discountedMonths(months, 'year')

  if (yearMonths === null) {
    return {
      percent,
      duration: 'Forever',
      headline: `${percent}% off, for as long as you stay subscribed.`,
    }
  }

  return {
    percent,
    duration: yearMonths === 12 ? '12 months' : `${yearMonths} months`,
    headline:
      yearMonths === 12
        ? `A full year at ${percent}% off, price locked.`
        : `${yearMonths} months at ${percent}% off, price locked.`,
  }
}
