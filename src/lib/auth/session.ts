/**
 * Who is asking, and what they are allowed to ask for.
 *
 * Every write path once went through its own copy of "is there a session with an email
 * on it", which was the right question while everyone who could get in could do
 * everything. Now the question has three depths — is there a session, is this address
 * still on the list, and what may it change — and the answer has to be the same one the
 * sign-in callback gives, or taking someone's access away would lock the front door and
 * leave the writes open behind it.
 *
 * What this cannot do is end a session that already exists. The cookie is a ninety-day
 * JWT and the pages are precached, so a reader whose account has been removed keeps
 * whatever their browser already holds until they sign in again. These guards are what
 * stop them changing anything shared in the meantime.
 *
 * Access is re-decided on every call rather than trusted from the token, and that is the
 * point rather than an oversight: it is what makes losing an account — or, for a global
 * owner, a change to `ALLOWED_EMAILS` — take effect on the next action instead of the next
 * sign-in. Neither `roleOf` nor resolving *which* account is current needs the database
 * for that any more (v3.1): with collaborators gone, both questions turn on nothing but
 * the requested address, `ALLOWED_EMAILS`, and normalization.
 */

import { encode } from 'next-auth/jwt'
import { cookies } from 'next/headers'

import { auth } from '@/auth'
import { authConfig } from '@/auth.config'
import { currentAccountFor, readAccountCookie } from '@/lib/accounts/current'
import { normalizeEmail } from '@/lib/allowlist'
import { entitlementsOf } from '@/lib/plans/resolve'
import type { Entitlements } from '@/lib/plans/entitlements'
import { type Role, canEdit, roleOf } from '@/lib/roles'

export interface CurrentUser {
  email: string
  /** Which account this role applies to — see `lib/accounts/current.ts`. */
  accountOwnerEmail: string
  role: Role
}

/**
 * The signed-in reader, the account they are currently looking at, and their role on it —
 * or null when there is nobody at all. A stale cookie pointing at an account this reader
 * can no longer open does not produce that null: the account resolved here already falls
 * back to their own when the requested one no longer answers, so "null" means what it
 * always meant — nobody home at all.
 *
 * Deliberately **not** null merely because there is no database. Running from `content/`
 * with no `DATABASE_URL` is the normal way to work locally, and an owner is an owner there
 * too: `roleOf` reads the environment directly and needs nothing from the database to say
 * so — which is the same property that keeps them in when the database is unreachable in
 * production. What refuses in that mode is each write, with `no-database`, which is the
 * true reason. Saying "your role does not allow this" instead would be a lie with a
 * plausible ring to it.
 *
 * Needs no database to validate the requested account either (v3.1): nobody collaborates
 * on an account that is not theirs, so `currentAccountFor` — like `roleOf` — never reads a
 * membership out of a table that no longer grants one.
 */
export async function currentUser(): Promise<CurrentUser | null> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return null
  const normalized = normalizeEmail(email)

  const raw = process.env.ALLOWED_EMAILS
  const requested = await readAccountCookie()
  const accountOwnerEmail = currentAccountFor(normalized, raw, requested)

  const role = roleOf(normalized, raw, accountOwnerEmail)
  return role === null ? null : { email: normalized, accountOwnerEmail, role }
}

/**
 * Permission to do something on the reader's current account, and the reason when there
 * is none.
 *
 * Two reasons, kept apart because they are two different things to be told: `no-session`
 * is "your session ended, sign in again", which is a thing the reader can fix, and
 * `not-allowed` is "this is not yours to change", which is not. Collapsing them would
 * have someone with no access to this account sent round a login loop for a button that
 * will never work for them.
 *
 * The success branch carries the account's **entitlements** along with the role, and that
 * is deliberate rather than convenient: a write that had permission but never looked at
 * the plan is the failure this shape rules out, the same way one union with two reasons
 * rules out "refused, and nobody knows why". `permit` is the only place they are resolved
 * — never `currentUser`, which every preference write and every read path calls, and all
 * of which stay open regardless of plan.
 *
 * They are resolved for `accountOwnerEmail`, **the account being written**, never for the
 * caller's own address: a global owner working inside somebody else's account is writing
 * that customer's rows, so it is that customer's plan that governs. And they never leave
 * the server — an action returns the `LimitReason` string, never this object, which holds
 * `Date`s and plan internals that have no business crossing to the client.
 */
export type Permission =
  | { ok: true; email: string; accountOwnerEmail: string; role: Role; entitlements: Entitlements }
  | { ok: false; reason: 'no-session' | 'not-allowed' }

async function permit(allows: (role: Role) => boolean): Promise<Permission> {
  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }
  if (!allows(user.role)) return { ok: false, reason: 'not-allowed' }

  return {
    ok: true,
    email: user.email,
    accountOwnerEmail: user.accountOwnerEmail,
    role: user.role,
    entitlements: await entitlementsOf(user.accountOwnerEmail),
  }
}

