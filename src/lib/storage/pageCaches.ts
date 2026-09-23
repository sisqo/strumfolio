/**
 * The Cache Storage names that hold rendered pages, shared by the page (`scope.ts`, which empties
 * them) and the service worker (`sw.ts`, which writes them and refuses late writes into them).
 *
 * A module of its own, and not `'use client'`, because the worker imports it: `scope.ts` reads
 * cookies and `localStorage` and has no business in a worker bundle.
 *
 * **Any new page cache goes in here in the same commit**, or sign-out and a change of account
 * stop clearing that account's pages off the device.
 *
 * **Wiping every cache was the bug this list ends.** `clearPageCaches` ran on every signed-out
 * `/login` visit (`StorageCleanup`) and on every foreign-account detection (`purgeIfForeign`),
 * and `caches.delete` took the precache with the rest. The precache is written once, at the
 * worker's `install`, and never again until the next deploy — so a single anonymous `/login`
 * (the bounce `StandaloneRedirect` itself causes among them) stripped the installed app's whole
 * offline shell until a deploy rebuilt the worker. These names are used verbatim by the
 * worker (Serwist does not prefix an explicit `cacheName`), confirmed against the built `sw.js`.
 */
export const PAGE_CACHES: ReadonlySet<string> = new Set([
  'home',
  /* Every song and songbook page, kept without expiry for the stage — `sw.ts`. */
  'repertoire',
  'others',
  'pages',
  'pages-rsc',
  'pages-rsc-prefetch',
])

/**
 * The message a page posts to its service worker when the account whose pages are cached has
 * stopped being the one on this device — a sign-out, a change of account. See `sw.ts`: from that
 * moment the worker refuses to store any response to a request that left before it.
 */
export const SCOPE_ENDED_MESSAGE = 'songs:scope-ended'
