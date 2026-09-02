import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'

import { authConfig } from '@/auth.config'
import { SESSION_FREE_PATHS, isBlogPath } from '@/lib/publicRoutes'
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
    pathname.startsWith('/brand/')
  )
}

export default auth((request) => {
  const { pathname } = request.nextUrl

  if (isPublicAsset(pathname)) return

  /**
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
    return response
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
    return response
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
  if (/^\/follow\/[^/]+$/.test(pathname)) {
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

    return response
  }

  if (!request.auth) {
    const response = NextResponse.redirect(new URL('/login', request.nextUrl.origin))
    response.headers.set(ANONYMOUS_HEADER, '1')
    return response
  }
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
