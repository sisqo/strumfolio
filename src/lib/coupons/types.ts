/**
 * The coupon vocabulary, as plain data.
 *
 * A module with **no `@/lib/db` import anywhere in it**, and no `'use server'` either — the
 * same two reasons `settings/types.ts` states for itself. A `'use server'` module may only
 * export async functions, so the parsers and the labels below could not sit beside the words
 * they belong to; and this file is value-imported by client components, where importing a
 * database-touching module ships the whole of it to the browser (`PricingPlans.tsx`'s own
 * header is the full version of that argument).
 */

/**
 * Where a campaign came from. A reporting dimension and nothing more: it precompiles no
 * defaults today, deliberately — the reference document says `channel` "determina i default di
 * durata" without saying which, and inventing them before two real campaigns exist would be
 * guessing in a form somebody has to trust.
 */
export const COUPON_CHANNELS = ['paid', 'partner', 'winback', 'launch'] as const

export type CouponChannel = (typeof COUPON_CHANNELS)[number]

export const CHANNEL_LABEL: Record<CouponChannel, string> = {
  paid: 'Paid ads',
  partner: 'Partner',
  winback: 'Win-back',
  launch: 'Launch',
}

export function readChannel(value: unknown): CouponChannel | null {
  return typeof value === 'string' && (COUPON_CHANNELS as readonly string[]).includes(value)
    ? (value as CouponChannel)
    : null
}

/**
 * How a campaign can be reached.
 *
 * One enum where the reference document has two booleans (`publicly_enterable`,
 * `url_applicable`), because two booleans have four states and one of the four — both false —
 * is a campaign nobody can reach by any route. An enum makes that state unrepresentable rather
 * than merely refused by a validation somebody has to remember to write.
 */
export const COUPON_ENTRIES = ['url', 'code', 'both'] as const

export type CouponEntry = (typeof COUPON_ENTRIES)[number]

export const ENTRY_LABEL: Record<CouponEntry, string> = {
  url: 'Link only — the code cannot be typed',
  code: 'Typed code only — no campaign link',
  both: 'Link or typed code',
}

export function readEntry(value: unknown): CouponEntry {
  /*
   * Falls to `'both'` rather than to `null`, which is the generous direction and the right one
   * here: this reads a stored column, and a cell this cannot recognise must not silently make
   * a live campaign unreachable. `readBooleanSetting` (`settings/types.ts`) documents the
   * general form — the failure nobody notices is the one where something quietly stops.
   */
  return typeof value === 'string' && (COUPON_ENTRIES as readonly string[]).includes(value)
    ? (value as CouponEntry)
    : 'both'
}

export function entryAllowsUrl(entry: CouponEntry): boolean {
  return entry === 'url' || entry === 'both'
}

export function entryAllowsCode(entry: CouponEntry): boolean {
  return entry === 'code' || entry === 'both'
}

/**
 * A campaign's state, computed at every read from the dates, the ceilings and `archivedAt` —
 * never stored. See `couponCampaigns`' own comment in `schema.ts` for why this is a departure
 * from the reference document's schema, and `campaignStatus` in `discount.ts` for the rules.
 */
export const CAMPAIGN_STATUSES = ['scheduled', 'active', 'exhausted', 'expired', 'archived'] as const

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  scheduled: 'Scheduled',
  active: 'Active',
  exhausted: 'Exhausted',
  expired: 'Expired',
  archived: 'Archived',
}

/** The one state in which a code may still be redeemed. */
export function isRedeemable(status: CampaignStatus): boolean {
  return status === 'active'
}

/**
 * A code as it is stored and compared: upper-cased and trimmed.
 *
 * Applied on the way in, so uniqueness is `unique('coupon_campaigns_code')` in the database
 * rather than a `where upper(code) = …` repeated at every call site — exactly what
 * `normalizeEmail` does for an address, and for the same reason.
 */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase()
}

/**
 * Whether a code is one this system will accept at all.
 *
 * Letters and digits only, 3 to 24 characters. No hyphens, and that is not fussiness: the
 * reference document's Paddle terna derives its internal codes by appending `-Y` and `-LT`, so
 * a hyphen in a public code is a collision waiting for the day that translation is written.
 */
