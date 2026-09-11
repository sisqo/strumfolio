'use server'

/**
 * Reads about accounts as a whole, for the two screens that show more than the reader's
 * own — `/accounts`'s search and `/accounts/[email]`'s detail (v3.8),
 * both restricted to global owners now that nobody else has more than one account to see
 * — and for `listAllAccounts`, called directly from the client (`HomeScreen`'s copy-target
 * list), which is why this needs the directive: without it, that call could not cross the
 * server/client boundary as a server action.
 */

import { cache } from 'react'

import { asc, eq, inArray } from 'drizzle-orm'

import { auth } from '@/auth'
import { isOwner, normalizeEmail } from '@/lib/allowlist'
import { listSignIns } from '@/lib/auth/signIns'
import { db, hasDatabase } from '@/lib/db/client'
import { accountIdOf } from '@/lib/db/ids'
import { accounts, pendingRegistrations, rateLimitHits, songbooks, songs } from '@/lib/db/schema'
import { liveSubscription, planStateFor, resolveSubscription } from '@/lib/plans/entitlements'
import { PLAN_COLUMNS, storedPlanFrom } from './planColumns'
import type { PlanRow } from './planColumns'
import type { Plan, PlanStatus } from '@/lib/plans/types'

export interface AccountSummary {
  ownerEmail: string
  createdAt: string
  signInCount: number
  lastSignInAt: string | null
}

/**
 * Every account in the installation — a **global owner** question, deliberately checked
 * with `isOwner` directly rather than `asAdmin()`. An account's own owner also resolves
 * to `admin` on that one account (see `lib/roles.ts`'s own comment on why), and this is
 * the one place that distinction has to hold: `asAdmin()` would let every account's owner
 * see every other account in the installation, which "admin of your own account" was
 * never meant to grant.
 */
export async function listAllAccounts(): Promise<AccountSummary[] | null> {
  if (!hasDatabase) return null

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) return null

  try {
    /*
     * The two columns this maps and no more, rather than `select()`: a star-expanded
     * select names every column drizzle's schema knows, which makes it the one shape of
     * read that a migration applied *after* the deploy breaks — and this one fails all
     * the way to an empty `/accounts` screen, because the catch below answers null. Same
     * idiom and same reasoning as `storedPlanOf` in `lib/plans/resolve.ts`.
     */
    const rows = await db()
      .select({ ownerEmail: accounts.ownerEmail, createdAt: accounts.createdAt })
      .from(accounts)
      .orderBy(asc(accounts.ownerEmail))
    const signIns = await listSignIns()

    return rows.map((row) => {
      const stats = signIns?.get(row.ownerEmail) ?? null
      return {
        ownerEmail: row.ownerEmail,
        createdAt: row.createdAt.toISOString(),
        signInCount: stats?.signInCount ?? 0,
        lastSignInAt: stats?.lastSignInAt ?? null,
      }
    })
  } catch (error) {
    console.error('listAllAccounts failed', error)
    return null
  }
}

/**
 * What the plan panel on `/accounts` prints for one account: both stored sides, the audit, and
 * which side is in force — never an `Entitlements`.
 *
 * That exclusion is structural and deliberate. `frozen` and the six `refused` reasons are
 * functions of the repertoire counts, which this list does not have and will not fetch (two
 * `count()` queries per row, for every account in the installation). Fed zeros they come back
 * permissive — `frozen: false`, nothing refused — which is a correct-looking lie on the one
 * screen an operator trusts. Carrying only what `planStateFor` answers makes rendering that
 * lie impossible rather than merely discouraged.
 *
 * Every date is a `YYYY-MM-DD` day string, and the fields are named `*On` rather than `*At` to
 * say so — a deliberate contrast with `AccountSummary.createdAt`/`lastSignInAt`, which are full
 * ISO instants. Strings because this file is `'use server'`, so anything here can cross to the
 * client, and the day slice because it is also exactly what an `<input type="date">` wants
 * back: the panel refills its own field from `grantedUntilOn`. The cost, stated so nobody is
 * surprised by it: a gift given and withdrawn on the same day reads as the same day, with no
 * way to tell which came first. Acceptable in an audit opened a handful of times a year.
 *
 * `paddleCustomerId`/`paddleSubscriptionId` are deliberately absent, and not for tidiness:
 * there is no Paddle integration yet, so a field for them would be a stub with nothing to put
 * in it. `gclid` is absent because it is marketing data that nothing in this feature may read.
 */
