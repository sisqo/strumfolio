/**
 * The one-click, no-login unsubscribe link a courtesy email carries — stateless, unlike every
 * other token in this app.
 *
 * `/verify` and `/reset-password` (`lib/auth/tokens.ts`) store a hash and check an expiry;
 * this token needs neither. It must never expire — an unsubscribe that dies is not one — so
 * there is nothing to store and nothing to clean up: the token *is* the proof, recomputed on
 * the way back and compared to what arrived.
 *
 * Pure, no `@/lib/db` import, no `'use server'` — imported by both the owner-gated
 * `actions.ts` (which mints a link to put in a message) and the session-free
 * `publicActions.ts` (which verifies one that came back), so the arithmetic exists exactly
 * once. Never imported directly by a page component: a page reaches this only through one of
 * those two.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

import { normalizeEmail } from '@/lib/allowlist'

/**
 * The dedicated secret this token is signed with — deliberately not `AUTH_SECRET`.
 *
 * A link that must never expire should not share a lifetime with a secret that has every
 * reason to rotate (NextAuth's session signing key). Rotating `AUTH_SECRET` would silently
 * invalidate every unsubscribe link ever sent, with no error anywhere to notice it by — a
 * reader clicking a six-month-old link would simply land on a page that says the token is
 * invalid, indistinguishable from a typo.
 */
function secret(): string | null {
  const value = process.env.COURTESY_UNSUBSCRIBE_SECRET
  return value === undefined || value === '' ? null : value
}

/**
 * Signs an address for the unsubscribe link — thrown, not returned null, because every caller
 * of this function is about to compose and send a real email, and a link built from no secret
 * at all would verify against nothing forever. `lib/courtesy/actions.ts` catches this before
 * claiming anything, the same before-the-claim discipline `runOutreach` already applies to a
 * kind with no handler.
 */
export function courtesyUnsubscribeToken(email: string): string {
  const key = secret()
  if (key === null) {
    throw new Error('COURTESY_UNSUBSCRIBE_SECRET is not configured — cannot sign an unsubscribe link.')
  }
  return createHmac('sha256', key).update(normalizeEmail(email)).digest('hex')
}

/**
 * Checks a token that came back in a link's query string.
 *
 * **Normalizes the address first**, the same normalization the token was signed against at
 * send time — a case difference in the query string must not read as a wrong token for an
 * address that is actually right. Compares with `timingSafeEqual`, not `===`: every other
 * token comparison in this app goes through a stored hash instead of a direct string compare,
 * so this is the first place that needs a constant-time compare stated explicitly, to keep a
 * response-time difference from ever being a way to search for a valid token.
 *
 * Answers `false` rather than throwing when the secret is unset — a misconfigured deploy fails
 * *closed* on verification (nobody's link works, which is safe) even though composing a new
 * link fails loudly instead (`courtesyUnsubscribeToken`'s own throw).
 */
export function verifyCourtesyUnsubscribeToken(email: string, token: string): boolean {
  const key = secret()
  if (key === null) return false

  const expected = createHmac('sha256', key).update(normalizeEmail(email)).digest('hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  const givenBuffer = Buffer.from(token, 'hex')
  /* `timingSafeEqual` throws on a length mismatch rather than answering false — a token of the
     wrong shape (empty, truncated, not hex at all) is exactly as invalid as one of the right
     length that fails to match, so both read the same way here. */
  if (expectedBuffer.length !== givenBuffer.length) return false
  return timingSafeEqual(expectedBuffer, givenBuffer)
}
