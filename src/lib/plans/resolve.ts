/**
 * The half of the entitlement question that touches the world: which plan an account is on,
 * how much it is holding, and what time it is.
 *
 * Split from `entitlements.ts` exactly the way `currentUser` is split from `roleOf` — one
 * pure function that decides, one async function that fetches. Everything that cannot be
 * unit-tested lives here and nothing else does: on the **gate** path this is the only file
 * that reads `process.env`, the only one that queries and the only `new Date()`.
 * `/accounts` reads the same columns for its own screen (`accounts/read.ts`) and has its own
 * clock for the same reason this one does — the pure core is what stays clock-free, not the
 * count of edges; see `entitlements.ts`' header.
 *
 * Every failure returns `UNGATED`, and that direction is deliberate. It matches
 * `checkRateLimit` (`rateLimit.ts`), which fails open on a thrown query, and
 * `verifyTurnstile`'s missing-key branch (`captcha.ts`) — nothing configured, nothing
 * blocks. The two costs are not comparable: falling open lets one account briefly hold more
 * than it paid for, while falling shut turns one unreadable row into "nobody can save a
 * song", an outage on the single action this app exists for, for a musician who is probably
 * on stage. The half-applied migration is the concrete case — the plan columns not there
 * yet while the code that reads them already is — and it must degrade to today's behaviour
 * rather than to a frozen installation.
 */

import { count, eq } from 'drizzle-orm'

import { db, hasDatabase } from '@/lib/db/client'
import { accounts, songbooks, songs } from '@/lib/db/schema'

import { UNGATED, entitlementsFor, liveSubscription, planStateFor } from './entitlements'
import type { Entitlements, StoredPlan } from './entitlements'
import { readPendingCycle } from './prices'
import { PLANS, readPendingPlan, readPlan, readPlanStatus } from './types'
import type { Plan, RepertoireCounts } from './types'

/**
 * `StoredPlan`'s pending fields for the `SONGBOOK_FORCE_PLAN` override below — always
 * `null, null`: forcing a plan means "pretend the account has exactly and only this", which
 * a scheduled change would contradict.
 */
const NOTHING_PENDING = { pendingPlan: null, pendingCycle: null } as const

/**
 * Whether the plans are enforced at all in this deployment.
 *
 * A function here rather than a bare `process.env.SONGBOOK_PLANS !== 'on'` at the one place
 * outside this file that has to say so — the `/accounts` notice, since a gift can be handed
 * out before the switch is ever flipped. This file's header claims to be the only place in
 * the feature that reads `process.env`, and a second reader is exactly how a screen comes to
 * tell an operator that nothing is enforced while the resolver is enforcing, or the reverse,
 * over a typo in one of the two spellings of the variable name.
 *
 * Not async, and that is why it lives here rather than beside the screen's other reads in
 * `accounts/read.ts`: that file carries `'use server'`, where every export must be an async
 * function.
 *
 * Absent, or anything other than `on`, means off — the repo's existing shape for a
 * configuration flag (`captcha.ts`, `rateLimit.ts`): nothing configured, nothing blocks.
 *
 * **Two sentences on two public pages come out the day this is switched on**, and neither is
 * reachable from here by any compiler: `NO_CHECKOUT` in `app/pricing/page.tsx` («no account is
 * being held to the limits below until it opens») and the matching qualifier in /login's "Is
 * Strumfolio free to use?" answer. Both say that the limits listed beside them are not being
 * enforced, which is true only while this returns false. They are named together because the
 * failure to avoid is not a stale sentence but a disagreement: /pricing hedging while /login
 * states the caps as facts leaves a reader with five songbooks unable to tell which of the two
 * public pages is lying to them about their own account.
 */
export function plansEnforced(): boolean {
  return process.env.SONGBOOK_PLANS === 'on'
}

