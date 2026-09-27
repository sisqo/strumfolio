# Consent and Google Ads measurement

Built 2026-09-27 ahead of the first Google Ads campaigns. **Switched off until three variables
exist**: `NEXT_PUBLIC_GOOGLE_ADS_ID` (`AW-…`), `NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL`,
`NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL`. `adsConfig()` (`state.ts`) is null unless all three are
present and the id matches `AW-\d+`. While it is null there is no banner, no tag, no region
cookie, no «Cookie settings», and the legal pages print their pre-Ads text. They are
`NEXT_PUBLIC_*`, so they are baked in at build time: set them in Production **before** the push
that should switch the feature on, because `vercel redeploy` is blocked. Give Preview a test
account's id only, never production's.

## What was decided, and why

- **Consent Mode *basic*.** gtag.js is not loaded before a «yes» and not after a «no», and there
  are no cookieless pings. That is the only way the Cookie Policy can say «nothing from Google is
  loaded at all» without an exception. It costs the modelled conversions that *advanced* mode
  would give. `consent default` (all denied) still comes first inside `loadGtag`, immediately
  followed by the `update`.
- **Conversions only, no remarketing.** `ad_personalization` is never granted, and
  `allow_ad_personalization_signals: false` is set too. The banner offers one choice. A second
  purpose means a second choice in the banner, a bump to `CONSENT_VERSION`, and new legal text.
- **The EEA, UK and Switzerland are asked; everywhere else starts granted.** The region comes
  from `x-vercel-ip-country` in the middleware, which writes the `songbook-region` cookie. It is
  not httpOnly: the landing page, the blog and the tools are prerendered, so only the browser can
  act on it.
  - **An unknown country counts as the EEA** (`requiresConsent`), and so does a missing cookie
    (`parseRegion`). Never invert either.
  - An answer the reader gave wins everywhere, including a «no» from outside the EEA, which is
    why «Cookie settings» sits in the footer for everybody.
  - Outside production, `?region=eea|other` overrides the region and sticks (the `qaAllowed`
    allowlist). That is how the non-EEA branch gets tested locally.
- **The answer lives in `songbook-consent` for 182 days** (`v:ads:at`). No server-side log: in
  basic mode a refusal sends nothing, so nothing needs proving. A stored answer from an older
  `CONSENT_VERSION` counts as no answer. **Bump the version** whenever what «Accept» agrees to
  changes.
- **Where the banner shows by itself: `bannerAllowedOn`.** That means the public pages
  (`isOutsideAppPath`), a visitor's `/` and `/checkout/[plan]`. It never shows on a reading,
  editing or `/follow` screen, because the app is used on stage. `ConsentManager` is mounted
  once, in the root layout. It loads the tag on *every* page where consent is granted, because
  conversions happen on signed-in screens. «Cookie settings» (`CookieSettingsButton`, in
  `Footer`, which is on almost every screen) opens the banner anywhere. `/app-settings` has no
  such row: it is owner-only.
- **The banner's two buttons are both plain `.btn`**, neither of them primary, and the X counts as
  a reject: the Garante wants refusing to be exactly as easy and as prominent as accepting. It is
  a non-blocking card, never a wall.
- **The attribution and coupon cookies stay on legitimate interest**, outside the banner.
  Refusing Google turns neither of them off, and the Cookie Policy §3 says so.

## The two conversions

- **Signup.** `markSignupConversion()` (`server.ts`) writes `songbook-conv-signup` (10 minutes,
  not httpOnly). It is called from `verifyEmail()` before `redirect('/')`, and from the `signIn`
  callback's `created` branch in `auth.ts`. **It writes only when the request's own cookies
  already allow the tag**, because a cookie that exists only for Ads cannot be written before
  consent. `ConsentManager` re-reads on every `pathname` change, since the redirect is a client
  navigation and does not remount it. It fires `trackSignup()` and deletes the cookie. A
  verification opened on another device carries no consent cookie, so that conversion is lost,
  knowingly. `server.ts` is deliberately not a `'use server'` module: exporting the writer from one
  would let a browser set the cookie for itself.
