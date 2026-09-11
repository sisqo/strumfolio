/**
 * A short, stable tag naming the account whose data a browser is allowed to keep.
 *
 * **Why this exists.** Every client-side cache in this app — `songs:songbooks`,
 * `songs:edits`, the preference and comment stores — was keyed by a constant, so the key
 * said *what* was stored and never *whose* it was. Nothing cleared any of them at sign-out
 * or when a different account signed in on the same browser, which meant the next reader
 * inherited the previous one's songbook names, and in `songs:edits` their words and chords.
 * `SongbookProvider` made that visible rather than merely latent: it reads the cache in a
 * `useLayoutEffect`, which runs *before the browser paints*, so the correct server-rendered
 * data was replaced by the stale one and then corrected a round trip later by `refresh()` —
 * the flash of somebody else's repertoire that this tag ends.
 *
 * **A partition key, never a credential.** It authorises nothing and is checked by nobody:
 * every read is still scoped on the server by `accountOwnerEmail`, and a browser that forges
 * this value gains access to nothing it did not already have — it only gets to read the cache
 * it had already written. The one property that matters is that two accounts never share a
 * value.
 *
 * **A digest rather than the address itself.** The tag travels in a cookie the page's own
 * scripts can read and ends up in `localStorage` key names, so it outlives the session in
 * plain view of anybody who opens devtools on a shared machine. The account's own email there
 * would be a record of who used the computer, which is precisely the residue this change
 * exists to stop leaving behind.
 *
 * SHA-256 through Web Crypto, never `node:crypto`: this is called from `middleware.ts`, which
 * runs on the edge runtime — the mistake this codebase has already made once and left a scar
 * for (see `accounts/current.ts`' header).
 */

import { isOwner, normalizeEmail } from '@/lib/allowlist'

/** The cookie carrying the tag. Readable by scripts on purpose — the client is the consumer. */
export const SCOPE_COOKIE = 'songbook-scope'

/** The cookie naming which account is on screen — `accounts/current.ts` owns its lifecycle. */
export const ACCOUNT_COOKIE = 'songbook-account'

/** Whether `email` may open the account owned by `accountOwnerEmail` at all. */
export function mayAccess(
  email: string,
  accountOwnerEmail: string,
  raw: string | undefined | null,
): boolean {
  if (isOwner(email, raw)) return true
  return normalizeEmail(email) === normalizeEmail(accountOwnerEmail)
}

/**
 * The account this request should show: the cookie's value, if the reader may still open
 * it, and their own account otherwise. That fallback is also what makes "open your own
 * account by default" true with no separate code path — an absent, stale, or
 * no-longer-accessible cookie all collapse to the same safe answer.
 *
 * Lives here rather than in `accounts/current.ts`, where it was written and from where it is
 * still re-exported: `middleware.ts` has to reach the same answer to tag a browser's caches,
 * and that file runs on the edge runtime where `next/headers` — which `current.ts` imports —
 * cannot go. Pure, so both callers and `npm test` can have it.
 */
export function currentAccountFor(
  email: string,
  raw: string | undefined | null,
  requestedAccount: string | null,
): string {
  if (requestedAccount !== null && mayAccess(email, requestedAccount, raw)) {
    return normalizeEmail(requestedAccount)
  }
  return normalizeEmail(email)
}

/**
 * Sixteen hex characters — 64 bits of a SHA-256.
 *
 * Long enough that two accounts sharing one is not a thing that happens, short enough to read
 * in a key name while debugging. The truncation costs nothing here: this is a partition key,
 * so the only property being bought is distinctness, not resistance to anybody.
 */
const TAG_LENGTH = 16

export async function accountScopeTag(accountOwnerEmail: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeEmail(accountOwnerEmail))
  const digest = await crypto.subtle.digest('SHA-256', bytes)

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, TAG_LENGTH)
}

/**
 * Whether a cookie value is a tag this app wrote, rather than anything a hand or a script put
 * there. Key names are built from it, so a value carrying a quote, a separator or a wildcard
 * would let a crafted cookie reach into key space that is not its own — `songs:a:b` and
 * `songs:a` naming the same place is the whole of the bug being fixed, in miniature.
 */
export function isScopeTag(value: string | null | undefined): value is string {
  return typeof value === 'string' && new RegExp(`^[0-9a-f]{${TAG_LENGTH}}$`).test(value)
}
