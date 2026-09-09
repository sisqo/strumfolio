import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import type { NextFetchEvent, NextRequest } from 'next/server'

import { authConfig } from '@/auth.config'
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_COOKIE_MAX_DAYS,
  decodeAttribution,
  encodeAttribution,
  mergeTouch,
  readTouch,
} from '@/lib/attribution/touch'
import { SESSION_FREE_PATHS, isBlogPath, isFollowPath } from '@/lib/publicRoutes'
import { DEVICE_COOKIE } from '@/lib/strumTogether/devices'

const { auth } = NextAuth(authConfig)

/** Marks a response as belonging to nobody; the service worker refuses to cache it. */
const ANONYMOUS_HEADER = 'x-songs-anonymous'

/**
 * How long a follower's device id lives in their browser. A year, like `songbook-account`'s.
 *
 * Long deliberately, and the short alternative is the bug: the id is what a broadcast counts
 * its devices by, so an expiry that lands *during* a performance would make every follower
 * take the join path at once, each while its own row is still fresh, and the cap would refuse
 * the entire audience for two minutes. There is nothing to gain from a shorter life either —
 * the value authorises nothing and names nothing but a browser.
 */
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/**
 * Paths that must stay reachable without a session.
 *
 * The service worker and the icons are here deliberately: if `/sw.js` needed a
 * session, a service worker update after the cookie expired would fail, and the
 * app would be stuck on an old worker with no way to recover.
 *
 * Every favicon, PWA icon, lockup and OG image lives under `/brand/`
 * (`public/brand/`) for exactly this reason —
 * one prefix here instead of a line per file, which is what this used to be and
 * which had already been forgotten twice (once for favicon.svg/og-image.png, once
 * for the lockup SVGs) when a new brand asset showed up. `/brand/email/logo.png`
 * is the same folder for the same reason: fetched by whoever opens the email, or
 * by a link-preview bot reading OpenGraph tags — neither carries this app's
 * session cookie, ever. Without this, all of them would silently get the
 * `/login` redirect back instead of the image.
 *
 * `/brand/kit/` is under the same prefix and public on purpose, not by accident of
 * nesting: it is the brand asset drop hosted whole, so a logo at the size some
 * outside thing wants can be linked to by URL. Nothing there is secret and nothing
 * there is drawn by this app — treat what goes into that folder as published.
 */
function isPublicAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/api/auth') ||
    pathname === '/sw.js' ||
    pathname === '/sw.js.map' ||
    pathname.startsWith('/swe-worker-') ||
    pathname === '/manifest.webmanifest' ||
    /*
     * The two files a crawler asks for before it asks for anything else. They fall under
     * this middleware's matcher like any page — it excludes only `_next/static`,
     * `_next/image` and `favicon.ico` — so without these two lines both would answer a
     * redirect to `/login`, and a sitemap that redirects to a sign-in form is worse than no
     * sitemap at all: it tells Google every URL it advertises is unreachable. Assets rather
     * than pages, because that is what they are to whoever fetches them: no session, no
     * theme, nothing about the reader in the response.
     */
    pathname === '/sitemap.xml' ||
    pathname === '/robots.txt' ||
    pathname.startsWith('/brand/') ||
    /*
     * `public/promo/` — the device mockup the promotional panel stands beside. Same treatment
     * as `/brand/` and for the same reason: it is fetched by whoever opens a public page, and
     * by link-preview bots, neither of which carries this app's session cookie.
     *
     * Worth knowing why the *blog's* cover images need no line here: they live under
     * `/blog/`, so the article branch below already lets them through. Anything put in a new
     * folder under `public/` gets no such accident and answers a redirect to `/login` —
     * which is a broken image, and, through `next/image`, a 500 from the optimiser rather
     * than anything that names the cause.
     */
    pathname.startsWith('/promo/')
  )
}

