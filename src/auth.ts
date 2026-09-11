import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'

import { authConfig } from './auth.config'
import { normalizeEmail } from './lib/allowlist'
import { provisionAccount } from './lib/accounts/provision'
import { freezeLeadAttribution, recordLeadAttribution } from './lib/attribution/write'
import { isAccountSuspended } from './lib/accounts/read'
import { readPasswordHash } from './lib/auth/credentials'
import { splitName } from './lib/auth/nameSplit'
import { verifyAgainstNothing, verifyPassword } from './lib/auth/password'
import { recordSignIn } from './lib/auth/signIns'
import { attachCouponViewFromCookie } from './lib/coupons/views'
import { sendEmail } from './lib/email/send'
import { welcomeEmail } from './lib/email/templates'
import { checkRateLimit, requestIp } from './lib/rateLimit'
import { notifyTelegram } from './lib/telegram/notify'
import { registrationNotice } from './lib/telegram/registrationNotice'

const LOGIN_RATE_LIMIT = 10
const LOGIN_RATE_WINDOW_MS = 10 * 60 * 1000

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google,

    /**
     * Email and password, for whoever would rather not hand Google another sign-in — or
     * whose address is not a Google account at all.
     *
     * A password proves *which address you are*, and grants nothing: the same `roleOf` that
     * answers for Google answers here, and it does not know this table exists. A `credentials`
     * row only ever exists for an address that has already been through email verification
     * (v3.2) — set at registration, or by a global owner from Accounts — so a correct password
     * against it is, on its own, enough to sign in: there is nothing left to ask permission from.
     *
     * Everything that can fail returns the same null. No password set, or a wrong one typed —
     * the caller is told "wrong email or password" and nothing more, because otherwise this
     * form would answer the question "does this person have an account here", which no login
     * page should answer. `verifyAgainstNothing` is what stops the *timing* from answering it
     * either.
     */
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const email = typeof raw?.email === 'string' ? normalizeEmail(raw.email) : ''
        const password = typeof raw?.password === 'string' ? raw.password : ''
        if (email === '' || password === '') return null

        /*
         * Same table as registration and password recovery — a
         * credential-stuffing run tries many passwords against one address, or one
         * password against many addresses, so both keys are checked regardless of
         * which one a given attempt would trip.
         */
        const ip = await requestIp()
        const ipAllowed = ip === null || (await checkRateLimit(`login:ip:${ip}`, LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_MS))
        const emailAllowed = await checkRateLimit(`login:email:${email}`, LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_MS)
        if (!ipAllowed || !emailAllowed) return null

        const stored = await readPasswordHash(email)
        if (stored === null) {
          await verifyAgainstNothing(password)
          return null
        }

        if (!(await verifyPassword(password, stored))) return null

        return { id: email, email }
      },
    }),
  ],
  callbacks: {
    /**
     * The only place a new session can be created.
     *
     * With registration open to anyone (v3.2), there is no longer a question of *whether*
     * this address may come in — a successful Google sign-in, or a password that matched an
     * existing `credentials` row, has already answered that. What is left is one extra check,
     * not a gate: for Google, `profile.email_verified` must be exactly `true`, since Google
     * only guarantees the address when it says so — a misconfigured OAuth provider must not
     * be able to hand out an address Google itself will not vouch for. The password path
     * carries no such flag to check, because a `credentials` row only exists for an address
     * that already went through email verification once, at registration (v3.2).
     *
     * The role itself is deliberately not put in the token. A session lasts ninety days;
     * a role baked into it would keep its powers for ninety days after being taken away.
     *
     * `recordSignIn` and `provisionAccount` run after that check, not before: a rejected
     * attempt proved nothing trustworthy about the address asking, so it leaves no mark and
     * gets no account. Both run here rather than from a `jwt`/`session` callback because those
     * fire on every request a session is read on this token's ninety days, not only when
     * one is created — this callback is the one place that happens only once per actual
     * sign-in. `provisionAccount` is idempotent on top of that, by checking existence
     * rather than trusting "only once" alone — see its own comment.
     */
    async signIn({ account, profile, user }) {
      const raw = profile?.email ?? user?.email
      if (raw === null || raw === undefined) return false

      if (account?.provider === 'google' && profile?.email_verified !== true) return false

      /*
       * Normalized here rather than trusted from the provider: `authorize` above already
       * normalizes before it ever reaches this callback, but Google's `profile.email`
       * never has, and `roleOf` only normalizes for its own comparison, not for whoever
       * reads its answer next. Writing the raw casing would key `sign_ins`/`accounts` on
       * whichever form happened to arrive first, splitting one person's history across
       * two rows — see `signIns`' own comment on why it must agree with
       * `accounts`/`ALLOWED_EMAILS`.
       */
      const email = normalizeEmail(raw)

      /*
       * A suspended account gets no new session at all — checked before
       * `recordSignIn`, the same early-return shape as the
       * `email_verified` check above it, so a blocked attempt leaves no sign-in count
       * behind either. Blocks only the *next* sign-in: a session already issued keeps
       * working until it naturally expires, since JWTs are not revocable server-side by
       * design in this app (`lib/auth/session.ts`).
       */
      if (await isAccountSuspended(email)) return false

      await recordSignIn(email)

      /*
       * A name is only ever known here for Google: the
       * credentials path has none to offer — its own account is created earlier, by
       * `verifyEmail`, with the name captured at registration — so `provisionAccount`
       * gets `undefined` and this is a plain no-op on that branch, existing account or
       * not. `given_name`/`family_name` are the ordinary case; the split on `name` only
       * runs when Google's profile omits them, which is rare but not impossible.
       */
      const googleName =
        account?.provider === 'google'
          ? profile?.given_name != null && profile?.family_name != null
            ? { firstName: profile.given_name, lastName: profile.family_name }
            : splitName(profile?.name)
          : undefined

      /*
       * No newsletter opt-in is passed here, on purpose, since 2026-09-03. Google sign-ups
       * used to be subscribed by default, and that was reversed: the OAuth flow has no
       * step in which a person can *ask* for a
       * newsletter, and consent to marketing email has to be an affirmative act — the
       * Privacy Policy names consent as the legal basis, and a default is not one. A Google
       * reader who wants it turns it on in the settings (`NewsletterPrefs`). The credentials
       * branch never carried a value here either: that account already exists by the time
       * this callback runs (`verifyEmail` created it, opt-in included — see
       * `provisionAccount`'s own comment on `newsletterOptIn`).
       */

      // The returned boolean says whether this call is the one that created the account
      // (v3.2): true only the first time this address ever signs in
      // successfully, false on every later sign-in that finds the row already there —
      // exactly when, and only when, the welcome email belongs.
      const created = await provisionAccount(email, googleName)
      if (created) {
        await sendEmail({ to: email, ...welcomeEmail() })
        await notifyTelegram('registration', registrationNotice(email, googleName))
      }

      /*
       * The coupon this browser was already carrying, attached to the account that has just
       * been admitted — the funnel `coupon_views` exists for, since the ordinary way a coupon
       * is seen is an advertisement clicked by somebody signed out. The cookie survives a
       * sign-in, so this is the first moment there is an account for it to be about.
       *
       * After `provisionAccount`, never before: on a first sign-in the row it writes is what
       * `accountIdOf` inside `recordCouponView` resolves to, and a view recorded a statement
       * earlier would find no account and be refused by a NOT NULL. Written against `email`,
       * the address signing in, and not through `currentUser` — the account cookie left over
       * from a previous session has no bearing on whose sighting this is.
       *
       * Its own failures are swallowed and logged (see `attachCouponViewFromCookie`), the
       * standing rule for everything after the `email_verified` check: a sign-in must still
       * succeed if bookkeeping trips.
       */
      await attachCouponViewFromCookie(email)

      /*
       * Seam 4 of four: the Google path, which has no pending registration behind it at all, so
       * this is both halves at once — record what the browser was carrying, then point it at the
       * account and freeze it.
       *
       * **Gated on `created`**, the same boolean the welcome email above is gated on: attribution
       * is about acquisition, so it is written on the one sign-in that creates an account and on
       * no later one. Sharper than `attachCouponViewFromCookie`'s unconditional upsert directly
       * above, and deliberately so — a coupon sighting is a fact about a visit, a provenance is a
       * fact about an arrival that happened once.
       *
       * `recordLeadAttribution` before `freezeLeadAttribution`, because the second attaches what
       * the first writes: for a Google sign-up there is no row yet, and for a lead who once
       * registered and never verified there is an open one, which this pair refines and then
       * takes over rather than duplicating.
       */
      if (created) {
        await recordLeadAttribution(email)
        await freezeLeadAttribution(email)
      }

      return true
    },
  },
})
