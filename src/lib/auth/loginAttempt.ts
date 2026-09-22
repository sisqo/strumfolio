/**
 * What a typed email and password mean, decided around the one hash comparison a sign-in
 * attempt is allowed to make.
 *
 * Until 2026-09-19 there was nothing to decide: `authorize` read `credentials` and a miss
 * was a miss. But an address that registered and never followed the link has **no
 * `credentials` row at all** — its password lives in `pendingRegistrations` until
 * `verifyEmail` moves it across — so it was indistinguishable from an address nobody has
 * ever typed here, and the form answered «Wrong email or password» to somebody whose
 * password was right. Reported as a bug, and it is one: the sentence names the two things
 * that are *not* wrong.
 *
 * **The anti-enumeration rule the old shape enforced is kept, not relaxed**: the refusal is
 * only ever specific to somebody who has already proved they know the password for the
 * pending row. A stranger probing addresses types the wrong password by definition and gets
 * the same «Wrong email or password» as before, so this form still answers nothing about
 * which addresses exist here.
 *
 * Split in two on purpose, with the hashing in between and outside:
 * `passwordSourceFor` picks the **one** hash that will be spent, and `outcomeFor` reads the
 * answer. That shape is what guarantees a single scrypt per attempt whatever the branch —
 * two would put back the timing signal `verifyAgainstNothing` exists to remove — and it is
 * what lets the whole rule be tested without a database (`loginAttempt.test.ts`), the same
 * reason `planChange.ts` sits beside `paddlePlanChange.ts`.
 */

/** A registration that has been paid for with a password and not yet confirmed. */
export interface PendingCredential {
  passwordHash: string
  expiresAt: Date
}

/**
 * Which stored hash this attempt is to be judged against.
 *
 * `'none'` is not «no hash»: the caller still spends a scrypt on `verifyAgainstNothing`,
 * because an address with nothing behind it has to cost what one with a row costs.
 */
export type PasswordSource =
  | { kind: 'account'; hash: string }
  | { kind: 'pending'; hash: string; expiresAt: Date }
  | { kind: 'none' }

/**
 * A real account always wins over a pending row for the same address, and the order is
 * load-bearing rather than tidy: a pending registration may outlive an account born some other
 * way (`provisionAccount` purges it only since 2026-09-22, so older ones remain), so reading
 * the pending hash first would judge a verified reader against a password they may have
 * abandoned, and then tell them to go and confirm an address that is already confirmed.
 */
export function passwordSourceFor(accountHash: string | null, pending: PendingCredential | null): PasswordSource {
  if (accountHash !== null) return { kind: 'account', hash: accountHash }
  if (pending !== null) return { kind: 'pending', hash: pending.passwordHash, expiresAt: pending.expiresAt }

  return { kind: 'none' }
}

export type LoginOutcome =
  | { outcome: 'admitted' }
  /** `linkExpired` only chooses the wording — the email can be resent either way. */
  | { outcome: 'unverified'; linkExpired: boolean }
  | { outcome: 'refused' }

/**
 * `matched` first, before anything is said about the source: every branch below this line
 * describes an address to somebody who has already proved they know its password.
 *
 * `'none'` with `matched` true cannot happen — `verifyAgainstNothing` returns the literal
 * `false` — and is refused rather than trusted, so a caller that ever hands this the wrong
 * boolean grants nothing.
 */
export function outcomeFor(source: PasswordSource, matched: boolean, now: Date): LoginOutcome {
  if (!matched) return { outcome: 'refused' }

  switch (source.kind) {
    case 'account':
      return { outcome: 'admitted' }
    case 'pending':
      return { outcome: 'unverified', linkExpired: source.expiresAt.getTime() <= now.getTime() }
    case 'none':
      return { outcome: 'refused' }
  }
}

/**
 * How «unverified» travels from `authorize` to the page that has to word it.
 *
 * A string in `CredentialsSignin`'s own `code`, and **both facts encoded in the string**
 * rather than one of them carried as a property on the error: the thrown instance crosses
 * the `signIn` server action and a module boundary the bundler is free to duplicate, so an
 * `instanceof` against our own subclass is a thing that can quietly stop being true. A
 * comparison on `code` cannot.
 */
export const UNVERIFIED_CODE = 'email-unverified'
export const UNVERIFIED_EXPIRED_CODE = 'email-unverified-expired'

export function unverifiedCodeFor(linkExpired: boolean): string {
  return linkExpired ? UNVERIFIED_EXPIRED_CODE : UNVERIFIED_CODE
}

/** The two facts back out of a thrown error's `code`, or null for every other failure. */
export function unverifiedFromCode(code: unknown): { linkExpired: boolean } | null {
  if (code === UNVERIFIED_CODE) return { linkExpired: false }
  if (code === UNVERIFIED_EXPIRED_CODE) return { linkExpired: true }

  return null
}