- **Purchase.** Fired from `PaddleCheckout`'s `checkout.completed`, with `transaction_id` set to
  Paddle's `transaction_id` (Ads deduplicates on it), `value` from `totals.total` and `currency`
  from `currency_code`.
  - **The value is gross**: tax included, after the coupon. With `tax_mode: internal` that is the
    list price, the same figure `/pricing` prints.
  - **Not from `PayFrame` (`/pay`)**, which settles Paddle's dunning emails, i.e. renewals.
  - A plan change never opens a checkout, so it never counts.

## The gclid handed over after a late «yes»

Because the card does not block, a visitor can land on `/?gclid=…`, browse, and accept on
`/pricing`. By then the gclid has left the URL, the tag never writes `_gcl_aw`, and every
conversion from that click goes unattributed. So on accept, `acceptedClickId()` (`actions.ts`)
returns the latest Google click stored in the httpOnly `songbook-attribution` cookie
(`gclidOf`). It answers only when the request's own consent cookie already allows the tag, and
it hands over the gclid and nothing else. `loadGtag` then puts `gclid` back into the URL with
`history.replaceState` and restores the URL in the manual `page_view`'s `event_callback` (with a
3-second `event_timeout`, and a 5-second fallback), only if nobody has navigated in the meantime.

**This is the one door through which the attribution cookie's content reaches a third party**,
which is why the Cookie Policy's attribution paragraph and the Privacy Policy §2 both name the
exception.

**Measured on 2026-09-27** locally, with a fake `AW-` id, against the real gtag.js:

- Accepting on the landing URL writes `_gcl_aw=GCL.<ts>.<gclid>`.
- Accepting on `/pricing` after landing on `/?gclid=…` writes it too, and the address bar ends
  back on `/pricing`.
- Two things were tried and dropped:
  - **Passing the gclid only as `page_location`** writes nothing.
  - **Restoring on the script's `onload`** is too early: the tag reads the restored URL.

Check it again on the first live campaign.

## The legal text moves with this module

Everything is printed only when `adsConfig()` is non-null (the `plansEnforced()` pattern). Change
the behaviour and every one of these is wrong:

- **Cookie Policy**
  - §2, the essential-cookies paragraph: the consent and region cookies.
  - §2, the attribution paragraph: the gclid exception.
  - §2, «Google Ads measurement — only if you accept», and «No other advertising…».
  - §3: consent, and the fact that refusing does not stop the two first-party cookies.
- **Privacy Policy**
  - §2, the attribution paragraph and «Advertising measurement».
  - §3, the Art. 6(1)(a) row.
  - §4, Google Ireland as an independent controller, plus the «do not sell» sentence.
  - §6, retention.
  - §7, the withdraw-consent bullet.
- **`Landing.tsx`'s `HERO_SUBHEAD` comment**: «no ads» means none is *shown*.

## Traps

- **`sw.ts` sends Google's hosts `NetworkOnly`** (`GOOGLE_ADS_HOSTS`). Without that rule,
  `defaultCache`'s cross-origin catch-all would cache gtag.js and the conversion pings for an
  hour, and answer a ping from cache when offline.
- **Withdrawing reloads the page** (`withdrawConsent`). It is the only reliable way to unload a
  running tag. The `_gcl_*` cookies are deleted on the host and its parent domain first.
- **Coupon overlay (z 40), feedback launcher (45), banner (50).** The banner sits on top because
  it is the one waiting for an answer.
- **Enhanced conversions and offline import were deliberately not built.** Both send Google data
  tied to a person, and both would need a server-side consent record (`consent_events`, a
  migration on all three databases). Measure the loss first, comparing Ads with `/leads` and
  `paddle_events`, then decide.
