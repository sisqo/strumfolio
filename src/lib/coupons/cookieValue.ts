/**
 * What `songbook-coupon` holds: the campaign's code, signed by this server (2026-09-25).
 *
 * The cookie used to hold the bare code, and `activeCoupon` trusted it without asking the
 * campaign's `entry`, on the grounds that only a route which had already checked the code ever
 * wrote it. True of this app and irrelevant to anybody with `curl`: `httpOnly` stops a page's
 * script, not a request that sends its own `Cookie` header. So `Cookie: songbook-coupon=GUESS`
 * against `/`, `/pricing` or `/checkout/*` answered «does this code exist» for every campaign,
 * code-only ones included, without the per-address ceiling `applyCoupon` puts on guessing — and
 * `noteCouponView`'s «the code in your own cookie» exception could be satisfied by sending both.
 *
 * **Signed means written here, and only that earns the cookie's trust.** An unsigned value — a
 * cookie from before this change, or one somebody typed — is still read, but only for a campaign
 * a URL may carry (`entryAllowsUrl`), which is public to anybody who types `?coupon=`. Codes are
 * `[A-Z0-9]` only (`isCodeShape`), so the `.` cannot occur inside one.
 *
 * Keyed off `AUTH_SECRET` under a label of its own, the arrangement `customDataSignature.ts`
 * uses. With no secret configured — local work without one — the value is written bare, and
 * behaves as an unsigned one: a URL campaign still sticks, a code-only one does not.
 */

import { createHmac, timingSafeEqual } from 'crypto'

const LABEL = 'strumfolio:coupon-cookie:v1'

function mac(code: string, secret: string | undefined): string | null {
  if (!secret) return null
  const key = createHmac('sha256', secret).update(LABEL).digest()
  return createHmac('sha256', key).update(code).digest('base64url')
}

/** The value to write for a code this server has just checked. */
export function couponCookieValue(code: string, secret = process.env.AUTH_SECRET): string {
  const signature = mac(code, secret)
  return signature === null ? code : `${code}.${signature}`
}

/** The code a cookie carries and whether this server wrote it, or `null` for an empty one. */
export function readCouponCookie(
  raw: string | null | undefined,
  secret = process.env.AUTH_SECRET,
): { code: string; signed: boolean } | null {
  if (raw === null || raw === undefined || raw === '') return null
  const dot = raw.indexOf('.')
  if (dot === -1) return { code: raw, signed: false }

  const code = raw.slice(0, dot)
  const given = raw.slice(dot + 1)
  const expected = mac(code, secret)
  const signed =
    expected !== null && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  return { code, signed }
}

/** Just the code, for the places that show it or compare it and decide nothing on it. */
export function couponCookieCode(raw: string | null | undefined): string | null {
  return readCouponCookie(raw)?.code ?? null
}