export function isCodeShape(raw: string): boolean {
  return /^[A-Z0-9]{3,24}$/.test(normalizeCode(raw))
}

/**
 * A percentage off, read from a stored cell or a form field: `'0.01'` … `'100'`, at most two
 * decimals.
 *
 * Returns the string rather than a number, because that is what the rest of the system passes
 * around — `discountedAmount` does its own integer arithmetic on it and never wants a float.
 * `null` for anything outside the range, which is what makes a nonsense cell mean "no
 * discount" instead of a free plan.
 */
export function readPercent(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) return null
  const asNumber = Number(trimmed)
  if (asNumber < 0.01 || asNumber > 100) return null
  return trimmed
}

/**
 * A duration in months, read from a stored cell or a form field.
 *
 * Three answers, and the middle one is the one worth naming: a number means that many months,
 * `'forever'` (or an empty field) means the discount never lapses, and `null` means the input
 * was nonsense. At least 1 — a campaign that discounts nothing for zero months is not a
 * campaign — and capped at 600 months, which is fifty years and well past the point where
 * `/coupons` warns about what the number does to a yearly plan.
 */
export function readMonths(value: unknown): { ok: true; months: number | null } | { ok: false } {
  if (value === null || value === undefined || value === '' || value === 'forever') {
    return { ok: true, months: null }
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 && value <= 600 ? { ok: true, months: value } : { ok: false }
  }
  if (typeof value !== 'string') return { ok: false }
  if (!/^\d{1,3}$/.test(value.trim())) return { ok: false }
  const months = Number(value.trim())
  return months >= 1 && months <= 600 ? { ok: true, months } : { ok: false }
}

/** A usage ceiling, or `null` for none. Same three-answer shape as `readMonths`. */
export function readLimit(value: unknown): { ok: true; limit: number | null } | { ok: false } {
  if (value === null || value === undefined || value === '') return { ok: true, limit: null }
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 1 ? { ok: true, limit: value } : { ok: false }
  }
  if (typeof value !== 'string') return { ok: false }
  if (!/^\d{1,9}$/.test(value.trim())) return { ok: false }
  const limit = Number(value.trim())
  return limit >= 1 ? { ok: true, limit } : { ok: false }
}

/**
 * Why an attempt to apply a code failed.
 *
 * `'unknown-code'` covers three genuinely different situations on purpose — no such code, a
 * campaign whose `entry` does not allow typing, and one that is archived — and
 * `COUPON_FAILURE_MESSAGE` gives all three the same sentence. A different message for "this
 * code exists but you may not type it" tells somebody probing the form that a hidden code is
 * there, which is the whole reason `entry: 'url'` exists.
 */
export type CouponFailure =
  | 'unknown-code'
  | 'expired'
  | 'not-started'
  | 'exhausted'
  | 'already-redeemed'
  | 'no-database'
  | 'failed'

export const COUPON_FAILURE_MESSAGE: Record<CouponFailure, string> = {
  'unknown-code': 'That code is not valid.',
  expired: 'That offer has ended.',
  'not-started': 'That offer has not started yet.',
  exhausted: 'That offer has been fully claimed.',
  'already-redeemed': 'This account has already used that code.',
  'no-database': 'No database is configured for this deployment.',
  failed: "That didn't go through. Try again.",
}

/** The cookie that carries an accepted code. Named like the two that already exist. */
export const COUPON_COOKIE = 'songbook-coupon'

/**
 * How long the cookie may live, at most.
 *
 * Thirty days is the attribution window Google Ads uses by default, so the cookie and the
 * conversion figure describe the same period. The actual `Max-Age` is the smaller of this and
 * whatever is left of the campaign — see `cookieMaxAge`.
 */
export const COUPON_COOKIE_MAX_DAYS = 30

/**
 * Whether this reader has collapsed the offer bar.
 *
 * Written client-side by `CouponOverlay` with `document.cookie` and read server-side by the
 * three pages that mount it — hence a name in this module rather than in the component, so
 * neither side can spell it differently. Not `httpOnly`, deliberately: a dismissed banner is a
 * per-viewer convenience, and the only thing that reads it decides whether to draw a bar.
 */
export const OFFER_COLLAPSED_COOKIE = 'songbook-offer-collapsed'