/**
 * Whether the mock checkout (`lib/plans/checkout.ts`, `/checkout`) is live — a stand-in for
 * Paddle that writes real `plan`/`planStatus`/`planExpiresAt` rows so the entitlement gates,
 * the account menu's plan badge and the freeze path can all be exercised for real before
 * there is an actual payment processor behind any of it. Same shape as `plansEnforced` and
 * for the same reason: a function here, reading the one env var, keeps every caller —
 * `/pricing`'s buy buttons and `/checkout` itself — agreeing about what "on" means, rather
 * than two `process.env` reads that could drift apart over a typo in one of them.
 *
 * **This is not a security boundary.** While it answers true, any signed-in reader can give
 * their own account any plan for nothing, because there is nothing behind this to actually
 * charge — see `mockPurchase`'s own comment. It exists to be switched on for a short test
 * window and back off, the same way `SONGBOOK_FORCE_PLAN` is a deliberately risky local-only
 * escape hatch rather than a feature meant to run indefinitely, and it is deleted outright,
 * flag and route both, the day a real checkout replaces it.
 */
export function mockCheckoutEnabled(): boolean {
  return process.env.SONGBOOK_MOCK_CHECKOUT === 'on'
}

/**
 * Only warned about once per process, not once per request: a forced plan has to be
 * impossible to mistake for a real one in a log, and a line on every write would bury the
 * log it is trying to annotate.
 */
let warnedAboutForcedPlan = false

/**
 * `SONGBOOK_FORCE_PLAN`, read here and nowhere else — reading it in the pure core would make
 * its tests depend on the shell.
 *
 * Refused when `VERCEL_ENV === 'production'`, and **not** on `NODE_ENV`: `NODE_ENV` is
 * `production` in Vercel previews too, so guarding on it would switch this off in the one
 * deployed environment it exists for while leaving production itself to be decided by which
 * variable somebody set. `VERCEL_ENV` is absent locally, which is why the local case works.
 *
 * Exported so `/accounts` can *say* so, for the reason `plansEnforced` exists at all: an
 * override nobody can see is «I gifted premium and their songs are still frozen» with no
 * visible cause. The `console.warn` below is not that — a server log is not the screen the
 * operator is looking at. Deliberately **not** the function that warns: a page render calling
 * that one would consume the once-per-process flag and swallow the log line the deployment's
 * own operator reads. One guard, two callers, so the screen and the resolver can never
 * disagree about whether the override is live.
 */
export function forcedPlanNotice(): Plan | null {
  const raw = process.env.SONGBOOK_FORCE_PLAN
  if (!raw) return null
  if (process.env.VERCEL_ENV === 'production') return null

  return readPlan(raw)
}

/** The gate's own reader: the same answer, plus the one log line per process. */
function forcedPlan(): Plan | null {
  const plan = forcedPlanNotice()
  if (plan === null) return null

  if (!warnedAboutForcedPlan) {
    warnedAboutForcedPlan = true
    console.warn(
      `SONGBOOK_FORCE_PLAN is set: every account is being treated as '${plan}' (read as '${process.env.SONGBOOK_FORCE_PLAN}')`,
    )
  }
  return plan
}

/**
 * The seven plan facts for one account, or null when there is no row for that address.
 *
 * An explicit projection rather than `select()`: a star-expanded select names every column
 * drizzle's schema knows, so it is the one shape of read that a migration applied *after*
 * the deploy breaks. Naming the columns this actually needs keeps that failure to the
 * columns this feature owns, where the fail-open below can absorb it.
 */
