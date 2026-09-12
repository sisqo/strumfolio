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
 * A sibling plain module is the pattern `testCard.ts` set beside the same file.
 */

import { cookies } from 'next/headers'

import { activeCoupon, redeemability, type Campaign } from '@/lib/coupons/read'
import { COUPON_COOKIE } from '@/lib/coupons/types'

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