export interface AccountPlanLine {
  /**
   * `accounts.plan`, resolved through `resolveSubscription` — what was bought, still
   * reported once it has lapsed, and already the *new* plan once a scheduled downgrade's
   * date has passed. Never the raw column: this is the row an operator has to trust.
   */
  plan: Plan
  status: PlanStatus
  /** null means never: what `free` and `lifetime` both carry. */
  planExpiresOn: string | null
  /**
   * A downgrade or cancellation (`'free'`) scheduled to take over on `planExpiresOn`. Null
   * both when nothing is scheduled and once a scheduled change has already taken effect —
   * `resolveSubscription` clears it the moment it resolves, so this is never stale.
   */
  pendingPlan: Plan | null
  /** null means no gift at all — the one field `liveGrant` keys on. */
  grantedPlan: Plan | null
  /** null means a gift with no end. Doubles as the date field's value, which is why it round-trips. */
  grantedUntilOn: string | null
  /**
   * Who last decided about the gift and when — the giving *or* the taking away, since
   * `setGrant` writes both on either path. So these two can be set while `grantedPlan` is
   * null, which is precisely a withdrawn gift and is rendered as one.
   */
  grantedBy: string | null
  grantedOn: string | null
  grantedNote: string | null
  /** True when a gift exists but its own date has passed: the panel must not call that "no end". */
  grantEnded: boolean
  /** From `planStateFor` at read time — never re-derived on the client. */
  effectivePlan: Plan
  source: 'subscription' | 'grant' | 'none'
  /**
   * The live subscription **alone**, gift ignored — null when nothing paid is running. From
   * `liveSubscription` at read time, for the same reason `effectivePlan` is server-computed:
   * whether a subscription is still live is a date rule this file owns, and the client must not
   * re-derive it.
   *
   * `GiftForm` is the reader. A gift only ever does something when it *outranks* this
   * (`planStateFor` gives a rank tie to the subscription), so this is what lets the form say
   * "this gift will change nothing yet" before an operator wonders whether the save worked.
   */
  subscriptionPlan: Plan | null
  /** The winning side's own column, never the later of the two. */
  untilOn: string | null
  /**
   * Whether this account has completed the mandatory plan-choice step (v3.7) —
   * `accounts.planChosenAt !== null`, read directly rather than through any pending-aware
   * resolver, because there is nothing to resolve: a column that was ever written stays
   * written, with no expiry and no scheduled change. This field exists on `AccountPlanLine`
   * specifically, never inferred from the row simply being present in the map: a row this
   * query could not read at all is absorbed a level up, as "unknown for this account", which
   * must never be shown as "not activated" — the two null cases mean opposite things on the
   * one screen whose whole purpose is to be believed.
   */
  planChosen: boolean
  /**
   * Whether `accounts.plan` was ever set away from `'free'` — read from the **raw** column,
   * before `resolveSubscription` runs, because that resolution is precisely what makes
   * `plan` above indistinguishable from "never subscribed" for an account whose
   * cancellation has since lapsed: `resolveSubscription` collapses `plan` itself to
   * `pendingPlan` (`'free'`) once a scheduled downgrade's date passes, with nothing in the
   * database ever rewriting the raw column back (`checkout.ts`'s cancel path leaves
   * `plan`/`planStatus`/`planExpiresAt` untouched on purpose, and there is no cron). A
   * plain, uncancelled lapse does not hit this: `resolveSubscription` only rewrites `plan`
   * when `status` is still `'active'`, so an actually-`'expired'` row keeps its paid name on
   * `plan` above and needs no separate flag. This is the one field on this type that is
   * **not** resolved — see `ForceExpireRow`, the one screen that needs "did this account
   * ever hold a subscription" answered independently of whether one is live right now.
   */
  everSubscribed: boolean
}

/** A timestamp as the day it falls on, in UTC — see `AccountPlanLine` on why days and not instants. */
function dayOf(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10)
}

