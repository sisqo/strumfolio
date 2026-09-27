# Browser storage: every cache belongs to one account

Loaded when working under `src/lib/storage/`. The two rules that bind code elsewhere are repeated in the root `CLAUDE.md`.

**Every `localStorage` key here must be built by `keyFor` (`src/lib/storage/scope.ts`), never
written as a constant.** The keys used to be constants — `songs:songbooks`, `songs:edits`,
`songs:prefs` — so each said *what* was stored and never *whose* it was, and nothing emptied
any of them at sign-out or when a second account signed in on the same browser. The next reader
inherited the previous one's songbook names, and in `songs:edits` their words and chords.

It was visible rather than merely latent, and the mechanism is worth knowing because it makes
any repeat of it look like a rendering glitch: `SongbookProvider` seeds its state from the
server snapshot — which is correct and account-scoped — and then **replaces it in a
`useLayoutEffect`, which runs before the browser paints**, with whatever is in the cache, while
`refresh()` in an ordinary `useEffect` puts it right one round trip later. So the wrong
repertoire is what a reader actually sees for the width of a fetch, after which it corrects
itself and leaves nothing to find. Reported as «per un attimo si vedono i miei canzonieri».

- **The tag comes from a cookie, not a prop.** `middleware.ts` computes it on every signed-in
  request (`accountScopeTag` over `currentAccountFor`) and sets `songbook-scope`, which is the
  one cookie here that is deliberately **not** `httpOnly` — the page's own script is the
  consumer. It authorises nothing: the server scopes every read by `accountOwnerEmail`
  regardless, so forging it buys a browser only its own cache back. A prop was rejected because
  `PrefsProvider` alone is mounted on about twenty pages, and one omission would silently fall
  back to an unscoped key — the bug again, on one page, invisibly.
- **Recomputed every signed-in request, not only when the cookie is missing.** That is what
  makes a global owner switching into a customer's account switch caches too, with no second
  place to keep in step; `writeAccountCookie` stays a cookie write and nothing more.
- **No tag means no cache at all, never an unscoped one.** Every store refuses to read *and* to
  write when `keyFor` answers null. The server-rendered snapshot is always present and always
  right, so the cost is a cache miss.
- **`mayAccess` and `currentAccountFor` live in `lib/accounts/scope.ts`**, not in
  `accounts/current.ts` where they were written and from where they are still re-exported:
  `middleware.ts` needs them and runs on the edge runtime, where `next/headers` — which
  `current.ts` imports — cannot follow. One copy of the rule, or the tag would name a different
  account than the session does.
- **`songs:theme` is exempt and must stay exempt** (`DEVICE_KEYS`, beside `songs:coupon` and the stored scope key). The theme belongs to the
  device, not to whoever is signed in, and it is read by the inline script in `app/layout.tsx`
  before React exists — purging it would flash the whole app to the other theme on every change
  of account.
- **Two defences, because either alone fails where the other holds.** The keys are scoped, so
  another account's cache cannot be *read*; and the whole area plus every page cache (`PAGE_CACHES`; never the precache or the asset caches) is
  emptied when the tag changes (`purgeIfForeign`, called from `keyFor` itself so there is no
  mount to forget) and again at sign-out (`StorageCleanup` on `/login`, armed by the sign-out
  action deleting the scope cookie — and on the landing page, since 2026-09-23, because
  `deleteMyAccount` ends on `/` and never reached `/login`), so another account's words do not
  *linger* in devtools on a shared machine.
- **The service worker's page caches have the same shape and are handled by clearing, not
  scoping**: `rejectUnauthenticated` only refuses anonymous and redirected responses, so a
  signed-in reader's rendered screens are stored under plain URL keys. `sw.ts` recorded «nothing
  evicts it when a session ends» as understood-and-accepted; that reasoning covered offline and
  not the case where a second account signs in on the device.
- **Songs and songbooks have a cache of their own, `repertoire`, with no age expiry, capped at 1500 entries** (2026-09-22).
  They used to fall through to `others` — 32 entries for 24 hours, shared with images — so once
  `OfflineSync` walked a whole repertoire the last pages fetched evicted the ones a reader had
  opened, and a day without signal emptied it. **Any new page cache goes into `PAGE_CACHES`**
  (`lib/storage/pageCaches.ts`, shared by the page and the worker) in the same commit, or
  sign-out and a change of account stop clearing that account's songs off the device.
- **Emptying from the page loses a race, so the worker refuses late writes** (2026-09-23).
  `fetch()` resolves on the headers and the worker stores the body afterwards, and with the
  four-second `NetworkFirst` timeout the page may already hold the stored copy while the real
  response is still arriving — so a request `OfflineSync` had in flight at sign-out landed
  *after* the emptying, into `repertoire`, for good. `clearPageCaches` now also posts
  `SCOPE_ENDED_MESSAGE`; `sw.ts`'s `refuseEndedScope` stamps every page request with an epoch
  and drops any response from an older one. A change of account (`SwitchAccountButton`) clears
  before navigating, or the timeout serves `/` from the account being left.
- **Purge, then warm — `OfflineSync` calls `settleScope()` before its walk** (2026-09-24). The
  foreign-account purge ran on the first `keyFor` read, and after a password sign-in the page is
  rendered before the scope cookie exists, so that read could come *after* the walk: the next
  song opened, or the `offline` event itself, emptied the freshly warmed `repertoire`.

Verified before/after in a real browser on 2026-09-11 with a planted foreign cache: the other
account's songbook name was visible with the unscoped store and absent at all forty samples
across the flash window with the scoped one.
