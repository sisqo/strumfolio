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
import { hasDatabase } from '@/lib/db/client'
import { effectivePlanOf, hasChosenPlan } from '@/lib/plans/resolve'
import type { Plan } from '@/lib/plans/types'
import type { Role } from '@/lib/roles'

/**
 * The signed-in reader's address, role, plan and plan-choice state, or null when there is
 * nobody or nobody allowed — one `currentUser()` call for all four, for `RoleProvider`, which
 * needs the address too now (v3.3, the user menu) and would otherwise ask twice on every page.
 *
 * `plan` and `planChosen` are both resolved for `accountOwnerEmail`, not for `email` itself,
 * for the reason `permit`/`permitOn` already read that column instead of the caller's own: a
 * global owner looking at an account they switched into sees *that* account's plan (and its
 * choice state) on their own menu, because that is whose limits apply to what they are about
 * to do next. `planChosen` exists only for `PricingPlans`' own Free card
 * (PLAN.md, v3.7) — the mandatory-choice gate itself lives server-side in
 * `(home)/page.tsx`, not here; this is cosmetic, deciding which of that card's own states
 * shows, never what the server allows.
 */
export async function loadIdentity(): Promise<{
  email: string
  role: Role
  plan: Plan | null
  planChosen: boolean
} | null> {
  const user = await currentUser()
  if (user === null) return null

  const [plan, planChosen] = await Promise.all([
    effectivePlanOf(user.accountOwnerEmail),
    hasChosenPlan(user.accountOwnerEmail),
  ])

  return { email: user.email, role: user.role, plan, planChosen }
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