/**
 * The plan side of every account, keyed by address for `/accounts` to look up per row.
 *
 * A **sibling** of `listAllAccounts` rather than nine more columns on its projection, and the
 * reason is the `catch` a few lines above this one: that function answers `null` on a failed
 * query and the page renders it as «Could not read the accounts», i.e. the whole screen gone.
 * Migration 0024 is not applied yet, so a deploy that lands before it makes that the live
 * behaviour — and the screen that has lost itself is the one an operator would open to find
 * out why. Split in two, an unapplied 0024 costs the plan clause and the `Plan` button and
 * nothing else; the list of accounts, which is the question that must stay answerable, still
 * answers. This is the third read on this screen to work that way: `listSignIns`' null is
 * already absorbed per row as «unknown for everyone».
 *
 * An explicit projection, never `select()`, for the reason `listAllAccounts` states — but
 * note the difference in what that buys here. An explicit projection protects against the
 * columns you do *not* name and can never protect against the ones you do, and this query
 * names 0024's columns, and now 0026's, on purpose. It is behind those migrations by
 * construction; the null is how that is survived, not avoided.
 *
 * Gated with `isOwner` directly and not `asAdmin()`: an account's own owner resolves to
 * `admin` on that one account, which would hand every customer the plan of every other.
 * Same distinction, same reason, as `listAllAccounts` and `deleteAccount`.
 */
/**
 * Resolves one row's worth of `PLAN_COLUMNS` into the `AccountPlanLine` a screen renders —
 * pulled out of `listAccountPlans`'s own `.map()` so `getAccountDetail` can resolve a single
 * row the exact same way instead of re-deriving the rule (v3.8).
 *
 * The `StoredPlan` mapping it used to hold inline now lives in `planColumns.ts` beside the
 * column set, so `/leads`' rollup can reach it — a plain sibling and not this file, because
 * this one is `'use server'` and may export only async functions. That failure appears at
 * `next build` and never at `tsc --noEmit`.
 */
function planLineFrom(row: PlanRow, now: Date): AccountPlanLine {
  const stored = storedPlanFrom(row)
  const state = planStateFor(stored, now)
  // The raw subscription columns resolved for display, the same rule the gate itself reads
  // through `liveSubscription`/`planStateFor` — never `stored.plan`/`.status`/`.expiresAt`
  // directly, which would still name the pre-change plan and a past date once a scheduled
  // downgrade has actually taken effect.
  const resolved = resolveSubscription(stored, now)

  return {
    plan: resolved.plan,
    status: resolved.status,
    planExpiresOn: dayOf(resolved.expiresAt),
    pendingPlan: resolved.pendingPlan,
    grantedPlan: stored.grantedPlan,
    grantedUntilOn: dayOf(stored.grantedUntil),
    grantedBy: row.grantedBy,
    grantedOn: dayOf(row.grantedAt),
    grantedNote: row.grantedNote,
    grantEnded:
      stored.grantedPlan !== null && stored.grantedUntil !== null && stored.grantedUntil.getTime() <= now.getTime(),
    effectivePlan: state.effectivePlan,
    source: state.source,
    subscriptionPlan: liveSubscription(stored, now),
    untilOn: dayOf(state.until),
    planChosen: row.planChosenAt !== null,
    everSubscribed: stored.plan !== 'free',
  }
}

export async function listAccountPlans(): Promise<Map<string, AccountPlanLine> | null> {
  if (!hasDatabase) return null

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) return null

  try {
    const rows = await db()
      .select({ ownerEmail: accounts.ownerEmail, ...PLAN_COLUMNS })
      .from(accounts)
      .orderBy(asc(accounts.ownerEmail))

    /*
     * One clock for the whole list, read before the loop. Two rows resolved at two instants
     * can disagree across an expiry boundary, and a list that is internally inconsistent is
     * unexplainable to the person reading it. One of the three clock reads `entitlements.ts`'
     * header names as the edges of this feature — the pure core stays clock-free either way,
     * because `planStateFor` takes `now` as an argument.
     */
    const now = new Date()

    return new Map(rows.map((row) => [row.ownerEmail, planLineFrom(row, now)] as const))
  } catch (error) {
    console.error('listAccountPlans failed', error)
    return null
  }
}