async function storedPlanOf(accountOwnerEmail: string): Promise<StoredPlan | null> {
  const rows = await db()
    .select({
      plan: accounts.plan,
      planStatus: accounts.planStatus,
      planExpiresAt: accounts.planExpiresAt,
      pendingPlan: accounts.pendingPlan,
      pendingCycle: accounts.pendingCycle,
      grantedPlan: accounts.grantedPlan,
      grantedUntil: accounts.grantedUntil,
    })
    .from(accounts)
    .where(eq(accounts.ownerEmail, accountOwnerEmail))
    .limit(1)

  const row = rows[0]
  if (row === undefined) return null

  return {
    plan: readPlan(row.plan),
    // `planExpiresAt`, not an `expiresAt` — that column deliberately does not exist. And a
    // null here means never, which is what free, lifetime and an open-ended grant all carry.
    expiresAt: row.planExpiresAt,
    status: readPlanStatus(row.planStatus),
    // `readPendingPlan`/`readPendingCycle`, never `readPlan`: see their own comments on why
    // an unrecognised value here must mean "nothing scheduled", not `'free'`. This is also
    // the single choke point behind `entitlementsOf`, `deviceCapOf` and `effectivePlanOf` —
    // every one of the three inherits pending-awareness from this one query.
    pendingPlan: readPendingPlan(row.pendingPlan),
    pendingCycle: readPendingCycle(row.pendingCycle),
    // The grant is a second (plan, until) pair from the same row, and it contributes only
    // when `grantedPlan` is actually set — hence the null rather than a `readPlan` fallback,
    // which would turn every ungifted account into the holder of a free grant.
    grantedPlan: row.grantedPlan === null ? null : readPlan(row.grantedPlan),
    grantedUntil: row.grantedUntil,
  }
}

/**
 * How much the account is holding, which is what the caps are compared against.
 *
 * Songs carry no account column, so the account-wide song count is a join to `songbooks` on
 * `songbookSlug` — the same join `listSongsForAccount` already does, and for the same
 * reason. Written without it, the count would silently be the whole installation's, which
 * would freeze every account in it. Both queries run on every gated write, which is what
 * `songbooks_account_owner_email_idx` and `songs_songbook_slug_idx` were added for; there is
 * deliberately no "skip the count when the plan is unlimited" shortcut, because a count
 * that is sometimes absent is a freeze that sometimes does not happen.
 */
async function countRepertoire(accountOwnerEmail: string): Promise<RepertoireCounts> {
  const [songbookRows, songRows] = await Promise.all([
    db()
      .select({ held: count() })
      .from(songbooks)
      .where(eq(songbooks.accountOwnerEmail, accountOwnerEmail)),
    db()
      .select({ held: count() })
      .from(songs)
      .innerJoin(songbooks, eq(songs.songbookSlug, songbooks.slug))
      .where(eq(songbooks.accountOwnerEmail, accountOwnerEmail)),
  ])

  return { songbooks: songbookRows[0]?.held ?? 0, songs: songRows[0]?.held ?? 0 }
}

/**
 * What this account may do, right now.
 *
 * Resolved for **the account being written**, never for the caller: a global owner operating
 * inside somebody else's account gets that account's plan, because the rows they are about
 * to write belong to that customer. `permit`/`permitOn` already hold the right address in
 * `user.accountOwnerEmail`, and that is the argument.
 */
export async function entitlementsOf(accountOwnerEmail: string): Promise<Entitlements> {
  /*
   * Before any query, not after: the switch has to be an off switch during the deploy window
   * too, when the columns it would read may not exist yet — and off has to cost nothing.
   * Absent or anything other than 'on' means off, which is the repo's existing shape for a
   * configuration flag (`captcha.ts`, `rateLimit.ts`): nothing configured, nothing blocks.
   */
  if (!plansEnforced()) return UNGATED

  /* No database means the file repository under `content/`, which has no accounts at all. */
  if (!hasDatabase) return UNGATED

  const forced = forcedPlan()

  try {
    /*
     * A forced plan replaces the whole stored row and is therefore checked before the
     * missing-row fail-open below — otherwise the variable would be silently defeated in the
     * one situation somebody would reach for it, a local database with no row for the address
     * they are signed in as. The counts stay real either way, which is what makes the freeze
     * reproducible locally: forcing 'free' against a real repertoire of forty songs is
     * exactly the downgraded account this rule exists for.
     */
    const stored: StoredPlan | null =
      forced === null
        ? await storedPlanOf(accountOwnerEmail)
        : { plan: forced, expiresAt: null, status: 'active', ...NOTHING_PENDING, grantedPlan: null, grantedUntil: null }

    if (stored === null) {
      console.error(`entitlementsOf found no account row for ${accountOwnerEmail}`)
      return UNGATED
    }

    return entitlementsFor(stored, new Date(), await countRepertoire(accountOwnerEmail))
  } catch (error) {
    console.error('entitlementsOf failed', error)
    return UNGATED
  }
}