/**
 * How long the attribution cookie lives, in seconds: ninety days from the most recent arrival
 * that counted, restarted by each one. `attribution/touch.ts` says why ninety and not thirty.
 */
const ATTRIBUTION_MAX_AGE_SECONDS = ATTRIBUTION_COOKIE_MAX_DAYS * 24 * 60 * 60

/**
 * The new value of the attribution cookie for this request, or `null` because there is nothing
 * to write.
 *
 * All the judgement is in `attribution/touch.ts`, which is a pure module covered by `npm test`;
 * this is the glue that hands it a `NextRequest` and nothing more. It stays here rather than in
 * that module so the module keeps importing nothing from `next/server` and remains testable.
 *
 * Two gates, and the second is the non-obvious one.
 *
 * **GET only.** A Server Action POSTs to the page's own URL, and Next.js does not merely put a
 * `Set-Cookie` on that response — it copies the value onto the *request*
 * (`x-middleware-set-cookie`) so that `cookies()` inside the action reads it. The device-id
 * branch below carries the same scar with the same explanation.
 *
 * **No session only.** Attribution is about acquisition and nothing else: every seam that
 * writes a row needs an address that is new, so a reader who already has a session cannot
 * produce one and their arrival is not worth recording. The gain is not the saved work — it is
 * that the `SESSION_FREE_PATHS` branch below can go on returning `undefined` for a signed-in
 * reader exactly as it does today, leaving the cacheability of their `/pricing` copy, which
 * that branch deliberately regulates, untouched.
 */
function attributionCookieFor(request: NextRequest & { auth?: unknown }): string | null {
  if (request.method !== 'GET') return null
  if (request.auth) return null

  const read = readTouch(request.nextUrl, request.headers.get('referer'), request.nextUrl.host, new Date())
  if (read === null) return null

  const merged = mergeTouch(decodeAttribution(request.cookies.get(ATTRIBUTION_COOKIE)?.value), read)
  if (merged === null) return null

  return encodeAttribution(merged)
}

/**
 * Put the attribution cookie on whatever response a branch decided to return.
 *
 * **Every exit of this middleware that a visitor can land on has to go through here**, and the
 * rule has not changed even though the example that used to illustrate it has. It read: the
 * expensive one to forget is the redirect to `/login`, because `/` required a session, so
 * `strumfolio.com/?utm_source=…` — the most ordinary campaign URL there is — reached that
 * branch and the redirect dropped the query string.
 *
 * **`/` is public now** (`(home)/layout.tsx` serves the landing page to anybody with no
 * session), so that URL lands in the `SESSION_FREE_PATHS` branch below with its parameters
 * intact and gets its cookie there. The redirect at the bottom still exists for every path that
 * does need a session — a bookmarked song, a shared songbook link — and still drops the query
 * string on the way, so it still has to carry the cookie. Nothing here to relax: one helper
 * called at each exit rather than a `response.cookies.set` copied five times.
 */
function withAttribution(response: NextResponse, value: string | null): NextResponse {
  if (value === null) return response

  response.cookies.set(ATTRIBUTION_COOKIE, value, {
    httpOnly: true,
    /* A click from Instagram, a newsletter or WhatsApp is a cross-site top-level navigation, so
       lax — the same reason the coupon and the follower device id are both lax. */
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ATTRIBUTION_MAX_AGE_SECONDS,
  })

  return response
}

/**
 * What `auth()` returns here, said out loud.
 *
 * next-auth types that one function for middleware *and* for route handlers, and TypeScript
 * picks the route-handler overload at the call below — which wants a `params` context where
 * middleware is handed a `NextFetchEvent`. The runtime shape is the middleware one:
 * `handleAuth` passes its second argument straight through to the callback (which ignores
 * it) and always answers with a `Response`.
 */
type SessionMiddleware = (request: NextRequest, event: NextFetchEvent) => Promise<Response>