/** Everything `/accounts/[email]` shows about one account — `AccountSummary`'s three facts plus its resolved `AccountPlanLine`, in one row. */
export interface AccountDetail {
  ownerEmail: string
  createdAt: string
  signInCount: number
  lastSignInAt: string | null
  /**
   * Null when the account has none yet — every account predating the name columns,
   * and any created since whose owner has not signed in with Google or visited
   * `/profile`. The list at `/accounts` does not show either column (deliberately out
   * of scope there); only this detail page does.
   */
  firstName: string | null
  lastName: string | null
  /**
   * Null when the plan columns can't be read — an unapplied migration, the same failure
   * `listAccountPlans()` absorbs for the list, never a missing account: that case is `null`
   * on the whole function instead, and the page answers `notFound()` for it.
   */
  plan: AccountPlanLine | null
  /**
   * Null only when the two `0036` columns can't be read at all (an unapplied migration)
   * — the same "wrap the whole group, not just the value" shape `plan` uses just above,
   * so a genuinely unsuspended account (`suspendedAt: null` inside a present object) can
   * never be confused with "couldn't tell" (this field itself null). The page hides the
   * suspend/reactivate control entirely on the outer null, rather than guess.
   */
  admin: { suspendedAt: string | null; internalNote: string | null } | null
}

/**
 * One account's full detail row, for `/accounts/[email]` — a single-row read, not
 * `listAllAccounts()`/`listAccountPlans()` filtered down to one entry afterwards. The list
 * pays for every account in the installation because it has to show every one of them; a page
 * about exactly one account has no reason to pay that cost too (v3.8).
 *
 * Two queries, not one combined `select`, for the same reason `listAllAccounts` and
 * `listAccountPlans` are two functions rather than one wider read: the base row
 * (`ownerEmail`/`createdAt`) exists on every migration this app has ever shipped, while the
 * plan columns do not. A page that named both in one query would go down with the plan
 * columns the moment they are not there yet, instead of showing the account with its plan
 * clause simply missing — a strictly worse version of what `AccountsPage` already avoids.
 *
 * Returns `null` when the caller is not a global owner, or when no account exists for this
 * address — `notFound()` in the page renders the two identically, the same "does not exist and
 * is not yours look the same from outside" rule `AccountsPage` itself already follows.
 */
export async function getAccountDetail(ownerEmail: string): Promise<AccountDetail | null> {
  if (!hasDatabase) return null

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) return null

  const target = normalizeEmail(ownerEmail)

  const base = await db()
    .select({ ownerEmail: accounts.ownerEmail, createdAt: accounts.createdAt })
    .from(accounts)
    .where(eq(accounts.ownerEmail, target))
    .limit(1)

  const row = base[0]
  if (row === undefined) return null

  const signIns = await listSignIns()
  const stats = signIns?.get(row.ownerEmail) ?? null

  // Same defensive shape as the plan columns just below, and the same reason: named
  // explicitly because migration 0034 added them, so a deploy that lands before that
  // migration runs must still show the rest of this page rather than go down with it.
  let name: { firstName: string | null; lastName: string | null } = { firstName: null, lastName: null }
  try {
    const nameRows = await db()
      .select({ firstName: accounts.firstName, lastName: accounts.lastName })
      .from(accounts)
      .where(eq(accounts.ownerEmail, target))
      .limit(1)
    const nameRow = nameRows[0]
    if (nameRow !== undefined) name = nameRow
  } catch (error) {
    console.error('getAccountDetail (name columns) failed', error)
  }

  let plan: AccountPlanLine | null = null
  try {
    const planRows = await db()
      .select(PLAN_COLUMNS)
      .from(accounts)
      .where(eq(accounts.ownerEmail, target))
      .limit(1)
    const planRow = planRows[0]
    if (planRow !== undefined) plan = planLineFrom(planRow, new Date())
  } catch (error) {
    console.error('getAccountDetail (plan columns) failed', error)
  }

  // Same defensive shape as `name`/`plan` just above, and the same reason: migration
  // 0036 added these two, so a deploy that lands before it runs must still show the
  // rest of this page rather than go down with it.
  let admin: { suspendedAt: string | null; internalNote: string | null } | null = null
  try {
    const adminRows = await db()
      .select({ suspendedAt: accounts.suspendedAt, internalNote: accounts.internalNote })
      .from(accounts)
      .where(eq(accounts.ownerEmail, target))
      .limit(1)
    const adminRow = adminRows[0]
    if (adminRow !== undefined) {
      admin = { suspendedAt: adminRow.suspendedAt?.toISOString() ?? null, internalNote: adminRow.internalNote }
    }
  } catch (error) {
    console.error('getAccountDetail (admin columns) failed', error)
  }

  return {
    ownerEmail: row.ownerEmail,
    createdAt: row.createdAt.toISOString(),
    signInCount: stats?.signInCount ?? 0,
    lastSignInAt: stats?.lastSignInAt ?? null,
    firstName: name.firstName,
    lastName: name.lastName,
    plan,
    admin,
  }
}

