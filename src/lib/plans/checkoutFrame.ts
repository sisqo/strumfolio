/**
 * The two halves of Paddle's inline frame that more than one page needs.
 *
 * Extracted from `PaddleCheckout.tsx` on 2026-09-19, when `/pay` became a second page that
 * opens a Paddle checkout — the one Paddle's own dunning email links to, carrying `_ptxn`.
 * Copying either of these there would have been two copies of one contract: the class name is
 * shared by a setting and a `div` and silently breaks when only one is renamed, and the
 * settings object carries three decisions (`theme`, `showAddDiscounts`, `allowDiscountRemoval`)
 * that must hold wherever a form is opened, not only on `/checkout/[plan]`.
 *
 * Nothing here is React and nothing reads a prop, which is why it is a module rather than a
 * hook: both call sites want the same object at the moment they open the frame.
 */

import type { CheckoutSettings } from '@paddle/paddle-js'

/**
 * The class Paddle renders its frame into. One string shared by the setting and the `div`,
 * because they are two halves of one contract: rename one and the checkout opens into nothing,
 * with no error anywhere.
 */
export const FRAME_TARGET = 'paddle-checkout-frame'

/**
 * How the payment form should look, read at the moment it is opened rather than once at mount.
 *
 * **The form is pinned to `light`, and it is the app's own theme that gives way.** Paddle's
 * branded inline checkout — every colour of it, set in the dashboard — has **one** palette for
 * both of its themes, and the moment any branding exists it stops giving the labels their dark
 * one (measured 2026-09-15; `CLAUDE.md` carries the whole of it). So a form that follows the
 * reader's theme is a form whose labels are unreadable for half of them. Pinned, every value in
 * that dashboard is chosen against one known background and is right by construction.
 *
 * **What this costs is visible and was chosen knowingly**: in the dark theme the payment form is
 * a light panel inside a dark page. The card below it is painted white for exactly that reason —
 * `frameStyle` keeps the frame transparent, so the ground is ours to set, and it can no longer
 * be `--surface`, which is `#181b21` in the dark theme and would put Paddle's black label text
 * on a near-black panel. That is worse than the mismatch, not better.
 *
 * It also retires a defect rather than trading one for another: the frame used to be re-opened
 * whenever the theme changed, because `updateCheckout` cannot restyle one — and re-opening threw
 * away a half-typed card number. A form that never changes theme never needs that.
 *
 * `one-page` because the default, `multi-page`, collects the details and then the card on two
 * screens, and an embedded frame changing height between them moves the page under the reader's
 * thumb.
 *
 * **`locale` is pinned to `en`, reversing what this comment used to argue.** It said Paddle should
 * follow the browser, so that «a reader whose phone is in Italian gets the payment form in
 * Italian, which is better than pinning it to the language this app happens to be written in».
 * That reasoning treats the form as a thing a reader arrives at on its own. It is not: it is a
 * frame inside our own page, under our own «Premium €9.99 a month» and above our own «Pay for
 * Premium», in an app with no language selector and no translation anywhere. So the form did not
 * meet a reader in their language — it put Italian labels and «2,44 €» inside an English screen
 * that had just written «€2.44» three lines above, which is two ways of writing one number on one
 * card. Paddle's own guidance points the same way: pass the locale «so that it matches», meant for
 * a site *with* a language selector, and this one's selector is the absence of one.
 *
 * **It bought the words and not the figures, and that half is not ours to set.** Measured on the
 * preview at `5596ede` on 2026-09-17: every label, button and date inside the frame is English —
 * «Email address», «Card details», «Cancel anytime.», «17 Oct 2026» — while the line under the
 * button still reads «2,44 € now, then 2,44 €/month from 17 Oct 2026», three lines under our own
 * «€2.44». So one sentence is printed in two locales, with its own dates in the other one. The
 * amounts follow neither this setting nor the form's country — moving it to Ireland through
 * `updateCheckout` left the string exactly as it was — and Paddle's own server-side formatter
 * disagrees with the frame as well: `pricingPreview` answers «€3.49» for IT, IE, DE, US and GB
 * alike, so there is no euro convention Paddle is applying on purpose. What survives that
 * elimination is the browser's preferred language — `navigator.languages[0]` is `it-IT` here, and
 * it is not the runtime's `Intl` default, which answers «€2.44» on this very machine. **That last
 * step is what is left standing and not what was measured**: closing it takes the same frame in
 * front of an English browser, which this run did not have. **There is no setting for it**: the
 * documented list carries `locale` and nothing about formatting. So the mismatch with our own
 * `euro()` stands until Paddle changes it, and chasing it from this file is wasted work.
 *
 * **It reaches further than the frame, which is the part worth knowing before anybody reverses it
 * again.** `startPaddleCheckout` creates the transaction with items, a discount and `customData`
 * and **no customer** — Paddle makes that record itself, from the email typed into this frame, and
 * `customers.locale` is what it then sends receipts and invoice PDFs in. Measured 2026-09-17: all
 * seven sandbox customers carry `locale: "it"`, taken from the browser, so the invoices were
 * Italian too. Since this app never sends a customer, this setting is the only thing upstream of
 * that field. **The frame is documented; the email is inference** — read a customer back after the
 * next purchase and confirm `locale: "en"` before treating it as settled.
 *
 * `frameStyle` carries no height: Paddle grows the frame as the form does, and a height of ours
 * is exactly what would clip the «merchant of record» footer it is required to show.
 */
export function checkoutSettings(): CheckoutSettings {
  return {
    theme: 'light',
    locale: 'en',
    displayMode: 'inline',
    variant: 'one-page',
    frameTarget: FRAME_TARGET,
    frameInitialHeight: 450,
    /* 286px is Paddle's floor with checkout padding off, 312px with it on. The page's own gutter
       leaves 343px at 375px of viewport, so the narrowest phone anybody reads this on clears
       both — but the number lives here rather than in a stylesheet because it is Paddle's
       requirement and not our layout's. */
    frameStyle: 'width: 100%; min-width: 286px; background-color: transparent; border: none;',
    /*
     * **Paddle's own discount field is off, and that is a correctness fix rather than tidiness.**
     * The coupon on this page is `CouponBar`, above the frame, and it is the only door wired to
     * `coupon_views`, `coupon_redemptions` and every campaign ceiling. A code typed into Paddle's
     * «Add discount» instead would produce a discounted charge with **no redemption row**, so
     * `times_used` would stay zero and `usage_limit` would quietly stop being a limit —
     * `coupons/CLAUDE.md` says the insert has to come back «in the same commit that lets a coupon
     * be sold», and this is the second path that could hand one out without passing through it.
     * So the setting goes in now and stays after Paddle Discounts exist, not only while they do
     * not.
     *
     * It also removes a field that would mostly fail: the only discounts this account has are
     * created with `enabled_for_checkout: false`, so Paddle generates no code for them and there
     * is nothing anybody could type there that would work.
     */
    showAddDiscounts: false,
    /*
     * **And the discount already applied cannot be taken off.** `allowDiscountRemoval` defaults
     * to `true`, which would let a reader remove the `dsc_…` the server attached to the
     * transaction — leaving the bar directly above the frame still saying the code is on these
     * prices while the frame charged the listino. The same shown-price/charged-price gap
     * `startPaddleCheckout` refuses a sale over, arriving by the one route the server cannot
     * see: the discount is decided here, on the server, from a cookie the page never gets to
     * argue with, and it stays decided.
     */
    allowDiscountRemoval: false,
  }
}
