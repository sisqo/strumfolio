/**
 * The one refusal `authorize` is allowed to be specific about.
 *
 * A `CredentialsSignin` subclass because that is the single error class `@auth/core`
 * re-throws untouched out of the credentials callback (`if (e instanceof AuthError) throw e`)
 * — anything else is wrapped in a `CallbackRouteError` and arrives at the page as a generic
 * failure with nothing left to read. Its `code` is the payload; see `loginAttempt.ts` on why
 * both facts are encoded there rather than hung off the instance.
 *
 * Alone in its own file so `loginAttempt.ts` stays free of `next-auth` and therefore
 * testable under plain `node:test`.
 */

import { CredentialsSignin } from 'next-auth'

import { unverifiedCodeFor } from './loginAttempt'

export class UnverifiedEmail extends CredentialsSignin {
  constructor(linkExpired: boolean) {
    super()
    // Assigned in the body, not as a class field: the base class sets `code` in *its* own
    // constructor, and which of the two writes last is a question about the compiler's class
    // field semantics that this does not need to depend on.
    this.code = unverifiedCodeFor(linkExpired)
  }
}
