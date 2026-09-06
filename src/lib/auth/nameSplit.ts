/**
 * Splitting a single `name` claim into first/last, for the rare Google profile that
 * exposes `name` but not `given_name`/`family_name` separately (`auth.ts`'s `signIn`
 * callback). Pure and synchronous so it can be
 * tested with `node:test` — `auth.ts` cannot be, the same reason `checkout.ts` keeps
 * `isAcceptedTestCard` in a sibling module.
 */

/** First word as `firstName`, everything after it as `lastName` — never throws, never blocks a sign-in. */
export function splitName(name: string | null | undefined): { firstName: string; lastName: string } {
  const trimmed = (name ?? '').trim()
  if (trimmed === '') return { firstName: '', lastName: '' }

  const [firstName, ...rest] = trimmed.split(/\s+/)
  return { firstName, lastName: rest.join(' ') }
}