/**
 * The `document.cookie` string that collapses the offer bar, or clears that choice.
 *
 * A builder rather than the line written twice, because two components write it —
 * `CouponOverlay`'s own × and `CouponBar`'s «Remove», which has to collapse the overlay as
 * well as drop the coupon (see `withoutCouponParams` for why «Remove» is three acts and not
 * one). Two hand-written `document.cookie` assignments are two chances for one of them to
 * spell the name or the age differently.
 *
 * A fortnight: long enough that dismissing means dismissed, short enough that the next
 * campaign gets its own chance to be seen.
 */
export function offerCollapsedCookie(collapsed: boolean): string {
  const age = collapsed ? 1_209_600 : 0
  return `${OFFER_COLLAPSED_COOKIE}=${collapsed ? '1' : '0'}; path=/; max-age=${age}; samesite=lax`
}

/**
 * The current URL with the two parameters that carry an offer taken out of it.
 *
 * **This is the whole of the «Remove» bug.** `activeCoupon` reads `?coupon=` before the
 * cookie, deliberately — an explicit code is more specific than a stored one — so dropping
 * the cookie does nothing at all on `/pricing?coupon=HAPPYSONG`, which is precisely where the
 * overlay's «See the plans» sends every reader. «Remove» deleted a cookie that was not what
 * was discounting, re-rendered from the same URL, and the bar came straight back.
 *
 * Every other parameter survives: `plan=` (which column `FeaturePaywallModal` highlighted) and
 * `cycle=` (which billing period the checkout opened on) are about where the reader is, not
 * about the offer, and losing them would move the page underneath them.
 */
export function withoutCouponParams(pathname: string, search: string): string {
  const params = new URLSearchParams(search)
  params.delete('coupon')
  params.delete('promo')
  const rest = params.toString()
  return rest === '' ? pathname : `${pathname}?${rest}`
}

/**
 * Why a `/coupons` write was refused.
 *
 * Here rather than beside the actions that produce it, for the constraint `plans/testCard.ts`
 * exists to document: `actions.ts` carries `'use server'`, and such a module may only export
 * async functions — a `Record` of messages sitting beside them fails the build, not merely a
 * lint rule. It is also where it belongs regardless, since the form that renders these is a
 * client component and this module is the one kept free of any `@/lib/db` import.
 */
export type CampaignFailure =
  | 'no-session'
  | 'not-owner'
  | 'no-database'
  | 'bad-code'
  | 'bad-name'
  | 'duplicate-code'
  | 'bad-percent'
  | 'bad-months'
  | 'bad-limit'
  | 'bad-window'
  | 'bad-channel'
  | 'lifetime-needs-limit'
  | 'default-needs-url'
  | 'default-not-live'
  | 'percent-locked'
  | 'limit-below-redeemed'
  | 'not-found'
  | 'failed'

export const CAMPAIGN_FAILURE_MESSAGE: Record<CampaignFailure, string> = {
  'no-session': 'Your session expired — sign in again.',
  'not-owner': 'Only a global owner can change campaigns.',
  'no-database': 'No database is configured for this deployment.',
  'bad-code': 'A code is 3 to 24 letters and digits, with no hyphens.',
  'bad-name': 'Give the campaign an internal name.',
  'duplicate-code': 'Another campaign already uses that code.',
  'bad-percent': 'A discount is between 0.01 and 100 per cent.',
  'bad-months': 'A duration is at least 1 month, or blank for “forever”.',
  'bad-limit': 'A usage limit is a whole number of at least 1, or blank for none.',
  'bad-window': 'The end date has to come after the start date.',
  'bad-channel': 'Pick a channel.',
  'lifetime-needs-limit': 'A campaign that covers the Lifetime needs its own usage limit.',
  'default-needs-url': 'A default campaign has to be reachable by link — an advertisement cannot type a code.',
  'default-not-live': 'Only a live campaign can be the default one: this one is not active or scheduled.',
  'percent-locked':
    'This campaign has redemptions, so its discount cannot change — archive it and make a new one.',
  'limit-below-redeemed': 'That limit is below the number of redemptions this campaign already has.',
  'not-found': 'That campaign no longer exists.',
  failed: 'Could not save. If migration 0037 has not been applied yet, this is why.',
}
