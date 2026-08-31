/**
 * Results for the two actions only a global owner may take on an account other than
 * their own: deleting one, and hand-assigning it a plan.
 *
 * A separate file from `actions.ts` because that file carries `'use server'`, where every
 * export must be an async function — a plain union, a `Record` or a `const` would break the
 * directive's contract. That is also why `GrantInput` and `MAX_GRANT_NOTE` are here and not
 * beside `setGrant`: the client component needs both, and the action's own module cannot
 * export either.
 *
 * No longer names creating an account (PLAN.md, v3.8): self-service registration
 * and automatic provisioning on any first sign-in — Google or password — cover every real
 * case an admin-created account used to, and `deleteAccount` never answered `invalid-email`
 * or `already-exists` — this project does not model states a function cannot reach, the
 * same discipline `SelfDeleteFailure` below already states for itself.
 */

export type AccountFailure =
  | 'not-allowed'
  | 'no-database'
  /** Deleting: the retyped address did not match the one being deleted. */
  | 'confirm-mismatch'
  | 'failed'

export type AccountResult = { ok: true } | { ok: false; reason: AccountFailure }

export const ACCOUNT_MESSAGE: Record<AccountFailure, string> = {
  'not-allowed': 'Only a global owner may delete accounts.',
  'no-database': 'No database configured: accounts cannot be deleted.',
  'confirm-mismatch': 'Type the account’s email exactly to confirm.',
  failed: 'Save failed. Please try again.',
}

/**
 * Results for the one action every reader may take on their own account, own-owner
 * or not: deleting it. A separate type from `AccountFailure` rather than one more
 * member added to it — `deleteMyAccount` can never answer `not-allowed`,
 * `invalid-email` or `already-exists`, and this project does not model states a
 * function cannot reach (see `ResendFailure`, next to `RegisterFailure`, for the
 * same reasoning).
 */
export type SelfDeleteFailure = 'no-database' | 'confirm-mismatch' | 'failed'

export type SelfDeleteResult = { ok: true } | { ok: false; reason: SelfDeleteFailure }

export const SELF_DELETE_MESSAGE: Record<SelfDeleteFailure, string> = {
  'no-database': 'No database configured: accounts cannot be deleted.',
  'confirm-mismatch': 'Type your email exactly to confirm.',
  failed: 'Something went wrong. Please try again.',
}

/**
 * Results for the one action every reader may take on their own first and last name
 * (`/profile`, `PLAN-account-name.md` point 5) — a fourth union rather than new members
 * on any of the above, for the same reason `SelfDeleteFailure` already states: none of
 * `updateOwnName`'s reachable failures overlap with deleting or granting a plan.
 */
export type NameFailure = 'no-session' | 'no-database' | 'invalid-name' | 'failed'

export type NameResult = { ok: true } | { ok: false; reason: NameFailure }

export const NAME_MESSAGE: Record<NameFailure, string> = {
  'no-session': 'Session expired. Reload the page and sign in again.',
  'no-database': 'No database configured: your name cannot be saved.',
  'invalid-name': 'Enter both your first and last name.',
  failed: 'Save failed. Please try again.',
}

/**
 * What an operator typed into the grant panel, before anything has been checked.
 *
 * `plan` is a `string` and not a `Plan`, and the loose type is the point: this value arrives
 * from a browser, so the narrowing has to be a refusal (`validateGrant`) and not a coercion.
 * `readPlan` would turn `'premuim'` into `'free'` and report success — see its own comment on
 * why an unreadable plan must never grant.
 */
export interface GrantInput {
  /** A member of `PLAN_VALUES` other than `'free'`. Checked with `includes`, never `readPlan`. */
  plan: string
  /** `'YYYY-MM-DD'` as an `<input type="date">` produces it, or null for a gift with no end. */
  until: string | null
  /** Why this was given. Required non-empty when setting; unused when clearing. */
  note: string
}

/**
 * How long a reason may be. Enforced on the client as `maxLength` *and* in the action, the
 * same both-layers reasoning `DeleteAccountButton` gives about its retype: an attribute is a
 * hint to a form, not a guarantee about a server action, which anything holding the session
 * cookie can call directly. Postgres will not refuse it either — `granted_note` is `text`,
 * with no length of its own — so this number is the only limit that exists.
 */
export const MAX_GRANT_NOTE = 500

/**
 * A third union rather than new members on `AccountFailure`, for the reason
 * `SelfDeleteFailure` already gives: `setGrant` can never answer `already-exists`,
 * `confirm-mismatch` or `invalid-email` — the address it writes to comes from a rendered row,
 * never from a field — and `deleteAccount` can never answer `invalid-plan`. This project does
 * not model states a function cannot reach.
 *
 * Every member below is reachable, and from where is worth saying because two of them look
 * like they could not be: `invalid-plan` and `note-too-long` are unreachable *through the
 * panel*, which offers four fixed options and a `maxLength`, and perfectly reachable through a
 * direct call to the server action, which is the only reason they are checked at all.
 */
export type GrantFailure =
  | 'not-allowed'
  | 'no-database'
  /** No row for this address any more — another tab deleted it while this panel was open. */
  | 'unknown-account'
  /** Not in `PLAN_VALUES`, or `'free'`, which grants nothing: see `validateGrant`. */
  | 'invalid-plan'
  /** Not a calendar day, or a day already past — which `liveGrant` would make inert on write. */
  | 'invalid-date'
  /**
   * `lifetime` with an end date. Storable, and `liveGrant` would faithfully expire it, which is
   * exactly the problem: every other screen reads "Lifetime" as *never ends*, so the row would
   * make `giftLine` print the self-contradicting "Gift — Lifetime until 31 December 2026".
   */
  | 'lifetime-with-date'
  /** The audit is the whole point of `grantedNote`; an unexplained gift reads as a webhook bug. */
  | 'note-required'
  | 'note-too-long'
  | 'failed'

export type GrantResult = { ok: true } | { ok: false; reason: GrantFailure }

export const GRANT_MESSAGE: Record<GrantFailure, string> = {
  'not-allowed': 'Only a global owner may give or remove a plan.',
  'no-database': 'No database configured: plans cannot be given or removed.',
  'unknown-account': 'This account no longer exists. Reload the page.',
  'invalid-plan': 'Choose a plan to give.',
  'invalid-date': 'The end date must be in the future, or empty for no end.',
  'lifetime-with-date': 'Lifetime never ends: leave the date empty, or give a different plan.',
  'note-required': 'Say why this was given: an unexplained gift reads as a bug.',
  'note-too-long': `Keep the reason under ${MAX_GRANT_NOTE} characters.`,
  // Verbatim `ACCOUNT_MESSAGE.failed`: the same sentence for the same event on the same screen.
  failed: 'Save failed. Please try again.',
}
