'use server'

/**
 * Opening a real Paddle checkout, from the server.
 *
 * **The transaction is created here and the browser is handed only its id**, which is the
 * whole shape of this file and not an implementation detail. `mockPurchase` refuses to take a
 * coupon as an argument because «a code travelling as a parameter is a self-service discount
 * of any size»; the same reasoning applied to Paddle rules out the documented client-side form
 * — `Paddle.Checkout.open({ items: [{ priceId }] })` — where the page decides what is bought
 * and, once Discounts exist, what it costs. Here the plan is checked, the price is looked up,
 * the account is stamped on, and `Checkout.open({ transactionId })` can only open what the
 * server already decided.
 *
 * **`custom_data.account_id` is the contract `webhook.ts` depends on.** It is the only one of
 * that file's three ways to find an account that works on a *first* purchase, when neither
 * `paddle_customer_id` nor `paddle_subscription_id` has been written yet. Numeric `accounts.id`
 * rather than the address, per `db/CLAUDE.md`: an email in Paddle's records goes stale the day
 * somebody changes theirs.
 *
 * **A coupon refuses the sale rather than being ignored, and that is deliberate.**
 * `lib/coupons/` decides discounts natively and Paddle has no Discount objects behind any of
 * them yet. Proceeding would charge the listino to somebody the page has just promised 30%
 * off — the shown-price/charged-price gap inverted into the direction that takes *more* money
 * than was advertised, which is the one version of it nobody can be asked to accept. So while
 * a redeemable campaign is in play this answers `coupon-unsupported` and sells nothing. The
 * gate disappears when the campaigns have `paddle_discount_id` to pass as `discount_id`.
 */

import { eq } from 'drizzle-orm'

import { currentUser } from '@/lib/auth/session'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'

import { paddleClient } from './paddleClient'
import { paddlePriceId } from './paddlePrices'
import { isCheckoutPlan, type BillingPeriod } from './prices'
import { redeemableCouponFor } from './redeemable'

export type PaddleCheckoutFailure =
  | 'not-configured'
  | 'no-database'
  | 'no-session'
  | 'invalid-plan'
  | 'no-price'
  | 'coupon-unsupported'
  | 'failed'

export type PaddleCheckoutResult =
  | { ok: true; transactionId: string }
  | { ok: false; reason: PaddleCheckoutFailure }

/**
 * `cycle` is nullable because Lifetime has none, and `paddlePriceId` refuses the mismatch in
 * either direction rather than guessing — a cycle passed for Lifetime, or none passed for a
 * plan that renews, answers `no-price` instead of selling something nobody chose.
 */
export async function startPaddleCheckout(
  plan: string,
  cycle: BillingPeriod | null,
): Promise<PaddleCheckoutResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  if (!isCheckoutPlan(plan)) return { ok: false, reason: 'invalid-plan' }

  const paddle = paddleClient()
  if (paddle === null) return { ok: false, reason: 'not-configured' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  /* The browser picks a cycle, never a price: which price that cycle is sold at is decided
     here, from the table, so a tampered value can only ever name a plan we do sell. */
  const priceId = paddlePriceId(plan, plan === 'lifetime' ? null : cycle)
  if (priceId === null) return { ok: false, reason: 'no-price' }

  try {
    const coupon = await redeemableCouponFor(plan, user.accountOwnerEmail)
    if (coupon !== null) return { ok: false, reason: 'coupon-unsupported' }

    const [account] = await db()
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.ownerEmail, user.accountOwnerEmail))
      .limit(1)

    if (!account) return { ok: false, reason: 'failed' }

    const transaction = await paddle.transactions.create({
      items: [{ priceId, quantity: 1 }],
      customData: { account_id: account.id },
    })

    return { ok: true, transactionId: transaction.id }
  } catch (error) {
    console.error('startPaddleCheckout failed', error)
    return { ok: false, reason: 'failed' }
  }
}
