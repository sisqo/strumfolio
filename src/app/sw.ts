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
 * The guard below is what makes that impossible rather than merely unlikely: it refuses
 * to store any response that was redirected or that the middleware marked as anonymous.
 *
 * **It used to claim a second defence, and that claim was false in the case that mattered.**
 * It read: "registration only happens on pages that are already behind the gate, so a valid
 * cookie exists at install time." True of the first registration; not true of an **update**,
 * which the browser starts on its own on any navigation in scope, with whatever session the
 * device has — usually none, since a signed-out reader is the one who needs the new worker
 * most. And because the guard above and the precache pull in opposite directions, that
 * mistake was self-sealing: a session-gated URL in the manifest redirects to `/login` for a
 * stranger, the guard refuses the redirect, `cachePut` returns false, `PrecacheStrategy`
 * throws, and Serwist awaits every entry together — so the whole install fails and the old
 * worker keeps serving, for ever, with nothing anywhere to say so. `precache-routes.ts` now
 * carries the rule that follows from it: every precached URL has to be fetchable by a
 * stranger, and none of them is a page any more.
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

import { PAGE_CACHES, SCOPE_ENDED_MESSAGE } from '../lib/storage/pageCaches'

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
 * **A response to a request that left before the last sign-out is never stored.**
 *
 * The page empties the page caches when an account stops being the one on this device
 * (`clearPageCaches`: `StorageCleanup` on `/login`, `purgeIfForeign` on a change of account),
 * and that alone loses a race it cannot see. `OfflineSync` walks the whole repertoire, so at
 * sign-out one request is usually in flight under the old session; `fetch()` resolves on the
 * headers while this worker writes the body afterwards, and with `NETWORK_TIMEOUT_SECONDS` the
 * page may have been handed the stored copy while the real response is still on its way. Either
 * way the write lands *after* the emptying, into `repertoire`, which never expires — another
 * person's songs left on a shared device until somebody else happened to sign in.
 *
 * So the page also posts `SCOPE_ENDED_MESSAGE`, and every request is stamped with the epoch it
 * started in: a response from an older epoch is refused in `cacheWillUpdate`, and one that was
 * already past that check when the message arrived is deleted again in `cacheDidUpdate`. The
 * epoch lives in this worker's memory and resets when it is stopped — harmless, since a worker
 * with a request in flight is not stopped.
 */
let scopeEpoch = 0

const refuseEndedScope = {
  handlerWillStart: async ({ state }: { state?: Record<string, unknown> }) => {
    if (state) state.scopeEpoch = scopeEpoch
  },
  cacheWillUpdate: async ({ response, state }: { response: Response; state?: Record<string, unknown> }) =>
    state?.scopeEpoch === scopeEpoch ? response : null,
  cacheDidUpdate: async ({
    cacheName,
    request,
    state,
  }: {
    cacheName: string
    request: Request
    state?: Record<string, unknown>
  }) => {
    if (state?.scopeEpoch !== scopeEpoch) await (await caches.open(cacheName)).delete(request)
  },
}

self.addEventListener('message', (event) => {
  if ((event.data as { type?: unknown } | null)?.type !== SCOPE_ENDED_MESSAGE) return
  scopeEpoch += 1
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => PAGE_CACHES.has(name)).map((name) => caches.delete(name)))),
  )
})

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
/**
 * How long a page waits for the network before the stored copy is shown instead.
 *
 * **Without it `NetworkFirst` falls back only when the fetch *fails*,** and on a stage's wifi —
 * connected, handing out addresses, passing nothing — it does not fail, it hangs, for as long
 * as the browser's own timeout, which is tens of seconds. The song the reader needs sat behind
 * that wait while a perfectly good copy was on the device. Serwist's `defaultCache` sets 10 on
 * the rules it thinks of as APIs and nothing on the page rules this file copied.
 *
 * Four seconds, and the cost is small by construction: a timeout serves the stored copy only
 * where there *is* one, the request carries on in the background and refreshes it, and a page
 * with no stored copy still waits for the network as before.
 */
const NETWORK_TIMEOUT_SECONDS = 4

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
    networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS,
    plugins: [
      new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 1440 * 60 }),
      rejectUnauthenticated,
      refuseEndedScope,
    ],
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
  /*
   * **What a navigation gets when it misses every cache with no network**: a page of this app
   * that says so, instead of the browser's own error — which in an installed app on iOS is a
   * screen with no way back. `public/offline.html` is precached with the rest of `public/` and
   * is static on purpose: see its own header, and `isPublicAsset` in `middleware.ts`, without
   * which the precache fetch of it would be a redirect and fail every install.
   *
   * Documents only. An RSC fetch or an image that misses offline fails the way it always did,
   * and a client-side navigation whose RSC fetch fails is retried by Next as a full navigation,
   * which is what lands here.
   */
  fallbacks: {
    entries: [{ url: '/offline.html', matcher: ({ request }) => request.destination === 'document' }],
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
     * Offline and signed out, nothing is served from here any more: sign-out empties the page
     * caches (`StorageCleanup` on `/login`, and on the landing page after an account is
     * deleted), and `refuseEndedScope` stops a request still in flight writing it back.
     */
    {
      matcher: ({ request, url, sameOrigin }) =>
        sameOrigin && url.pathname === '/' && request.mode === 'navigate',
      handler: new NetworkFirst({
        cacheName: 'home',
        networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS,
        plugins: [
          { cacheKeyWillBeUsed: async ({ request }) => new URL('/', request.url).href },
          rejectUnauthenticated,
          refuseEndedScope,
        ],
      }),
    },
    /**
     * **The repertoire: every song and songbook page, in a cache of its own that does not
     * expire.** Until 2026-09-22 these fell through to the `others` catch-all below — 32 entries
     * shared with images and chunks, gone after 24 hours — because a navigation carries no
     * `Content-Type` and so never matched the HTML rule. With `OfflineSync` actually walking the
     * whole repertoire, the last 32 pages fetched pushed out the ones a reader had opened, and a
     * day without signal took the rest. On a stage that is the entire product failing.
     *
     * HTML only (no `RSC` header): a client-side navigation's RSC fetch keeps falling through to
     * the rules below, and when it fails offline Next retries as a full navigation, which is what
     * lands here. `OfflineSync`'s plain `fetch()` and a real visit share one key, the URL.
     *
     * No `maxAgeSeconds`, for the home rule's reason: this is what has to open after a week
     * away from any network. `maxEntries` is a ceiling against runaway storage rather than a
     * working limit — far above any repertoire measured here. The name is in `PAGE_CACHES`
     * (`lib/storage/scope.ts`), so sign-out and a change of account empty it like the others.
     */
    {
      matcher: ({ request, url, sameOrigin }) =>
        sameOrigin &&
        request.method === 'GET' &&
        request.headers.get('RSC') !== '1' &&
        /* Reading pages only: `/songbooks/x/add` is a form, and a form kept without expiry
           would open offline stale. (`/edit` never gets here — its own rule comes first.) */
        !url.pathname.endsWith('/add') &&
        (url.pathname.startsWith('/songs/') || url.pathname.startsWith('/songbooks/')),
      handler: new NetworkFirst({
        cacheName: 'repertoire',
        networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS,
        plugins: [new ExpirationPlugin({ maxEntries: 1500 }), rejectUnauthenticated, refuseEndedScope],
      }),
    },
    ...authenticatedPageCaching,
    ...defaultCache,
  ],
})

serwist.addEventListeners()
