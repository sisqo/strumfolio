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
 * Names creating an account again (2026-09-11), which v3.8 removed on the grounds that
 * self-service registration and automatic provisioning on any first sign-in «cover every real
 * case an admin-created account used to». That is true of somebody *asking* for an account and
 * was never true of the two cases left over: the pre-`02ac495` quirk whose documented repair is
 * «delete and recreate the account from the Accounts admin page» (`accounts/CLAUDE.md`), which
 * has had no second half since, and an operator opening an account for somebody who has asked
 * for nothing yet. `CreateAccountFailure` is its own union at the foot of this file rather than
 * new members here, which is the discipline that removal itself argued from: `deleteAccount` can
 * never answer `already-exists`, and this project does not model states a function cannot reach
 * — the same rule `SelfDeleteFailure` below states for itself.
 */

import { MIN_PASSWORD } from '@/lib/auth/types'

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
 * (`/profile`) — a fourth union rather than new members
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
 * same both-layers reasoning `DeleteAccountRow` gives about its retype: an attribute is a
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
   * make `giftHeadline` print the self-contradicting "Gift of Lifetime, active until 2026-12-31".
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

/**
 * How telling the reader about their gift can refuse — a fourth union rather than members on
 * `GrantFailure`, the split this file already makes twice: `setGrant` can never answer
 * `already-sent`, and none of these can answer `invalid-date`. The two actions run one after
 * the other and share nothing but an address.
 *
 * Three of these describe a gift that is real and still not worth an email, and they are kept
 * apart because an operator meeting one wants to know which: **`no-gift`** is a row with
 * nothing in `granted_plan` (the gift was removed in another tab while this dialog was open),
 * while **`nothing-to-announce`** is a gift that exists and is doing nothing — outranked by a
 * live subscription, or past its own end date. **`already-sent`** is the unique index doing
 * its job, and it is a success from the reader's point of view: the message they would have
 * received, they already have.
 */
export type GiftNoticeFailure =
  | 'not-allowed'
  | 'no-database'
  | 'unknown-account'
  /** No gift on the row at all any more. */
  | 'no-gift'
  /**
   * `granted_plan` holds something that is not a giveable plan. Unreachable through this
   * screen, which only ever writes what `validateGrant` accepted — and checked for the reason
   * that function gives about never using `readPlan` on a gift: an unreadable cell read
   * generously becomes `'free'`, which with no live subscription wins, and the reader is sent
   * a message announcing a gift of nothing.
   */
  | 'unreadable-gift'
  /** A gift that changes nothing right now: outranked by a live subscription, or already ended. */
  | 'nothing-to-announce'
  /** A `done` row already exists for this exact gift — see `giftOccurrenceKey`. */
  | 'already-sent'
  /** Another send for this gift started moments ago and has not settled. */
  | 'in-flight'
  /** The row was claimed and Resend refused. It stays on file as `failed` and can be retried. */
  | 'send-failed'
  | 'failed'

export type GiftNoticeResult = { ok: true } | { ok: false; reason: GiftNoticeFailure }

export const GIFT_NOTICE_MESSAGE: Record<GiftNoticeFailure, string> = {
  'not-allowed': 'Only a global owner may send this.',
  'no-database': 'No database configured: nothing can be sent.',
  'unknown-account': 'This account no longer exists. Reload the page.',
  'no-gift': 'There is no gift on this account to tell them about.',
  'unreadable-gift': 'This account’s gift names a plan that no longer exists, so nothing can be said about it.',
  'nothing-to-announce':
    'This gift is not in force — a live subscription outranks it, or it has ended — so there is nothing to announce.',
  'already-sent': 'They have already been told about this gift. Change the plan or the end date to send again.',
  'in-flight': 'Another send for this gift started a moment ago. Wait for it to finish.',
  'send-failed': 'The email did not go out. The gift is saved; you can try again.',
  failed: 'Could not send. Please try again.',
}

/**
 * Results for the handful of admin actions on `/accounts/[email]` whose only three ways
 * to fail are the same: not a global owner, no database, or something else went wrong
 * (`updateInternalNote`, `setAccountSuspended`, `clearRateLimitFor`, `accounts/actions.ts`
 * and `auth/actions.ts`). One union rather than three near-identical ones — each action
 * still gets its own message map below, since the *reason* worth showing an operator is
 * not the same across all three.
 */
export type AdminActionFailure = 'not-allowed' | 'no-database' | 'failed'

export type AdminActionResult = { ok: true } | { ok: false; reason: AdminActionFailure }

export const NOTE_MESSAGE: Record<AdminActionFailure, string> = {
  'not-allowed': 'Only a global owner may edit the internal note.',
  'no-database': 'No database configured: the note cannot be saved.',
  failed: 'Save failed. Please try again.',
}

export const SUSPEND_MESSAGE: Record<AdminActionFailure, string> = {
  'not-allowed': 'Only a global owner may suspend an account.',
  'no-database': 'No database configured: the account cannot be suspended.',
  failed: 'Save failed. Please try again.',
}

export const RATE_LIMIT_MESSAGE: Record<AdminActionFailure, string> = {
  'not-allowed': 'Only a global owner may clear a rate limit.',
  'no-database': 'No database configured: nothing to clear.',
  failed: 'Clear failed. Please try again.',
}

