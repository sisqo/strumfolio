'use server'

/**
 * What the browser may ask about its own account, and do to it — plus the one exception,
 * a global owner setting or removing the password of an account they did not sign into
 * themselves (v3.1's *Niente più ospiti* has no invite flow and no email to send one
 * through, so this is the only way someone without a matching Google account ever gets a
 * way in at all).
 *
 * The role is here because a screen has to know what to leave out.
 */

import { eq, inArray } from 'drizzle-orm'

import { auth } from '@/auth'
import { normalizeEmail, isOwner } from '@/lib/allowlist'
import {
  deletePasswordHash,
  readPasswordHash,
  writePasswordHash,
} from '@/lib/auth/credentials'
import { hashPassword, isPasswordAcceptable, verifyPassword } from '@/lib/auth/password'
import { currentUser } from '@/lib/auth/session'
import type { PasswordResult } from '@/lib/auth/types'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts, rateLimitHits } from '@/lib/db/schema'
import { sendPasswordResetToken } from '@/lib/forgotPassword/actions'
import { hasChosenPlan, planNamesOf } from '@/lib/plans/resolve'
import type { Plan } from '@/lib/plans/types'
import type { AdminActionResult } from '@/lib/accounts/types'
import type { Role } from '@/lib/roles'

/**
 * The signed-in reader's own first name, for `loadIdentity` below — `user.email`, never
 * `accountOwnerEmail`: `UserMenu`'s greeting is about who is actually looking, the same
 * choice `avatarInitials` already makes for the same reason. Null on no database, no row,
 * or a row that has none yet — `UserMenu` treats an empty string the same way.
 */
async function readFirstName(email: string): Promise<string | null> {
  if (!hasDatabase) return null
  try {
    const rows = await db()
      .select({ firstName: accounts.firstName })
      .from(accounts)
      .where(eq(accounts.ownerEmail, email))
      .limit(1)
    return rows[0]?.firstName ?? null
  } catch (error) {
    console.error('readFirstName failed', error)
    return null
  }
}

/**
 * The signed-in reader's address, role, plan and plan-choice state, or null when there is
 * nobody or nobody allowed — one `currentUser()` call for all five, for `RoleProvider`, which
 * needs the address too now (v3.3, the user menu) and would otherwise ask twice on every page.
 *
 * `plan` and `planChosen` are both resolved for `accountOwnerEmail`, not for `email` itself,
 * for the reason `permit`/`permitOn` already read that column instead of the caller's own: a
 * global owner looking at an account they switched into sees *that* account's plan (and its
 * choice state) on their own menu, because that is whose limits apply to what they are about
 * to do next. `planChosen` exists only for `PricingPlans`' own Free card
 * (v3.7) — the mandatory-choice gate itself lives server-side in
 * `(home)/page.tsx`, not here; this is cosmetic, deciding which of that card's own states
 * shows, never what the server allows.
 *
 * `plan` and `subscriptionPlan` are the two halves of `planNamesOf` and are deliberately not
 * interchangeable: `plan` is the *effective* one, gift included, and is what the account
 * menu's badge names; `subscriptionPlan` is the live subscription alone, and is what
 * `/pricing` compares ranks against so a gift can never be mistaken for a purchase. See
 * `planNamesOf`'s own comment for the bug that made the distinction necessary.
 *
 * `accountOwnerEmail` travels back too (`ViewingAsPill`, `TopBar.tsx`) — the same field
 * `plan`/`planChosen` already read, just handed to the client as well now instead of only
 * used here. It equals `email` except for a global owner switched into another account
 * (`mayAccess`, `accounts/current.ts`); nobody else can make the two differ.
 *
 * `isGlobalOwner` rides along too rather than staying `mayShowAccountSwitcher`'s own
 * server action — `RoleProvider` used to `Promise.all` the two, but that is still a
 * second network round trip on every mount, not a second query: this check is one
 * `isOwner` call against an env var, no database involved. Folding it in here is what
 * turns "identity, and whether the switcher may show" back into the one request
 * `currentUser()`'s own comment already promised for the first five fields — every
 * `mayEdit`-gated button in the app waits on this same round trip to resolve before it
 * can appear at all (see `RoleProvider`'s own "hide until known"), so one request
 * arriving sooner is the whole of what shortens that wait.
 */
export async function loadIdentity(): Promise<{
  email: string
  accountOwnerEmail: string
  role: Role
  plan: Plan | null
  subscriptionPlan: Plan | null
  planChosen: boolean
  firstName: string | null
  isGlobalOwner: boolean
} | null> {
  const user = await currentUser()
  if (user === null) return null

  const [names, planChosen, firstName] = await Promise.all([
    planNamesOf(user.accountOwnerEmail),
    hasChosenPlan(user.accountOwnerEmail),
    readFirstName(user.email),
  ])

  return {
    email: user.email,
    accountOwnerEmail: user.accountOwnerEmail,
    role: user.role,
    isGlobalOwner: hasDatabase && isOwner(user.email, process.env.ALLOWED_EMAILS),
    plan: names.effective,
    subscriptionPlan: names.subscription,
    planChosen,
    firstName,
  }
}

/**
 * Your own account, for the screen that manages it: who you are, what you may do, and
 * whether you can already get in without Google.
 *
 * Not whether the password is any good and certainly not what it is — only that one exists,
 * which is what decides whether the form asks for the current one.
 */
