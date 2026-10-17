/**
 * What a password action can answer, and what a password has to be.
 *
 * Separate from `password.ts` because that module imports `node:crypto`: the rules a form
 * needs to state — how long a password must be — have to be readable from the browser, and
 * the machine that hashes it must not be.
 */

export const MIN_PASSWORD = 10
export const MAX_PASSWORD = 200

export type PasswordFailure =
  | 'no-session'
  | 'no-database'
  | 'weak-password'
  /** Changing your own, and the current one given does not match. */
  | 'wrong-password'
  /** Asked to remove a password that was not there. */
  | 'no-password'
  /** Only a global owner may set or remove another address's password. */
  | 'not-allowed'
  /** A global owner's own way in is not something another admin may overwrite silently. */
  | 'is-owner'
  /** An operator's send from a database that is not production's, to a real address. */
  | 'not-production'
  | 'failed'

export type PasswordResult = { ok: true } | { ok: false; reason: PasswordFailure }

export const PASSWORD_MESSAGE: Record<PasswordFailure, string> = {
  'no-session': 'Session expired. Reload the page and sign in again.',
  'no-database': 'No database configured: passwords cannot be saved.',
  'weak-password': `The password must be at least ${MIN_PASSWORD} characters.`,
  'wrong-password': 'The current password is not correct.',
  'no-password': 'This address has no password.',
  'not-allowed': 'Only a global owner may do this.',
  'is-owner': "A global owner's password can only be changed by themselves.",
  'not-production': 'Not sent: outside production, emails go only to test addresses.',
  failed: 'Save failed. Please try again.',
}
