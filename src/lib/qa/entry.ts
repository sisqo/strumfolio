/**
 * The rules behind `/qa`, the entry point that mints a verified account and signs in as it
 * without a password — for whoever is testing this app rather than using it.
 *
 * **It is an authentication bypass, so it is written as one**: everything that decides whether
 * it may run lives here, pure, and is covered by `npm test`. A gate no test touches is the one
 * thing this file must not be. `qa/actions.ts` calls these on its own first lines — the page
 * checking them is not enough, because a Server Action is addressable by its action id over
 * POST whether or not the page that declares it renders anything (a `notFound()` in the page
 * body leaves the action live).
 *
 * Two independent guards, and they answer different questions:
 *
 * 1. **Where is this running** — `qaAllowed`, an allowlist rather than a denylist. The shape
 *    `VERCEL_ENV !== 'production'` reads the same and fails open: a typo, a renamed
 *    environment, a value nobody anticipated all become "allowed". Here an unknown value is a
 *    refusal, and the only three ways in are the three that were meant.
 * 2. **Who can be signed in as** — `isQaEmail`. Nothing outside `@strumfolio.test` can ever be
 *    entered, whatever the first guard decided. That is what keeps the blast radius at "a
 *    junk account on a preview" instead of "anybody's account": the development database holds
 *    a 2026-08-29 copy of production — real addresses, real password hashes — and this entry
 *    point points at it every time somebody runs `npm run dev`.
 *
 * `.test` is reserved by RFC 2606 and can never be registered, so no real person can ever own
 * one of these addresses and no mail to one can ever be delivered. That is the point of the
 * choice: the namespace is not a convention somebody could drift out of, it is a domain that
 * does not exist.
 */

import { normalizeEmail } from '@/lib/allowlist'

/** The one domain a QA account can live in. Reserved by RFC 2606 — see this file's header. */
export const QA_DOMAIN = 'strumfolio.test'

/**
 * Anchored at both ends, and deliberately narrow: lowercase letters, digits and hyphens before
 * the `@`, nothing after the domain. Unanchored — or `endsWith` — is the classic hole, where
 * `qa@strumfolio.test.example.com` passes a check written to mean the opposite. No dots and no
 * `+` in the local part either: both are subaddressing syntax somewhere, and neither is needed
 * for an address this file generates itself.
 */
const QA_ADDRESS = /^[a-z0-9-]+@strumfolio\.test$/

/**
 * Whether the QA entry point may run in this environment.
 *
 * `VERCEL_ENV` and **not** `NODE_ENV`, for the reason `forcedPlanNotice` states: `NODE_ENV` is
 * `production` on a Vercel preview too, so guarding on it would switch this off in one of the
 * two environments it exists for. `VERCEL_ENV` is absent when nobody deployed this — a local
 * `npm run dev`, a `npm test` — which is the third way in and the reason the empty cases are
 * allowed rather than refused.
 */
export function qaAllowed(vercelEnv: string | undefined | null): boolean {
  if (vercelEnv === undefined || vercelEnv === null || vercelEnv === '') return true
  return vercelEnv === 'preview' || vercelEnv === 'development'
}

/** The same question against this process's own environment, read at call time. */
export function qaEntryEnabled(): boolean {
  return qaAllowed(process.env.VERCEL_ENV)
}

/** Whether this address is one the QA entry point is allowed to create or enter as. */
export function isQaEmail(email: string | null | undefined): boolean {
  if (email === null || email === undefined) return false
  return QA_ADDRESS.test(normalizeEmail(email))
}

/**
 * A QA address built from an arbitrary token — six random hex characters in the ordinary case,
 * a word when somebody wants a stable one.
 *
 * Returns null rather than a repaired address when the token has nothing usable in it: the
 * caller's next move is to refuse, and an address silently different from the one that was
 * asked for is the thing an entry point like this must never hand back.
 */
export function qaEmailFrom(token: string): string | null {
  const slug = normalizeEmail(token)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug === '') return null

  const email = `qa-${slug}@${QA_DOMAIN}`
  return isQaEmail(email) ? email : null
}

/**
 * The one QA address worth writing down, because it is the only one that can be made a **global
 * owner**: `isOwner` reads `ALLOWED_EMAILS` out of the environment and nothing at runtime can
 * add to it, so `/coupons`, `/accounts` and `/leads` stay shut to every account this page mints
 * unless somebody puts an address in that variable by hand. A stable one rather than the random
 * addresses this page hands out by default, so there is a single string to paste — in
 * `.env.local` for local work, in Vercel's Preview environment for the preview.
 *
 * It is not an owner by existing. Nothing here grants anything; this is just the address to
 * allowlist if that is wanted.
 */
export const QA_OWNER_EMAIL = `qa-owner@${QA_DOMAIN}`

/**
 * The password written into `credentials` for every account this page creates.
 *
 * Not a secret and deliberately printed on the page: in this codebase a `credentials` row *is*
 * what "already verified" means — it only ever exists for an address that has been through
 * `/verify` (`auth.ts`) — so writing one is both halves at once, the account being verified and
 * the sign-in form staying testable by hand. It can only ever belong to an address in a domain
 * that does not exist, on a deployment that is not production.
 */
export const QA_PASSWORD = 'QaPassword123'
