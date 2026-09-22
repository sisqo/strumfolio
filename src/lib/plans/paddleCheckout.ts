'use server'

/**
 * Opening a real Paddle checkout, from the server.
 *
 * **The transaction is created here and the browser is handed only its id**, which is the
 * whole shape of this file and not an implementation detail. This file refuses to take a
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
 * **A coupon with no Paddle Discount behind it refuses the sale, and that is deliberate.** Until
 * 2026-09-14 the refusal was wider — *any* redeemable campaign stopped the sale, because no
 * campaign had a Discount entity at all. It is narrowed rather than lifted, and the narrow form
 * is the invariant the whole coupon feature rests on: the question is not «is a coupon in
 * play», it is «can this exact plan and cycle be charged at the discounted price». A campaign
 * whose sync never ran, one that covers no Lifetime, a cycle whose prices could not all be
 * named — each arrives here with no `dsc_…` and each answers `coupon-unsupported`. Proceeding
 * would charge the listino to somebody the page has just promised 30% off: the
 * shown-price/charged-price gap inverted into the direction that takes *more* money than was
 * advertised, which is the one version of it nobody can be asked to accept.
 *
 * **The discount travels as an id and never as a code.** `enabled_for_checkout: false` means
 * Paddle generates none, so there is nothing for a reader to type and nothing for a tampered
 * parameter to carry — the same argument that keeps the coupon out of this file's arguments
 * and out of Paddle's own «Add discount code» field (`showAddDiscounts: false`).
 *
 * **`custom_data.coupon_campaign_id` is the second half of the webhook contract.** It is how
 * `webhookApply.ts` knows which campaign to write a `coupon_redemptions` row against, and the
 * insert is what makes every campaign ceiling verifiable. The stamp is *not* proof of a first
 * purchase: Paddle carries a transaction's `custom_data` onto the subscription it opens, so a
 * renewal can arrive carrying it too. The unique index is what tells the two apart, and the
 * webhook writes the account's discount columns only when the insert actually took a row.
 *
 * **The screen decides what is offered; this decides what is done.** `/checkout/[plan]` reads
 * `checkoutMode` to draw «Pay» or «Switch», and that read is a page render where this is a
 * press — two tabs open on the same checkout, a purchase completed in one, and the other still
 * draws a button whose action would open a second subscription beside the first. So the
 * subscription is read again here, exactly as `changePaddlePlan` already re-reads it for the
 * mirror image of the same reason.
 */

import { eq } from 'drizzle-orm'

import { currentUser } from '@/lib/auth/session'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'

import { discountIdFor } from '@/lib/coupons/paddleDiscount'

import { livePaddleSubscription } from './paddleAccount'
import { paddleClient } from './paddleClient'
import { lifetimeRefusal, wouldBeSecondSubscription } from './planChange'
import { paddlePriceId } from './paddlePrices'
import { isCheckoutPlan, type BillingPeriod } from './prices'
import { redeemableCouponFor } from './redeemable'
import { holdsLifetime } from './resolve'

import { loadLifetimeOnSale } from '@/lib/settings/read'

export type PaddleCheckoutFailure =
  | 'not-configured'
  | 'no-database'
  | 'no-session'
  | 'invalid-plan'
  | 'no-price'
  | 'coupon-unsupported'
  /** A subscription is already running on this account, so this press would open a second. */
  | 'already-subscribed'
  /** The owner has taken the Lifetime off sale (`lifetime.on_sale`). */
  | 'lifetime-not-on-sale'
  /** This account already holds a Lifetime, so there is nothing left to buy. */
  | 'already-lifetime'
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

  /*
   * **The rule is `wouldBeSecondSubscription`, which owns the argument for why it is not
   * `checkoutMode`** — only a subscription Paddle confirms is running refuses this, Lifetime
   * refuses nothing, and an unreadable answer sells rather than blocking a first purchase.
   *
   * **What it closes and what it does not**, since the difference is invisible from here.
   * `livePaddleSubscription` reads `accounts.paddle_subscription_id`, which the *webhook*
   * writes — so a press made once the first purchase has been recorded is refused, and one made
   * in the seconds before that delivery lands still finds an empty column. The stale tab is the
   * reachable case and is closed; the race inside the webhook's own window is not, and is not
   * claimed to be.
   *
   * One Paddle call on the buy path, and only where the answer can change what happens: not for
   * a reader with no id on their row, which is everybody making a first purchase, and **not for
   * Lifetime**, which the rule exempts — reading Paddle there only to discard the answer would
   * put a round trip and a failure surface in front of the one sale that must never wait on it.
   */
  /* The screen asks the same question (`lifetimeRefusal`); this is the press, which must not
     trust a render that may be hours old. */
  if (plan === 'lifetime') {
    const [onSale, holds] = await Promise.all([loadLifetimeOnSale(), holdsLifetime(user.accountOwnerEmail)])
    const refused = lifetimeRefusal(onSale, holds)
    if (refused !== null) return { ok: false, reason: refused }
  }

  const live = plan === 'lifetime' ? null : await livePaddleSubscription()
  if (live !== null && wouldBeSecondSubscription(plan, live)) {
    return { ok: false, reason: 'already-subscribed' }
  }

  try {
    /*
     * Re-read here rather than accepted from the screen, the same split this file's header
     * states about the subscription: `/checkout/[plan]` decides what is *offered* and this
     * decides what is *done*, so a campaign that ran out of its ceiling between the render and
     * the press sells at the listino the reader is about to be shown, not at a discount that no
     * longer exists.
     */
    const coupon = await redeemableCouponFor(plan, user.accountOwnerEmail)
    const discountId = coupon === null ? null : discountIdFor(coupon, plan, plan === 'lifetime' ? null : cycle)
    if (coupon !== null && discountId === null) return { ok: false, reason: 'coupon-unsupported' }

    const [account] = await db()
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.ownerEmail, user.accountOwnerEmail))
      .limit(1)

    if (!account) return { ok: false, reason: 'failed' }

    const transaction = await paddle.transactions.create({
      items: [{ priceId, quantity: 1 }],
      ...(discountId === null ? {} : { discountId }),
      customData: {
        account_id: account.id,
        ...(coupon === null ? {} : { coupon_campaign_id: coupon.id }),
      },
    })

    return { ok: true, transactionId: transaction.id }
  } catch (error) {
    console.error('startPaddleCheckout failed', error)
    return { ok: false, reason: 'failed' }
  }
}