export async function loadAccount(): Promise<{
  email: string
  role: Role
  hasPassword: boolean
} | null> {
  const user = await currentUser()
  if (user === null) return null

  return { ...user, hasPassword: (await readPasswordHash(user.email)) !== null }
}

/**
 * Changes your own password.
 *
 * The address comes from the session and nowhere else — there is no parameter for it, so
 * there is nothing for a caller to substitute. That is the whole of the authorisation:
 * anyone signed in may do this, because your own way of getting in is not something
 * shared.
 *
 * The current password is required when there is one. Someone who has only ever used
 * Google has none, and asking them for it would leave them unable to set a first one.
 */
export async function setOwnPassword(
  current: string,
  next: string,
): Promise<PasswordResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  if (!isPasswordAcceptable(next)) return { ok: false, reason: 'weak-password' }

  try {
    const stored = await readPasswordHash(user.email)
    if (stored !== null && !(await verifyPassword(current, stored))) {
      return { ok: false, reason: 'wrong-password' }
    }

    await writePasswordHash(user.email, await hashPassword(next))
    return { ok: true }
  } catch (error) {
    console.error('setOwnPassword failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/** Forgets your own password, leaving Google as the way in. */
export async function removeOwnPassword(): Promise<PasswordResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  try {
    if ((await readPasswordHash(user.email)) === null) {
      return { ok: false, reason: 'no-password' }
    }

    await deletePasswordHash(user.email)
    return { ok: true }
  } catch (error) {
    console.error('removeOwnPassword failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Sets or replaces the password of an account a global owner is not signed in as — the
 * only way in for an address with no matching Google account, since there is no invite
 * email to send one through. Authorized with `isOwner` directly, not the account's own
 * `admin` role: every account's owner is `admin` on their own, and that would let anyone
 * hand themselves — or anyone else — a way into an account they merely happen to own,
 * which is not what this is for.
 *
 * A global owner may still target their own address here — the `is-owner` guard below
 * only blocks *another* admin's — which skips the current-password check `setOwnPassword`
 * requires. Not a new hole: `removeOwnPassword` already needs no current password either,
 * so a hijacked session could reach the same result through it.
 */
export async function setPasswordFor(email: string, password: string): Promise<PasswordResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'not-allowed' }
  }

  const address = normalizeEmail(email)
  if (!isPasswordAcceptable(password)) return { ok: false, reason: 'weak-password' }
  if (address !== normalizeEmail(session?.user?.email ?? '') && isOwner(address, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'is-owner' }
  }

  try {
    await writePasswordHash(address, await hashPassword(password))
    return { ok: true }
  } catch (error) {
    console.error('setPasswordFor failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Sends a password-reset email to an account on `/accounts/[email]`, instead of setting
 * the password directly (`PasswordForm`) — for when the admin would rather let the
 * account holder pick their own. Reuses
 * `sendPasswordResetToken` (`lib/forgotPassword/actions.ts`) — the same token generation
 * and email `requestPasswordReset` sends — but bypasses both its rate limit and its
 * anti-enumeration masking: this page is already `isOwner`-gated for an address the
 * operator already knows exists, so a fake `ok: true` here would only hide a real
 * failure from the one person in a position to act on it.
 */
export async function sendPasswordResetFor(email: string): Promise<PasswordResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'not-allowed' }
  }

  try {
    await sendPasswordResetToken(normalizeEmail(email))
    return { ok: true }
  } catch (error) {
    console.error('sendPasswordResetFor failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Clears the login/registration/reset/feedback rate-limit buckets for one address, on
 * `/accounts/[email]` — for a legitimate reader
 * blocked by accident ("it says try again later"). Only the **email**-keyed buckets,
 * never the IP-keyed ones (`login:ip:*` and so on, `rateLimit.ts`): an IP can be shared
 * (NAT, a public wifi network), and clearing it would unblock everyone else behind it
 * too, not just the one account an operator has open. Lives here rather than in
 * `rateLimit.ts` itself, deliberately: that file has no `isOwner` gate anywhere in it
 * and is imported by code with no session to check, so an `isOwner`-gated action that
 * takes an arbitrary address belongs with the rest of this file's admin actions instead.
 */
export async function clearRateLimitFor(email: string): Promise<AdminActionResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'not-allowed' }
  }

  const address = normalizeEmail(email)

  try {
    await db()
      .delete(rateLimitHits)
      .where(
        inArray(rateLimitHits.key, [
          `login:email:${address}`,
          `register:email:${address}`,
          `reset:email:${address}`,
          `feedback:${address}`,
        ]),
      )
    return { ok: true }
  } catch (error) {
    console.error('clearRateLimitFor failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/** Forgets the password of an account a global owner is not signed in as — see `setPasswordFor`. */
export async function removePasswordFor(email: string): Promise<PasswordResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'not-allowed' }
  }

  const address = normalizeEmail(email)
  if (address !== normalizeEmail(session?.user?.email ?? '') && isOwner(address, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'is-owner' }
  }

  try {
    if ((await readPasswordHash(address)) === null) {
      return { ok: false, reason: 'no-password' }
    }

    await deletePasswordHash(address)
    return { ok: true }
  } catch (error) {
    console.error('removePasswordFor failed', error)
    return { ok: false, reason: 'failed' }
  }
}
