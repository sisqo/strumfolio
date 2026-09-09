/// <reference lib="webworker" />

/**
 * Service worker.
 *
 * The one thing that can quietly destroy the offline promise: precache requests
 * are real HTTP requests, so they pass through the auth middleware. If the
 * service worker ever precaches while the session is invalid, every song URL
 * gets the login page stored under it — and the cache *looks* full, so offline
 * you would find a login screen for every song with nothing to indicate why.
 *
 * Two defences. Registration only happens on pages that are already behind the
 * gate, so a valid cookie exists at install time; and the guard below refuses to
 * store any response that was redirected or that the middleware marked as
 * anonymous, which makes a bad cache impossible rather than merely unlikely.
 */

import { PAGES_CACHE_NAME, defaultCache } from '@serwist/next/worker'
import {
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  type PrecacheEntry,
  type SerwistGlobalConfig,
  Serwist,
} from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

/** Set by the middleware on any response served to someone not signed in. */
const ANONYMOUS_HEADER = 'x-songs-anonymous'

const rejectUnauthenticated = {
  cacheWillUpdate: async ({ response }: { response: Response }) => {
    if (response.redirected) return null
    if (response.headers.get(ANONYMOUS_HEADER) !== null) return null
    if (!response.ok) return null
    return response
  },
}

/**
 * Every page-navigation entry `defaultCache` runs on its own — RSC prefetches, plain RSC
 * fetches, full HTML, and the same-origin catch-all it all falls through to when neither
 * header matches (the one `/edit`'s own rule above was found sitting in, per this file's
 * top comment).
 *
 * `precacheOptions.plugins` below only guards the *install-time* precache; runtime
 * navigations landing in one of these four never passed through it (v3.0). Since every
 * page is now rendered per request and scoped to whichever account's session made the
 * request, a session that has just expired mid-visit is exactly the same failure mode
 * `precacheOptions` was written to prevent, and needs the same guard. Matchers and cache
 * names are copied verbatim from `defaultCache`'s own source so these four shadow it —
 * first match wins — without changing what anything else in `defaultCache` does.
 */
const authenticatedPageCaching = (
  [
    [
      ({ request, url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
        request.headers.get('RSC') === '1' &&
        request.headers.get('Next-Router-Prefetch') === '1' &&
        sameOrigin &&
        !url.pathname.startsWith('/api/'),
      PAGES_CACHE_NAME.rscPrefetch,
    ],
    [
      ({ request, url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
        request.headers.get('RSC') === '1' && sameOrigin && !url.pathname.startsWith('/api/'),
      PAGES_CACHE_NAME.rsc,
    ],
    [
      ({ request, url, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
        request.headers.get('Content-Type')?.includes('text/html') === true &&
        sameOrigin &&
        !url.pathname.startsWith('/api/'),
      PAGES_CACHE_NAME.html,
    ],
    [
      ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
        sameOrigin && !url.pathname.startsWith('/api/'),
      'others',
    ],
  ] as const
).map(([matcher, cacheName]) => ({
  matcher,
  handler: new NetworkFirst({
    cacheName,
    plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 1440 * 60 }), rejectUnauthenticated],
  }),
}))

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    plugins: [rejectUnauthenticated],
    /*
     * `ignoreURLParametersMatching` used to be set here to `[/^utm_/, /^fbclid$/, /^c$/]`,
     * and all three were about `/`: the first two so a campaign URL resolved to the
     * precached home, `c` so `/?c=repertorio` — a bookmark old enough to name a songbook in
     * the query string, from when opening one meant unfolding it in place — did too. `/` is
     * not precached any more (see the home rule below), which left the option inert over
     * `/password` and the manifest, so it is gone and Serwist's own `[/^utm_/, /^fbclid$/]`
     * apply again. The question it answered for `/` did not disappear with it — it is
     * answered by `cacheKeyWillBeUsed` on the home rule instead.
     */
  },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  /**
   * The editor is never cached, and the rule comes first because the first match
   * wins.
   *
   * Without it the default rules keep a copy of the page, and offline that copy
   * would open an editor showing the words as they were at the last deploy, over a
   * database it cannot reach — you would type into a stale song and lose it on save.
   * A page that plainly refuses to open says the true thing instead. Measured, not
   * assumed: it was found sitting in the `others` cache.
   */
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.endsWith('/edit'),
      handler: new NetworkOnly(),
    },
    /**
     * The home screen, `/` — the manifest's `start_url`, and the one page that has to open
     * with no network at all.
     *
     * **It was precached until 2026-09-09, and that is what made signing out look broken.**
     * Serwist registers its own `PrecacheRoute` inside the `Serwist` constructor, before
     * anything in this array, and `PrecacheStrategy` answers from the cache without asking
     * the network — so a device that installed the worker while signed in kept that reader's
     * home under `/` for good. Sign out and the session really ended: the cookie was
     * cleared, `/help` and every other page redirected to `/login`. Retype the address and
     * `/` alone came back showing the app, which reads exactly like a logout that did not
     * happen. `scripts/precache-routes.ts` carries the other half of this note.
     *
     * `NetworkFirst` is what puts the page back under the session's control. `/` is
     * dual-audience — `app/(home)/layout.tsx` serves the landing page to a visitor and the
     * reader's own songbooks to a session — so *which* of the two it is can only be answered
     * by the server, and now it is asked on every online navigation. `rejectUnauthenticated`
     * keeps the stored copy the signed-in one: a visitor's landing page carries the
     * middleware's anonymous header and is never written here, which is the same guard that
     * used to protect the precache entry.
     *
     * **No `ExpirationPlugin`, unlike the four rules below.** Those hold pages; this holds
     * the way in. A precache entry never expires, so letting `/` fall through to the
     * 24-hour, 32-entry `others` cache would have traded this bug for a worse one — the
     * installed app failing to open at all after a day away from the network.
     *
     * **Navigations only**, and that is load-bearing rather than tidy: a client-side
     * navigation to `/` is an RSC fetch whose body is not HTML, and storing it under this
     * rule's single cache key would serve a payload where a page belongs. Those keep falling
     * through to the RSC rules below, exactly as they already did — an RSC request carries
     * `?_rsc=…`, so it never matched the precache either.
     *
     * `cacheKeyWillBeUsed` is what replaces the precache's `ignoreURLParametersMatching`
     * (see `precacheOptions` above): `/?utm_source=…` off a campaign and `/?c=repertorio`
     * off an old bookmark are the home page, so they are read and written as the one entry
     * rather than as a fresh copy each.
     *
     * What this does **not** fix: offline and signed out, the copy served is still the last
     * signed-in home, because nothing evicts it when a session ends. Nobody can sign in
     * without a network either, so it misleads about nothing that could be acted on — but it
     * is the residue of this bug, and clearing this device's copies on sign-out is what
     * would take it away.
     */
    {
      matcher: ({ request, url, sameOrigin }) =>
        sameOrigin && url.pathname === '/' && request.mode === 'navigate',
      handler: new NetworkFirst({
        cacheName: 'home',
        plugins: [{ cacheKeyWillBeUsed: async ({ request }) => new URL('/', request.url).href }, rejectUnauthenticated],
      }),
    },
    ...authenticatedPageCaching,
    ...defaultCache,
  ],
})

serwist.addEventListeners()