/**
 * How many other devices may follow one of this account's Strum Together broadcasts, and
 * whether that number is being enforced at all.
 *
 * A second entry point beside `entitlementsOf`, which is not a duplicate of it. Three
 * reasons, in ascending order of how much they matter.
 *
 * It costs **one** read where `entitlementsOf` costs three: `storedPlanOf` plus the two
 * `count()` queries of `countRepertoire`. This runs on a guest joining a broadcast, on a
 * screen whose whole promise is «open the link and you are there», and again every ten
 * seconds while the leader has the sharing panel open.
 *
 * The only thing those two extra counts feed is `frozen`, and this gate is *forbidden* to
 * consult it. `entitlementsFor`'s own comment says the freeze deliberately does not reach
 * leading: a frozen account can still broadcast, because a broadcast changes no song. So
 * the two queries would be paid for a field that must then be ignored, which is the whole
 * objection — and `planStateFor` was extracted and exported for exactly this kind of
 * caller.
 *
 * And the rule this feature needs is not «what may they do» but «what is the number, and is
 * anybody counting». Those are two answers, which is why `enforced` is its own field rather
 * than something a caller infers from `max`: `UNGATED.limits.devices` is 100, so a bare
 * `held < max` would refuse the 101st guest of an installation that enforces nothing. See
 * `admits` in `strumTogether/devices.ts`, which takes both and is the one place they meet.
 *
 * Rejected in the other direction too: reading `accounts.plan` alone would also be one read,
 * but it would re-derive the plan from one column and so ignore expiry, status and the
 * manual grant — a second, quietly disagreeing copy of the generosity rule, which is the
 * thing `planStateFor` exists to prevent there being.
 *
 * Every failure answers `{ enforced: false }` — the same direction as `entitlementsOf` and
 * for the same reason, one level sharper here: falling shut would refuse a friend at the
 * door of a performance that is already happening, over an unreadable row.
 */
export async function deviceCapOf(accountOwnerEmail: string): Promise<{ max: number; enforced: boolean }> {
  /* Before any query, exactly as in `entitlementsOf`: off has to cost nothing, including
   * during a deploy window when the columns this would read may not exist yet. Note what
   * this early return does *not* switch off — the counting, the heartbeat and the peak all
   * still happen, because the caller only asks this about the refusal. That is the one place
   * in this feature where the off switch does not mean "nothing happens", and it is
   * deliberate: counting is measurement, not a limit, and the peak's entire value is that it
   * starts collecting before the switch is ever flipped. */
  if (!plansEnforced()) return UNENFORCED_CAP
  if (!hasDatabase) return UNENFORCED_CAP

  try {
    /* `SONGBOOK_FORCE_PLAN` is honoured here for the same reason `entitlementsOf` honours
     * it, and it must be: a local override that moved every cap except this one would make
     * the device cap the one rule nobody can reproduce off production. It also skips the
     * read, which is why it is checked first. */
    const forced = forcedPlan()
    const stored: StoredPlan | null =
      forced === null
        ? await storedPlanOf(accountOwnerEmail)
        : { plan: forced, expiresAt: null, status: 'active', ...NOTHING_PENDING, grantedPlan: null, grantedUntil: null }

    if (stored === null) {
      console.error(`deviceCapOf found no account row for ${accountOwnerEmail}`)
      return UNENFORCED_CAP
    }

    return { max: PLANS[planStateFor(stored, new Date()).effectivePlan].devices, enforced: true }
  } catch (error) {
    console.error('deviceCapOf failed', error)
    return UNENFORCED_CAP
  }
}

