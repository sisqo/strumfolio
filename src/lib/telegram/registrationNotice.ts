/**
 * The label a "new registration" Telegram notice uses for whoever just signed up
 * (`auth.ts`'s `signIn` callback, `verify/actions.ts`'s `verifyEmail`) — pure and
 * synchronous so it can be tested with `node:test`, the same reason `nameSplit.ts`
 * lives apart from the callback that calls it.
 */

/**
 * The full name when at least one half is known, the bare email otherwise — the
 * format this notice used before `PLAN-account-name.md`, unchanged for anyone with no
 * name yet. Either half missing or empty is dropped rather than printed as a gap
 * (`splitName` can hand back a first name with no last name at all).
 */
export function registrationNotice(
  email: string,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const name = [firstName, lastName].filter((part): part is string => part != null && part !== '').join(' ')
  return name === '' ? `🆕 Nuova registrazione: ${email}` : `🆕 Nuova registrazione: ${name} (${email})`
}
