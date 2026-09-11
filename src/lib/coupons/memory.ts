'use client'

/**
 * The browser's own memory of a coupon it arrived with, beside the cookie rather than instead
 * of it.
 *
 * **What this fixes.** `applyCoupon`/`rememberUrlCoupon` write `songbook-coupon` with a
 * `Max-Age` of `min(thirty days, whatever is left of the campaign)`. Thirty days is the
 * attribution window, not a judgement about the offer — see `COUPON_MEMORY_KEY` — so a reader
 * who clicked an advertisement in March was shown the full listino in May while the campaign
 * was still running, with nothing anywhere to say they had ever been offered anything. The
 * cookie stays exactly as it is; this is what lets it be rewritten afterwards.
 *
 * **The cookie remains the only thing the server reads.** Nothing here decides a price, a
 * discount or a state: it holds a code, `CouponMemory` hands that code to `rememberUrlCoupon`,
 * and that function re-reads the row and re-checks the campaign's state, its window, both
 * ceilings and its `entry` before writing a cookie. So this is a pointer to a pointer, and a
 * tampered value buys a browser the same thing a tampered cookie does, which is nothing.
 *
 * Every accessor swallows its own failure. Private mode, a full quota and storage disabled
 * outright all mean "no memory", which is the state this shipped to fix and therefore one the
 * app already handles: the reader sees the listino, exactly as they do today past day thirty.
 *
 * **Not `keyFor`.** Every other key in this app is account-scoped and must be — see
 * `lib/storage/scope.ts` — but `keyFor` answers `null` with no scope cookie, and somebody who
 * has just clicked an advertisement is the whole audience for this. It is a device key for the
 * same reason `songs:theme` is: a publicly advertised discount code is not one account's
 * private data, and the browser that clicked the link is the thing being remembered.
 */

import { COUPON_MEMORY_KEY, COUPON_RESTORE_MARKER, isCodeShape, normalizeCode } from './types'

/** Remember a code this browser legitimately arrived with. Idempotent, so the three pages that
 *  mount `CouponMemory` can each write it without coordinating. */
export function rememberOffer(code: string): void {
  try {
    window.localStorage.setItem(COUPON_MEMORY_KEY, normalizeCode(code))
  } catch {
    // No storage. The cookie still carries the offer for as long as it lives.
  }
}

/**
 * The code this browser is carrying, or `null`.
 *
 * Re-shaped and re-checked on the way out rather than trusted: this value is writable by
 * anything running on the page, and `rememberUrlCoupon` would answer a refusal to a malformed
 * one anyway — refusing here costs no round trip to find that out.
 */
export function rememberedOffer(): string | null {
  try {
    const stored = window.localStorage.getItem(COUPON_MEMORY_KEY)
    if (stored === null) return null
    const code = normalizeCode(stored)
    return isCodeShape(code) ? code : null
  } catch {
    return null
  }
}

/**
 * Forget it — `CouponBar`'s «Remove», and nothing else.
 *
 * The one call that matters for this whole feature to be wanted rather than resented: without
 * it, a reader who removes a coupon gets it back on their next visit, which is the «Remove»
 * bug over again on a longer timer.
 *
 * Sign-out deliberately does *not* call this. `clearLocalStorageForSignOut` skips device keys,
 * so the offer survives, which is right: it belongs to the browser that clicked the
 * advertisement and not to whoever happened to be signed in on it.
 */
export function forgetOffer(): void {
  try {
    window.localStorage.removeItem(COUPON_MEMORY_KEY)
    window.sessionStorage.removeItem(COUPON_RESTORE_MARKER)
  } catch {
    // Nothing stored, nothing to forget.
  }
}

/**
 * Claim this browsing session's single restore attempt, answering whether it was still going.
 *
 * Reads and writes in one call so there is no window between the two — two components mounting
 * in the same tick would otherwise both see "not yet" and both make the round trip. See
 * `COUPON_RESTORE_MARKER` for why the attempt is bounded at all.
 *
 * Answers `false` when storage is unavailable, which refuses the attempt rather than repeating
 * it on every page load: a browser that cannot remember the marker cannot have a memory to
 * restore from either.
 */
export function claimRestoreAttempt(): boolean {
  try {
    if (window.sessionStorage.getItem(COUPON_RESTORE_MARKER) === '1') return false
    window.sessionStorage.setItem(COUPON_RESTORE_MARKER, '1')
    return true
  } catch {
    return false
  }
}