/**
 * Results for an admin correcting an account's first and last name — a union of its own
 * rather than new members on `NameFailure`, which is the self-service `/profile` action
 * and can never answer `not-allowed`: nobody is refused their own name.
 */
export type AdminNameFailure = 'not-allowed' | 'no-database' | 'invalid' | 'failed'

export type AdminNameResult = { ok: true } | { ok: false; reason: AdminNameFailure }

export const ADMIN_NAME_MESSAGE: Record<AdminNameFailure, string> = {
  'not-allowed': 'Only a global owner may edit another account’s name.',
  'no-database': 'No database configured: the name cannot be saved.',
  invalid: 'Enter both a first and last name.',
  failed: 'Save failed. Please try again.',
}

/**
 * Results for renaming an account's address (`changeAccountEmail`). This is a **rename**,
 * never a merge: `target-exists` is not a bug to work around, it is the whole reason this
 * refuses instead of combining two accounts' content — see the action's own comment.
 */
export type EmailChangeFailure =
  | 'not-allowed'
  | 'no-database'
  | 'invalid-email'
  /** Retyped the account's own current address — nothing to change. */
  | 'same-email'
  /** The new address already has an account, a password, or a sign-in row of its own. */
  | 'target-exists'
  /** No row for the old address any more — another tab deleted or renamed it already. */
  | 'not-found'
  | 'failed'

export type EmailChangeResult = { ok: true; newEmail: string } | { ok: false; reason: EmailChangeFailure }

export const EMAIL_CHANGE_MESSAGE: Record<EmailChangeFailure, string> = {
  'not-allowed': 'Only a global owner may change an account’s email.',
  'no-database': 'No database configured: the email cannot be changed.',
  'invalid-email': 'Enter a real email address.',
  'same-email': 'That is already this account’s address.',
  'target-exists': 'That address already belongs to another account.',
  'not-found': 'This account no longer exists. Reload the page.',
  failed: 'Save failed. Please try again.',
}

/**
 * Results for confirming a pending registration by hand (`confirmPendingRegistration`),
 * bypassing the verification link entirely — see the action's own comment on the risk
 * this accepts.
 */
export type ConfirmPendingFailure = 'not-allowed' | 'no-database' | 'not-found' | 'failed'

export type ConfirmPendingResult = { ok: true } | { ok: false; reason: ConfirmPendingFailure }

export const CONFIRM_PENDING_MESSAGE: Record<ConfirmPendingFailure, string> = {
  'not-allowed': 'Only a global owner may confirm a pending registration.',
  'no-database': 'No database configured: nothing to confirm.',
  'not-found': 'No pending registration for this address. It may already be confirmed.',
  failed: 'Confirm failed. Please try again.',
}

/**
 * Results for opening an account by hand from `/accounts` (`createAccount`) — the address,
 * the name, and optionally a password the operator chooses on the account's behalf.
 *
 * `already-exists` and `pending-registration` are two answers and not one on purpose: the
 * first is a dead end and the second is a button away, on the very same screen, along the
 * path that keeps the password the person actually chose. `weak-password` is only reachable
 * when a password was typed at all — an empty one is a decision, not a mistake.
 *
 * **Success carries two things, and both exist because the alternative is a lie.** `email` is
 * the address as the server normalized and actually wrote it, the arrangement
 * `EmailChangeResult` already uses, so no caller has to re-spell that rule to build a link to
 * the row. `passwordSaved` answers the one failure that can happen *after* the account exists:
 * returning `failed` there would send an operator back to a form that now answers
 * `already-exists`, and returning a bare `ok` would let them walk away believing a password is
 * in place that is not.
 */
export type CreateAccountFailure =
  | 'not-allowed'
  | 'no-database'
  | 'invalid-email'
  /** First or last name missing, or only whitespace — checked after trimming both. */
  | 'invalid-name'
  | 'weak-password'
  /** An account, a password or a sign-in already exists for this address. */
  | 'already-exists'
  /** The address registered on its own and is waiting for its link to be followed. */
  | 'pending-registration'
  | 'failed'

export type CreateAccountResult =
  | {
      ok: true
      /** The address as written, normalized — never the raw string the form submitted. */
      email: string
      /** False only when a password was asked for and the write after the account tripped. */
      passwordSaved: boolean
    }
  | { ok: false; reason: CreateAccountFailure }

export const CREATE_ACCOUNT_MESSAGE: Record<CreateAccountFailure, string> = {
  'not-allowed': 'Only a global owner may create an account.',
  'no-database': 'No database configured: accounts cannot be created.',
  'invalid-email': 'Enter a real email address.',
  'invalid-name': 'Enter a first and last name.',
  'weak-password': `The password must be at least ${MIN_PASSWORD} characters.`,
  'already-exists': 'That address already has an account.',
  'pending-registration': 'That address registered on its own: confirm it under “Pending registrations” below instead, so it keeps the password it chose.',
  failed: 'Could not create the account. Please try again.',
}

/**
 * What `createAccount` is given. An object rather than four positional strings because two of
 * them are names and one is a secret, and `createAccount('a@b.c', '', '', 'hunter2000')` says
 * nothing about which is which at the call site.
 */
export interface CreateAccountInput {
  email: string
  firstName: string
  lastName: string
  /** Empty when the operator would rather the account chose its own — see the action. */
  password: string
}