/**
 * Whether this address is currently suspended — a system check run on **every** sign-in
 * attempt (`auth.ts`'s `signIn` callback), not an admin action with a target an operator
 * chose, so it deliberately takes no `isOwner` gate of its own
 * (Assunzioni). False on no database, no row, or a read that
 * failed — the same fail-open direction every other read in this schema takes when it
 * cannot answer: an unreadable suspension must never lock someone out who was never
 * suspended.
 */
/**
 * Whether an account row still exists for this address.
 *
 * **The question nothing on the request path used to ask.** The session cookie is a ninety-day
 * JWT and `currentUser` derives everything from it plus `ALLOWED_EMAILS` and normalization —
 * all pure, no database — so `roleOf` answered `admin` for a reader looking at the account named
 * by their own email whether or not that account existed. Deleting somebody's account removed
 * their rows and left their browser signed in, for up to ninety days, with every write still
 * permitted. `deleteMyAccount` calls `signOut` and so never showed it; `deleteAccount`, which is
 * an operator removing *somebody else's* account, cannot reach that browser at all.
 *
 * **Fails open, deliberately, in both directions.** No database configured is the normal local
 * way to work and must not lock anybody out; a database that cannot be read is a blip, and
 * answering "gone" would sign out every reader of the app at once — far worse than a deleted
 * account surviving a few more minutes. Same direction as `isAccountSuspended` below, and the
 * same reasoning `verifyTurnstile` gives for its own missing-key case.
 *
 * `cache` from React, so the several `currentUser()` calls a single request makes — the home
 * layout alone asks twice, once to render and once for its metadata — cost one query between
 * them. It is per-request memoization, not a cache with a lifetime: nothing survives the
 * response, so a deletion takes effect on the very next request.
 */
export const accountExists = cache(async (ownerEmail: string): Promise<boolean> => {
  if (!hasDatabase) return true

  try {
    const rows = await db()
      .select({ ownerEmail: accounts.ownerEmail })
      .from(accounts)
      .where(eq(accounts.ownerEmail, normalizeEmail(ownerEmail)))
      .limit(1)
    return rows.length > 0
  } catch (error) {
    console.error('accountExists failed', error)
    return true
  }
})

export async function isAccountSuspended(email: string): Promise<boolean> {
  if (!hasDatabase) return false

  try {
    const rows = await db()
      .select({ suspendedAt: accounts.suspendedAt })
      .from(accounts)
      .where(eq(accounts.ownerEmail, normalizeEmail(email)))
      .limit(1)
    return rows[0]?.suspendedAt !== null && rows[0]?.suspendedAt !== undefined
  } catch (error) {
    console.error('isAccountSuspended failed', error)
    return false
  }
}

export interface UsageSummary {
  songbookCount: number
  songCount: number
  singAlongPeakDevices: number
}

/**
 * Songbook count, song count and Strum Together peak followers for one account — the
 * Usage & content fieldset on `/accounts/[email]`.
 * `isOwner`-gated inside, same reason as every other function here that takes an
 * explicit `ownerEmail`. Null on refusal or a failed read — the caller shows "data
 * unavailable" for this one fieldset rather than losing the rest of the page over it,
 * the same resilience `getAccountDetail`'s own defensive columns already practice.
 */
export async function usageSummaryFor(ownerEmail: string): Promise<UsageSummary | null> {
  if (!hasDatabase) return null

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) return null

  const target = normalizeEmail(ownerEmail)

  try {
    const songbookRows = await db()
      .select({ id: songbooks.id })
      .from(songbooks)
      .where(eq(songbooks.accountId, accountIdOf(target)))
    const ids = songbookRows.map((row) => row.id)

    const songCount =
      ids.length === 0
        ? 0
        : (await db().select({ id: songs.id }).from(songs).where(inArray(songs.songbookId, ids))).length

    const peakRows = await db()
      .select({ singAlongPeakDevices: accounts.singAlongPeakDevices })
      .from(accounts)
      .where(eq(accounts.ownerEmail, target))
      .limit(1)

    return {
      songbookCount: ids.length,
      songCount,
      singAlongPeakDevices: peakRows[0]?.singAlongPeakDevices ?? 0,
    }
  } catch (error) {
    console.error('usageSummaryFor failed', error)
    return null
  }
}