/**
 * The two names this account's plan goes by, from one read: `effective` is whichever side
 * wins the generosity rule (a manual grant can outrank the subscription underneath it), and
 * `subscription` is the live subscription **alone**, with any grant deliberately ignored.
 * Both null when there is nothing to report — enforcement off, no database, or an unreadable
 * row, the same fail-open direction `entitlementsOf` and `deviceCapOf` both take. `null`
 * deliberately means the same thing here that it means on `Entitlements.state`: nobody has a
 * plan to report, not "free".
 *
 * A third, even lighter entry point beside those two: the account menu's own plan line asks
 * only "what is it called", never a cap or a count, so it costs the one read `deviceCapOf`
 * does rather than the three `entitlementsOf` pays for counts this has no use for.
 *
 * **Why both, rather than only `effective`:** these two answer different questions and
 * `/pricing` needs them apart. "Which badge do I show" is `effective` — the limits actually
 * in force, gift included. "Which card is *your plan*, and is this column an upgrade or a
 * downgrade from it" is `subscription`, for the reason `mockPurchase` states about its own
 * rank comparison: a manual grant must never be mistaken for the subscription it sits beside.
 * Reading `effective` for that second question let a gifted Premium sit on the Premium card as
 * "Your plan", so completing that card's checkout turned a free gift into a real purchase the
 * customer never asked for. One `storedPlanOf` read serves both, so telling them apart costs
 * no extra query.
 */
export async function planNamesOf(
  accountOwnerEmail: string,
): Promise<{ effective: Plan | null; subscription: Plan | null }> {
  const nothing = { effective: null, subscription: null }
  if (!plansEnforced()) return nothing
  if (!hasDatabase) return nothing

  try {
    const forced = forcedPlan()
    const stored: StoredPlan | null =
      forced === null
        ? await storedPlanOf(accountOwnerEmail)
        : { plan: forced, expiresAt: null, status: 'active', ...NOTHING_PENDING, grantedPlan: null, grantedUntil: null }

    if (stored === null) {
      console.error(`planNamesOf found no account row for ${accountOwnerEmail}`)
      return nothing
    }

    const now = new Date()
    return { effective: planStateFor(stored, now).effectivePlan, subscription: liveSubscription(stored, now) }
  } catch (error) {
    console.error('planNamesOf failed', error)
    return nothing
  }
}

/**
 * Whether this account has completed the mandatory plan-choice step (PLAN.md, v3.7) —
 * Free or paid, either counts, read straight off `accounts.planChosenAt` rather than through
 * `storedPlanOf`: this asks a yes/no question `StoredPlan` has no field for, and the other
 * three readers in this file would gain a field they never use.
 *
 * `true` when there is nothing to gate — enforcement is off, there is no database, or
 * `SONGBOOK_FORCE_PLAN` is set — same fail-open direction as `entitlementsOf` and its
 * neighbours, and for a sharper reason here: the caller of this function is a redirect, and
 * failing shut would turn one unreadable row into a login-time lockout instead of a merely
 * generous account, for a musician who is probably trying to get on stage. A forced plan
 * bypasses this the same way it bypasses everything else in this file — its contract is "this
 * account is exactly and only this plan", which a forced trip through the choice screen would
 * contradict.
 *
 * `true` on a missing row, too, for the same reason `storedPlanOf`'s callers treat one as
 * `UNGATED` rather than as a refusal — a row this cannot find is not evidence that a choice is
 * outstanding.
 */
export async function hasChosenPlan(accountOwnerEmail: string): Promise<boolean> {
  if (!plansEnforced()) return true
  if (!hasDatabase) return true
  if (forcedPlan() !== null) return true

  try {
    const rows = await db()
      .select({ planChosenAt: accounts.planChosenAt })
      .from(accounts)
      .where(eq(accounts.ownerEmail, accountOwnerEmail))
      .limit(1)

    const row = rows[0]
    if (row === undefined) {
      console.error(`hasChosenPlan found no account row for ${accountOwnerEmail}`)
      return true
    }

    return row.planChosenAt !== null
  } catch (error) {
    console.error('hasChosenPlan failed', error)
    return true
  }
}

/**
 * What every one of `deviceCapOf`'s four exits answers with.
 *
 * `UNGATED.limits.devices` rather than a literal 100, so the fail-open value cannot drift
 * from the fail-open entitlements the rest of this file returns. A constant for the same
 * reason `UNGATED` is one: four exits that must be identical should be one object, not four
 * object literals a later edit can touch three of.
 */
const UNENFORCED_CAP = { max: UNGATED.limits.devices, enforced: false } as const
