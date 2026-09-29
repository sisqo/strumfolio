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
- **Inside the EEA, only a visitor who arrived from an ad is asked** (decided 2026-09-27, the
  same day, after the first version asked everybody). `songbook-ad-click` (`1`, not httpOnly,
  90 days like the attribution cookie) is written by the middleware whenever
  `songbook-attribution` holds a gclid (`adClickCookieFor`, via `gclidOf`). It is the one bit of
  that httpOnly cookie the page may read, never the click id. Without the flag, an EEA visitor
  with no answer gets no banner and no tag. «Cookie settings» still lets them opt in, and the
  first ad click after an organic visit makes the banner appear. The cost, accepted: the
  view-through conversions of somebody who saw an ad and came back by search. Outside the EEA
  nothing changed: the tag loads with or without a click.
- **Outside the EEA the legal basis is legitimate interest, Art. 6(1)(f)**, and the legal text
  says so: the Privacy §3 row names both bases, §7 adds it to the objection list, and «Cookie
  settings» is the way to object. It says so because the controller is in Italy, so GDPR covers
  every visitor (Art. 3(1)). «Only if you accept» was printed until the review and was false
  for that branch. **Whether legitimate interest holds for that branch is the owner's call and
  not yet confirmed.** Asking everybody would remove the question.
- **The region: the EEA, UK and Switzerland need a «yes»; everywhere else starts granted.** The region comes
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
- **Where the banner shows by itself: `bannerAllowedOn`** (and only for an ad arrival, above).
  On `/`, `ConsentManager` asks the DOM whether `.landing-hero` is on screen instead of asking
  RoleProvider. `verifyEmail` and `/qa` end in a client-side `redirect('/')`, and until the
  identity is re-read the provider still said «signed out» over the reader's own home.
  (RoleProvider now re-asks when leaving `/verify` and `/qa` too, not only `/login`.) That means the public pages
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

## Google is never shown a secret address

gtag.js puts the page's address on every hit. Several addresses here carry a secret or a person:

- `/verify?email=…&token=…` (the token chooses the account's password);
- `/reset-password`, `/courtesy-unsubscribe`, `/follow/<token>`, `/accounts/<email>`.

The 2026-09-27 review found that accepting on `/register` and then opening the verification link
sent Google the address and the live token.

**`page_location` does not fix it, measured.** With `page_location` set to `/follow`, both by
`set` and on `config` and on the page view, the `ccm/collect` page view still reached Google
with `dl=…/follow/<token>`. So the rule is structural:

- **`tagAllowedOn(pathname, search)`** (`state.ts`, tested) is where the tag may be loaded at all:
  - `/`, the landing page and the home the signup conversion fires on;
  - `/checkout/<plan>`;
  - the public pages, except `TAG_NEVER` (`/verify`, `/reset-password`, `/courtesy-unsubscribe`,
    `/qa`, `/pay`) and `/follow/…`;
  - no screen inside the app;
  - **and never when the query carries `email` or `token`** (`SECRET_PARAMS`), whatever the path.
    A sign-in with an unverified address lands on `/login?unverified=1&email=…`, which the path
    alone allowed until 2026-09-29. `search` is required, and every load decision in
    `ConsentManager` reads `location.search` live: a redirect that changes only the query keeps
    the pathname, so the effect does not re-run and the banner can still be on screen.
- **The banner never appears on a page the tag may not load on.** An «Accept» given there
  through «Cookie settings» keeps its recovered gclid (`pendingClick`) for the first page that
  may load it.
- **Once loaded, the tag stays resident across client navigations and sends nothing by
  itself.** Measured: no request while moving from `/` into a songbook and a song. A hit is
  only ever sent from an allowed page, so the signup cookie waits, for up to ten minutes, for one.
  One side case: a browser «back» onto `/` did not re-run the effect in Playwright, so the
  cookie waited for the next navigation.
- **`tellPage()` still sets `page_location` and `page_referrer`** from `tagPageLocation` and
  `tagReferrer` (query cut to the click ids, in-app paths as `/app`), as a second layer for the
  fields that do honour it.
- **`allow_enhanced_conversions: false`**, so a switch in the Ads dashboard cannot start reading
  email fields off our forms.
- **A new public path whose URL carries a secret goes into `TAG_NEVER`**, and a new query
  parameter that carries one into `SECRET_PARAMS`.

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

**Verified and not verified (2026-09-27, locally, fake `AW-` id, real gtag.js):**

- **Verified.**
  - *Email signup:* accept on `/register`, then register, then open the verification link from
    the dev log, then choose the password. Result: a `pagead/conversion` request on `/`, with the
    cookie gone. (Locally this needs `NEXT_PUBLIC_TURNSTILE_SITE_KEY=` and
    `TURNSTILE_SECRET_KEY=` set empty on the `npm run dev` line, since the widget never loads on
    `localhost`.)
  - *Basic mode:* zero requests to Google before an answer and after a refusal.
  - *Withdrawal:* withdrawing from the footer deletes `_gcl_*`, and nothing is requested after
    the reload.
  - *Region override:* `?region=other` loads the tag without a banner, and the value sticks.
  - *The ad-click rule:*
    - an organic EEA visitor gets no banner and no request;
    - «Cookie settings» still opts them in;
    - a `?gclid=` arrival gets the banner on later pages too, and again after an organic return.
- **Not verified.**
  - **The Google signup path**: the cookie is set with `cookies().set` inside the Auth.js
    `signIn` callback, in a route handler whose redirect Auth.js builds itself. Nothing else in
    the repo writes a cookie from there.
  - **The purchase**: `trackPurchase` has never fired. The first sandbox run on the preview
    (`INTEGRATION-TESTS.md`) must confirm that the conversion carries `transaction_id`. The unit
    is settled by Paddle's reference for `checkout.completed` (checked 2026-09-27): Paddle.js
    events carry totals as decimal numbers (`"total": 32.66`), unlike the API's
    lowest-denomination strings, so `totals.total` goes to Ads unconverted.
  - **`sw.ts`'s `NetworkOnly` rule** for Google hosts, since Serwist is disabled under `next
    dev`. Check it on the preview build.
  - **The referrer (`dr`)**, open since the 2026-09-29 review. `page_referrer` is set from
    `tagReferrer`, but nobody has measured that `ccm/collect` honours it, and `page_location` was
    measured not to override `dl`. The case that matters: `/verify`'s form keeps its native
    fallback, so a submit before hydration is a full load of `/` whose `document.referrer` is
    `/verify?email=…&token=…` (no Referrer-Policy is set anywhere). The token is spent by then;
    the address is not. The fix, not taken: `referrer: 'no-referrer'` in the metadata of the
    pages whose address carries a secret.

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
  - §2, the essential-cookies paragraph: the consent, region and ad-click cookies.
  - §2, the attribution paragraph: the gclid exception.
  - §2, the Google Ads paragraph: its own cookies on its own domains, which cannot be deleted
    from here, and the pages the tag is never loaded on (`tagAllowedOn`).
  - §3: the two legal bases.
  - §2, «Google Ads measurement — only if you accept», and «No other advertising…».
  - §3: consent, and the fact that refusing does not stop the two first-party cookies.
- **Privacy Policy**
  - §2, the attribution paragraph and «Advertising measurement».
  - §3, the row with both bases.
  - §7, the objection list and «Cookie settings» as the way to object.
  - §4, Google Ireland as an independent controller, plus the «do not sell» sentence.
  - §6, retention.
  - §7, the withdraw-consent bullet.
- **`Landing.tsx`'s `HERO_SUBHEAD` comment**: «no ads» means none is *shown*.

## Traps

- **`sw.ts` sends Google's hosts `NetworkOnly`** (`GOOGLE_ADS_HOSTS`), including
  `google.<country>`, since the tag pings the visitor's own Google domain. Without that rule,
  `defaultCache`'s cross-origin catch-all would cache gtag.js and the conversion pings for an
  hour, and answer a ping from cache when offline.
- **An «Accept» in flight blocks the loader** (`accepting` in `ConsentManager`). Otherwise a
  navigation during `acceptedClickId()` would load the tag without the gclid, and the second
  `loadGtag` would be a no-op.
- **The gclid can stay in one history entry**: follow a link within the three to five seconds
  before `putBack`, and the previous entry keeps `?gclid=…`. Cosmetic, and accepted.
- **Withdrawing reloads the page** (`withdrawConsent`). It is the only reliable way to unload a
  running tag. The `_gcl_*` cookies are deleted on the host and its parent domain first.
- **Coupon overlay (z 40), feedback launcher (45), banner (50).** The banner sits on top because
  it is the one waiting for an answer.
- **Enhanced conversions and offline import were deliberately not built.** Both send Google data
  tied to a person, and both would need a server-side consent record (`consent_events`, a
  migration on all three databases). Measure the loss first, comparing Ads with `/leads` and
  `paddle_events`, then decide.