export interface PendingRegistrationSummary {
  email: string
  firstName: string | null
  lastName: string | null
  createdAt: string
  expiresAt: string
  /** Past `expiresAt` — shown as a badge, never filtered out: "Confirm now" bypasses this check anyway. */
  expired: boolean
}

/**
 * Every pending, unverified registration — the "Pending registrations" subsection atop
 * `/accounts`, there precisely so an operator can find
 * a stuck signup without already knowing its address. `isOwner`-gated, same reason as
 * every other whole-installation read on this page.
 */
export async function listPendingRegistrations(): Promise<PendingRegistrationSummary[] | null> {
  if (!hasDatabase) return null

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) return null

  try {
    const now = new Date()
    const rows = await db()
      .select({
        email: pendingRegistrations.email,
        firstName: pendingRegistrations.firstName,
        lastName: pendingRegistrations.lastName,
        createdAt: pendingRegistrations.createdAt,
        expiresAt: pendingRegistrations.expiresAt,
      })
      .from(pendingRegistrations)
      .orderBy(asc(pendingRegistrations.createdAt))

    return rows.map((row) => ({
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      expired: row.expiresAt.getTime() <= now.getTime(),
    }))
  } catch (error) {
    console.error('listPendingRegistrations failed', error)
    return null
  }
}

/**
 * How long a rate-limit window stays open, as every caller of `checkRateLimit` sets it —
 * login (`auth.ts`), registration, password recovery and feedback all pass ten minutes.
 *
 * A copy of that figure rather than a shared constant, and deliberately: this one is
 * **display-only**. `rateLimitHits` rows outlive their window by up to a day (`purgeStaleHits`),
 * so telling an operator whether an account is throttled *right now* means comparing against
 * some window, and getting that number wrong here mislabels one stat on one screen — it can
 * never change whether a request goes through, which is the only place the real figures live.
 */
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000

/** The Rate limit cell on `/accounts/[email]`'s Security tab. */
export interface RateLimitStatus {
  /**
   * The highest count standing on any of this address's four email-keyed buckets whose window
   * is still open — 0 when nothing is throttling it. The maximum and not the sum: the four are
   * independent limits on four different actions, and adding them would invent a number that
   * no limit is ever compared against.
   */
  attempts: number
}

/**
 * Whether anything is currently throttling this address — the Rate limit cell on
 * `/accounts/[email]`'s Security tab, beside the button that clears it.
 *
 * Reads exactly the four keys `clearRateLimitFor` (`auth/actions.ts`) deletes, and for the
 * same reason it deletes only those: the by-IP buckets belong to a machine, not to an
 * account, and an operator acting on one address must not be shown — or offered the
 * clearing of — a counter that some unrelated visitor filled.
 *
 * Read-only, unlike `checkRateLimit`, which counts the request that asks. A page that
 * *displayed* a rate limit by consuming one of its own attempts would throttle the account
 * it is reporting on.
 *
 * `isOwner`-gated inside, same as every other function here that takes an explicit
 * `ownerEmail`. Null on refusal or a failed read, and the caller renders that as «—», never
 * as «Not hit»: "nothing is throttling this address" and "this could not be read" are
 * opposite answers, and the second must never be printed as the first on the one screen
 * built to be believed — the same rule `AccountDetail.admin` and `planChosen` each state.
 */
export async function rateLimitStatusFor(ownerEmail: string): Promise<RateLimitStatus | null> {
  if (!hasDatabase) return null

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) return null

  const address = normalizeEmail(ownerEmail)

  try {
    const rows = await db()
      .select({ windowStart: rateLimitHits.windowStart, count: rateLimitHits.count })
      .from(rateLimitHits)
      .where(
        inArray(rateLimitHits.key, [
          `login:email:${address}`,
          `register:email:${address}`,
          `reset:email:${address}`,
          `feedback:${address}`,
        ]),
      )

    const openedAfter = Date.now() - RATE_LIMIT_WINDOW_MS
    const live = rows.filter((row) => row.windowStart.getTime() > openedAfter).map((row) => row.count)

    return { attempts: live.length === 0 ? 0 : Math.max(...live) }
  } catch (error) {
    console.error('rateLimitStatusFor failed', error)
    return null
  }
}