/**
 * The signed-in reader's role on a **specific** account — not necessarily the one their
 * cookie currently points at.
 *
 * `currentUser` answers "what am I looking at right now", which is the wrong question
 * for a direct link: `/songs/<slug>` names a song, and that song belongs to whichever
 * account its songbook does, regardless of what the visitor happens to have open in the
 * switcher. Every page or action reached by a slug rather than by navigating the current
 * account must resolve access this way, or a signed-in reader of *any* account could open
 * another account's content just by knowing its URL — the actual data is still guarded by
 * the check the caller makes with the result, this only answers what that check should
 * compare against.
 */
export async function accessTo(accountOwnerEmail: string): Promise<CurrentUser | null> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return null
  const normalized = normalizeEmail(email)

  const raw = process.env.ALLOWED_EMAILS
  const target = normalizeEmail(accountOwnerEmail)

  const role = roleOf(normalized, raw, target)
  return role === null ? null : { email: normalized, accountOwnerEmail: target, role }
}

/**
 * Unlike `permit`, a null from `accessTo` does not always mean "no session" — it can mean
 * a real session with no business on *this* account, which is `not-allowed`, not
 * `no-session`: telling a signed-in reader to sign in again for someone else's account
 * would send them round a login loop that fixes nothing.
 */
async function permitOn(accountOwnerEmail: string, allows: (role: Role) => boolean): Promise<Permission> {
  const session = await auth()
  if (!session?.user?.email) return { ok: false, reason: 'no-session' }

  const user = await accessTo(accountOwnerEmail)
  if (user === null || !allows(user.role)) return { ok: false, reason: 'not-allowed' }

  return {
    ok: true,
    email: user.email,
    accountOwnerEmail: user.accountOwnerEmail,
    role: user.role,
    entitlements: await entitlementsOf(user.accountOwnerEmail),
  }
}

/** Permission to change the current account's repertoire: songs, songbooks, order, publishing. */
export function asEditor(): Promise<Permission> {
  return permit(canEdit)
}

/** Permission to change **a specific account's** repertoire — see `accessTo`. */
export function asEditorOn(accountOwnerEmail: string): Promise<Permission> {
  return permitOn(accountOwnerEmail, canEdit)
}

/**
 * Permission to act as admin on the *current account* — the same question as `asEditor`
 * now that admin is the only role there is to hold (v3.1), kept as its own function so
 * call sites that mean "am I in charge here" can still say so, rather than "can I edit".
 *
 * Not a global check: the account's own owner passes this on their own account, by
 * design (see `roleOf`). Anything that must be restricted to a true, installation-wide
 * owner — the "every account" list chief among them — needs `isOwner(email,
 * process.env.ALLOWED_EMAILS)` directly, not this.
 */
export function asAdmin(): Promise<Permission> {
  return permit(canEdit)
}

/**
 * Signs someone in without a password — the one moment that has to (v3.2): right
 * after `/verify` proves an address by consuming its verification token,
 * making that person type the password they *just chose* a second time would be pure
 * friction with no security gained. `signIn('credentials', ...)` cannot be used here —
 * it needs the plaintext password, and by this point only its scrypt hash exists (it was
 * hashed at registration, in `register()`) — so this mints the exact cookie NextAuth's
 * own JWT strategy would have written, by calling the same `encode` it calls internally.
 *
 * `salt` has to be the cookie's own name, not a fixed string: that is how `@auth/core`
 * derives its encryption key (`lib/actions/session.js`, `salt = options.cookies
 * .sessionToken.name`), so a mismatched salt here would not fail loudly — it would write
 * a cookie `auth()` decodes into nothing, and the only symptom is `/verify`'s own
 * `redirect('/')` bouncing straight back to `/login` through the middleware. The
 * `NODE_ENV` check has to mirror `writeAccountCookie`'s (`lib/accounts/current.ts`) for
 * the same reason: `secure`/name and the `__Secure-` prefix must agree, or the browser
 * either drops the cookie (secure over http) or stores it under the plain name while
 * `auth()` looks for the prefixed one.
 *
 * The payload carries only what this app's `auth()` ever reads back out: `session.user
 * .email` comes from `token.email`, and there is no custom `jwt` callback in this project
 * that would need anything more (see `auth.ts`'s own comment on why the role is
 * deliberately left out of the token). `maxAge` is imported from `authConfig` rather than
 * repeated as a number, so the two can never drift apart.
 */
export async function issueSessionCookie(email: string): Promise<void> {
  const normalized = normalizeEmail(email)
  const secure = process.env.NODE_ENV === 'production'
  const cookieName = secure ? '__Secure-authjs.session-token' : 'authjs.session-token'

  const token = await encode({
    salt: cookieName,
    secret: process.env.AUTH_SECRET ?? '',
    maxAge: authConfig.session.maxAge,
    token: { email: normalized, sub: normalized, name: normalized },
  })

  const jar = await cookies()
  jar.set(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: authConfig.session.maxAge,
  })
}