const withSession = auth((request) => {
  const { pathname } = request.nextUrl

  /*
   * Computed once, before any branch, and handed to `withAttribution` at each exit. `null` for
   * the overwhelming majority of requests — a signed-in reader, a POST, an ordinary internal
   * navigation — in which case every `withAttribution` below is a no-op.
   */
  const attribution = attributionCookieFor(request)

  /* No cookie here, deliberately: these are assets — the service worker, the brand images,
     robots.txt, the promo mockup — fetched by browsers and link-preview bots, not landings
     anybody arrives on. A campaign URL never points at one. */
  if (isPublicAsset(pathname)) return

  /**
   * **`/` is the newest member of this list and the one that changes what the branch means.**
   * Every other path here is one page to everybody; `/` is the public landing page without a
   * session and the reader's own repertoire with one (`(home)/layout.tsx`). The conditional
   * shape below — `if (request.auth) return`, written for `/pricing` — is exactly right for it
   * and must not be "simplified" to the unconditional one `/follow` uses: a signed-in reader's
   * home may sit in the page caches like any other screen of theirs, while a visitor's copy is
   * marked anonymous and therefore never stored at all.
   *
   * That second half is load-bearing beyond privacy. `/` has its own `NetworkFirst` rule in
   * `sw.ts`, and `rejectUnauthenticated` refuses to store any response carrying this header,
   * so a browser that visits while signed out never files the *marketing page* under `/` and
   * is never handed it as the app's home screen afterwards. Nothing would fail and nothing
   * would say so — the same shape of silent bad cache `sw.ts`'s own header comment describes
   * for song URLs. Before `/` was public the redirect covered this by accident
   * (`response.redirected` is refused too); now it rests on this line.
   *
   * `/` was **precached** until 2026-09-09, and this paragraph named that as the mechanism.
   * It is the runtime cache now, and the header matters in the same way for it — with one
   * difference worth knowing: a precache entry is answered without ever asking the network,
   * so a bad one was permanent, while a `NetworkFirst` entry is replaced by the next online
   * navigation and only misleads offline. That the precache could not be corrected is
   * precisely what made signing out look as though it had failed; `sw.ts`'s home rule has
   * the account of it.
   *
   * The login page — and, since v3.2, registration and the whole self-serve email loop
   * next to it — is reachable without a session but still gets marked.
   *
   * `/verify`, `/forgot-password` and `/reset-password` all have to be here for
   * the same reason `/register` is: every one of them is a link followed from an email,
   * which lands with no session at all. Without this, the guard below would redirect all
   * three straight to `/login` before their own page ever ran, and nobody could finish
   * registering or recover a password.
   *
   * Marking only the redirect would not be enough: a precache fetch follows
   * redirects by default, so what the service worker inspects is this final 200,
   * and headers from the intermediate 307 are not visible on it. Without the
   * header here, the guard would rest entirely on `response.redirected` — which
   * Serwist's own redirect-copying plugin may already have cleared — and the
   * login page could end up cached under every song URL.
   *
   * The four legal pages are here for a different reason: nobody following one of
   * them — a visitor deciding whether to sign up, a store reviewer, a data
   * protection authority — has a session to check in the first place, and unlike
   * the email-loop pages above, that stays true forever, not just until they finish
   * registering.
   *
   * `/pricing` is here for exactly that permanent reason: somebody deciding whether to
   * pay for this app is by definition not signed in to it yet. The header matters as much
   * as the reachability, and the fact that it is *conditional* on `request.auth` is what
   * makes the offline behaviour differ by audience — deliberately, so do not "simplify" this
   * to the unconditional shape `/follow` uses below. An anonymous visitor's copy is refused
   * by every one of the service worker's page caches and is therefore never stored, so that
   * reader always sees live prices; a signed-in reader's copy may sit in the html/rsc caches
   * for up to a day, which is the residual staleness this accepts. A price is a fact with a
   * date on it — see the note about `precache-routes.ts` in `app/pricing/page.tsx` — so the
   * audience the page is written for is the one that must never see a cached one.
   *
   * `/changelog` is here for a similar reason: whoever arrives wanting to know what shipped
   * may well not be signed in — that is most of the point of publishing release notes — and
   * its content is a constant in `lib/changelog.ts` baked at build time, so the conditional
   * branch costs a signed-in reader nothing. Not `/pricing`'s case: a release note that is a
   * day old is still true, while a price that is a day old may not be.
   *
   * `/brand` is deliberately **not** on this list, unlike `/brand/kit/…` two functions up:
   * that prefix stays a public asset drop (a logo the app itself, an email, or a link-preview
   * bot needs with no session), but the page that indexes it now falls straight through to
   * the guard at the bottom like any other page inside the app — it requires a session, the
   * same as `/help` or `/booklet`.
   *
   * The list itself moved to `lib/publicRoutes.ts` when the blog arrived, and the move is not
   * tidying: `app/sitemap.ts` has to answer the same question — which paths a visitor with no
   * session can reach — and the two answers must be one answer. A page admitted here and
   * missing there is invisible to search; a page listed there and missing here is advertised
   * to Google as a redirect to `/login`. That file also records which of these are worth
   * indexing at all, which is a different question from this one: `/verify` and the two
   * password paths are reachable without a session only because they are opened from an
   * email, and there is nothing in any of them for a crawler.
   */
  if (SESSION_FREE_PATHS.has(pathname)) {
    if (request.auth) return

    const response = NextResponse.next()
    response.headers.set(ANONYMOUS_HEADER, '1')
    return withAttribution(response, attribution)
  }

  /**
   * The blog: the index, every article, each article's generated social card, and the feed.
   *
   * A prefix test rather than another entry in `PUBLIC_ROUTES`, because the set is not fixed —
   * an article written tomorrow is a path this file cannot name today, and an exact-match list
   * would answer every one of them with a redirect to `/login`. That is the whole feature
   * failing silently: the pages exist, the sitemap advertises them, and every crawler that
   * follows one is handed a sign-in form.
   *
   * Marked anonymous **unconditionally**, like `/follow` and unlike `/pricing` and
   * `/changelog` above. Those two branch on `request.auth` so a signed-in reader may keep a
   * cached copy; here there is nothing to gain from it and something to lose. The blog serves
   * one identical page to everybody — no session is read, no account named — so a "that
   * reader's copy" does not exist to be worth storing, and what the header buys instead is
   * that a corrected article is never served from an install-time cache hours after the
   * correction. `scripts/precache-routes.ts` keeps the blog out of the precache for the same
   * reason; this makes sure the runtime caches stay out of it too.
   */
  if (isBlogPath(pathname)) {
    const response = NextResponse.next()
    response.headers.set(ANONYMOUS_HEADER, '1')
    return withAttribution(response, attribution)
  }

  /**
   * A Strum Together link: the one other page a browser with no session may reach.
   * Always marked anonymous, signed in or not — the page it shows depends on the
   * token in the URL, never on whoever happens to be looking at it, so it must never
   * be cached as if it belonged to a particular reader.
   *
   * It is also where a follower's device id is minted (v3.3), because a plan caps how many
   * devices may follow one broadcast and something has to tell them apart. Here, rather than
   * in the poll action, for one reason that is not about tidiness: minting is separate from
   * creating the row, so two tabs opened in the same instant with no cookie yet both mint,
   * the last `Set-Cookie` wins, and the losing id — having no row anywhere — simply never
   * existed. Both tabs then poll with the same jar value and share one row, which is what
   * makes "a reload or a second tab is one device" literally true rather than nearly true. A
   * cookie and not `localStorage`, because the counting happens server-side and the server
   * has to be able to read it. `FollowPage`'s render could not set it in any case: Next.js
   * allows a cookie write only from a server action, a route handler or middleware.
   *
   * `crypto.getRandomValues` — Web Crypto, never `node:crypto`'s `randomBytes`: this runs on
   * the edge runtime, a mistake this codebase has already made once and left a scar for (see
   * `accounts/current.ts`' header). No database call either, ever: middleware runs on every
   * matched request, and the row this id will one day own is created by the first poll.
   *
   * The `ANONYMOUS_HEADER` above is load-bearing for the minting, not merely for privacy: it
   * is what keeps this navigation out of the service worker's cache, which is what guarantees
   * the request reaches the server at all. Remove it and a returning follower could be served
   * a cached page, never be issued an id, and go uncounted.
   *
   * Minted on the **navigation only**, and the reason is the non-obvious half: this middleware
   * also runs on the guest's poll. A Server Action POSTs to the page's own URL, so every
   * four-second `pollBroadcast` is a POST to `/follow/<token>` and matches this branch too —
   * and Next.js does not merely put a `Set-Cookie` on that response, it copies the value onto
   * the *request* (`x-middleware-set-cookie`) so that `cookies()` in the action reads it. Mint
   * there and a browser that stores no cookie is handed a brand-new identity on every poll:
   * a fresh row every four seconds, each one counting the last as a rival, burning a
   * `standard` leader's single slot within seconds and recording a peak of one phone as a
   * hundred devices. Gated on the method, so `pollBroadcast`'s «no cookie at all counts
   * nothing and writes nothing» branch is reachable, which is the decided behaviour for a
   * browser that will not keep the id.
   */
  if (isFollowPath(pathname)) {
    const response = NextResponse.next()
    response.headers.set(ANONYMOUS_HEADER, '1')

    /*
     * `request.method === 'GET'` rather than a `Sec-Fetch-Mode: navigate` test, which is the
     * sharper thing to ask and the wrong one to depend on: Server Actions are always POST, so
     * GET already excludes every poll, while `Sec-Fetch-*` is missing on older Safari — and
     * there the sharper test would silently never issue an id, leaving every iPhone follower
     * uncounted. A prefetch or RSC GET of a follow link would mint, and that is harmless: it
     * is the same browser, it stores the same cookie, and minting creates no row.
     */
    if (request.method === 'GET' && request.cookies.get(DEVICE_COOKIE) === undefined) {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      /*
       * Sixteen bytes where `freshToken` uses twenty-four, because this authorises nothing:
       * the URL's token is what grants the read, and guessing somebody else's device id buys a
       * shared slot, not access to anything.
       */
      const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

      response.cookies.set(DEVICE_COOKIE, id, {
        httpOnly: true,
        /* The link is opened from WhatsApp or a QR code — a cross-site top-level navigation —
         * and every other cookie in this repo is lax for the same reason. */
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        /* The identity belongs to the browser, not to the link: the same browser may follow a
         * different leader tomorrow, and a narrower path buys nothing for an opaque value. */
        path: '/',
        maxAge: ONE_YEAR_SECONDS,
      })
    }

    /* An untagged arrival here is the word-of-mouth channel — `readTouch` names it
       `strum-together`, since a link shared on WhatsApp or as a QR code is the truest referral
       this product has and the one nothing else would record. */
    return withAttribution(response, attribution)
  }

  /*
   * Everything that genuinely needs a session and did not match a branch above: a bookmarked
   * song, a shared songbook URL, `/help`, `/billing`, `/accounts`.
   *
   * **This is no longer where an ordinary campaign URL lands.** It used to be — `/` required a
   * session, so `strumfolio.com/?utm_source=…` came through here and the redirect dropped the
   * query string, which is why the cookie had to be set on it. `/` is public now and takes the
   * `SESSION_FREE_PATHS` branch instead. The cookie stays on this exit all the same: a campaign
   * can point at a deep link (an article's own songbook, a shared song) as easily as at the
   * home page, and this redirect still throws the parameters away on the way to `/login`. See
   * `withAttribution`'s own comment.
   */
  if (!request.auth) {
    const response = NextResponse.redirect(new URL('/login', request.nextUrl.origin))
    response.headers.set(ANONYMOUS_HEADER, '1')
    return withAttribution(response, attribution)
  }
}) as unknown as SessionMiddleware

