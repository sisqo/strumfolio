/**
 * Which account a signed-in reader is looking at right now.
 *
 * Deliberately a plain cookie, not the session's JWT: unlike a role, which stays out of
 * the token so a change of access takes effect on the next request rather than the next
 * sign-in (see `lib/auth/session.ts`), which account is on screen is not a security fact
 * at all — it is a navigation preference, no more sensitive than a scroll position. It
 * can live somewhere cheap to read and rewrite, as long as nothing here is ever trusted
 * without checking it against the reader's actual access on every request.
 *
 * That check no longer costs a query (v3.1): with collaborators gone, an email may only
 * ever open the account it owns — its own, or, for a global owner, anyone's — so
 * `mayAccess` is pure, and nothing here needs the database at all.
 *
 * No import of `@/lib/db/client` on purpose: this module is reachable from anywhere
 * `currentUser` is, and keeping it free of the Postgres driver keeps it free of the
 * mistake `node:crypto` already taught this codebase not to make near the edge (v2.2).
 */

import { cookies } from 'next/headers'

import { normalizeEmail } from '@/lib/allowlist'
import { ACCOUNT_COOKIE, currentAccountFor, mayAccess } from './scope'

/**
 * Re-exported, not defined here any more: `middleware.ts` needs the same two rules to work out
 * which account a browser's local caches belong to, and it runs on the edge runtime, where this
 * module cannot follow — it imports `next/headers`. They moved to `./scope`, which is pure, and
 * this line keeps every existing caller reading them from where they have always been. One copy
 * of the rule, which is the whole point: a second one would decide a different account than the
 * session does, and the two would disagree about whose songs a device may keep.
 */
export { ACCOUNT_COOKIE, currentAccountFor, mayAccess }

const COOKIE_NAME = ACCOUNT_COOKIE
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/** The account named by the current request's cookie, unvalidated — see `currentAccountFor`. */
export async function readAccountCookie(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(COOKIE_NAME)?.value ?? null
}

/** Switches the account this browser sees from now on. The caller must validate access first. */
export async function writeAccountCookie(accountOwnerEmail: string): Promise<void> {
  const jar = await cookies()
  jar.set(COOKIE_NAME, normalizeEmail(accountOwnerEmail), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  })
}
