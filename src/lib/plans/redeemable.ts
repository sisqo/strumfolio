/**
 * The campaign a purchase may actually redeem, re-read from the server's own cookie.
 *
 * **The one place a coupon becomes money, and therefore the one place it is decided.** Nothing
 * client-side reaches this: the code comes from the request's own cookie jar, the campaign from
 * the table, and `redeemability` re-checks every gate — state, window, both ceilings, whether
 * the campaign covers this plan at all, and whether this account has redeemed it before.
 *
 * `null` for every refusal, and the purchase then proceeds at the listino. That is deliberate:
 * declining to sell a plan because a discount lapsed between two page loads would be the more
 * surprising behaviour of the two, and the screen has no discount left to show by the time
 * anybody reloads it.
 *
 * Never throws — a coupon system being unreachable must not be a reason a plan cannot be
 * bought.
 *
 * **Here rather than inside `checkout.ts`, where it was written**, because a second caller
 * arrived: the Paddle checkout has to make the same decision about the same cookie, and the
 * two must not be able to disagree. `checkout.ts` carries `'use server'`, where every export
 * becomes an endpoint the browser can call — so exporting it from there would have turned an
 * internal decision into a public one, the defect this repo already found and fixed once.
 * A sibling plain module is the pattern `paddleClient.ts` set beside the same file.
 */

import { cookies } from 'next/headers'

import { activeCoupon, redeemability, type Campaign } from '@/lib/coupons/read'
import { COUPON_COOKIE, type CouponFailure } from '@/lib/coupons/types'

import type { CheckoutPlan } from './prices'

export async function redeemableCouponFor(
  plan: CheckoutPlan,
  accountOwnerEmail: string,
): Promise<Campaign | null> {
  try {
    const cookie = (await cookies()).get(COUPON_COOKIE)?.value ?? null
    if (cookie === null) return null

    const campaign = await activeCoupon({ cookie })
    if (campaign === null) return null

    const allowed = await redeemability(campaign, plan, accountOwnerEmail)
    return allowed.ok ? campaign : null
  } catch (error) {
    console.error('redeemableCouponFor failed', error)
    return null
  }
}

/**
 * The same question `redeemableCouponFor` answers, with the reason kept — for the **screen**,
 * which until 2026-09-15 was not asking it at all.
 *
 * `/checkout/[plan]` decided what to show from `activeCoupon` alone, which answers «a campaign
 * exists and covers this plan» and nothing about the ceilings, the window or whether this
 * account has already redeemed. The charge went through the function above, which asks all
 * three. So a reader who had spent their code was shown the Lifetime at €139.99 and handed a
 * transaction for €199.99 — the shown-price/charged-price gap, in the direction that takes more
 * money than was advertised. Both paths ask `redeemability` now, and this is how the screen
 * does it.
 *
 * **A failure answers `'failed'`, which refuses rather than allows**, and that is the half worth
 * stating: `redeemableCouponFor` swallows its own errors and answers `null`, which makes the
 * charge fall back to the listino. Answering «no refusal» here on the same error would put the
 * discount back on the screen while the charge had already given up on it — the same gap again,
 * caused by the repair for it. Refusing on both keeps them saying one thing.
 *
 * Takes the campaign rather than reading the cookie, unlike its sibling: the page has already
 * resolved one, and resolving it twice could answer differently between two lines of the same
 * render.
 */
export async function couponRefusalFor(
  campaign: Campaign,
  plan: CheckoutPlan,
  accountOwnerEmail: string,
): Promise<CouponFailure | null> {
  try {
    const allowed = await redeemability(campaign, plan, accountOwnerEmail)
    return allowed.ok ? null : allowed.reason
  } catch (error) {
    console.error('couponRefusalFor failed', error)
    return 'failed'
  }
}