/**
 * A session-token cookie, including the numbered chunks a JWT too large for one cookie is
 * split into (`sessionStore.chunk`) — `authjs.session-token.0`, `.1`, and so on.
 */
const SESSION_COOKIE = /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?=/

/**
 * The middleware Next.js actually runs: `withSession` above, with one cookie taken back off
 * every response.
 *
 * **This is what makes signing out work.** `auth()` answers each request by asking Auth.js for
 * the session, and with the `jwt` strategy the `session` action does not merely read the token
 * — it **re-signs it and returns a fresh ninety-day cookie** to roll the expiry
 * (`@auth/core/lib/actions/session.js`). `handleAuth` appends that cookie to whatever the
 * callback above returned, *after* it has returned, which is why this cannot be done from
 * inside the callback and the export is wrapped instead.
 *
 * That refresh rides on **every request this file's matcher covers**, which is very nearly all
 * of them — measured against production on 2026-09-09, `/brand/og-image.png`,
 * `/brand/icons/icon-192.png` and `/manifest.webmanifest` each answered with a session cookie,
 * an icon being no different to Auth.js from a page.
 *
 * And that is the whole bug. `signOut()` deletes the session cookie from inside a Server
 * Action, and the browser applies each `Set-Cookie` as its response arrives — so **any GET
 * already in flight when the deletion lands comes back carrying a fresh ninety-day cookie and
 * puts the session straight back**. Nothing is wrong with the sign-out; it is simply overwritten
 * a few milliseconds later by a request nobody thinks of as authentication, an image among them.
 *
 * `OfflineSync` is what turns that race from unlucky into certain: it walks the reader's whole
 * repertoire with sequential `fetch()` calls, so anybody with songs always has a GET in flight.
 * Reproduced against production in a real browser with service workers blocked — signed out,
 * returned to `/login`, and still signed in — and it would not reproduce at all against an
 * account with an empty repertoire, which is what kept it hidden through three wrong diagnoses.
 *
 * **Unconditional, and the earlier narrower version is the mistake to learn from.** This first
 * shipped stripping only non-GET requests and `/api/auth/*`, reasoning that those were where the
 * app writes the cookie itself. That fixed the sign-out POST and changed nothing the reader
 * could see, because the request that resurrects the session is an ordinary GET for a PNG.
 *
 * **What it costs, stated plainly**: the ninety days no longer roll. A session now lasts ninety
 * days from signing in rather than ninety from the last visit, because this was the only place
 * the expiry was ever extended — `auth()` from a server component cannot write cookies. That is
 * the price of a logout that is decided by the app rather than by which response happens to land
 * last, and it is worth it. Auth.js has `session.updateAge` (a day, by default) to throttle this
 * very refresh; the middleware path ignores it and re-signs on every request, so what is being
 * given up was never a considered design in the first place.
 *
 * Deliberately narrow in the other direction: only the session token, never the CSRF or
 * callback-url cookies Auth.js sets beside it, and never the attribution or device cookies the
 * callback above writes.
 */
export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  const response = await withSession(request, event)
  if (!(response instanceof Response)) return response

  /* `getSetCookie` keeps the headers separate; reading `get('set-cookie')` would join them
     into one comma-spliced string that cannot be safely split again (an `Expires` date has a
     comma in it). */
  const cookies = response.headers.getSetCookie()
  const kept = cookies.filter((cookie) => !SESSION_COOKIE.test(cookie))
  if (kept.length === cookies.length) return response

  response.headers.delete('set-cookie')
  for (const cookie of kept) response.headers.append('set-cookie', cookie)

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
