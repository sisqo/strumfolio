/**
 * The two reads: where one account came from, and how each channel is doing.
 *
 * Owner-gated like every other whole-installation read in this repo, and `null` on failure
 * rather than an empty answer — "no attribution was ever recorded" and "could not tell" are
 * opposite answers, the distinction `rateLimitStatusFor` refuses to collapse and the reason
 * `/accounts` prints an em dash instead of something reassuring.
 *
 * **The effective plan is not computed here.** `storedPlanFrom` and `planStateFor` are imported
 * so that "so what plan are they actually on" has exactly one spelling in this repo — the drift
 * `PLAN_COLUMNS` and `planLineFrom` were extracted to prevent. Aggregating in TypeScript rather
 * than in SQL is the whole reason that is possible: a `CASE` over `plan`, `plan_status`,
 * `plan_expires_at`, `granted_plan` and `granted_until` would be a second implementation of the
 * generosity rule, in a language where nothing type-checks it.
 */

import { and, desc, eq, isNotNull, isNull, notExists, sql } from 'drizzle-orm'

import { auth } from '@/auth'
import { PLAN_COLUMNS, storedPlanFrom } from '@/lib/accounts/planColumns'
import type { PlanRow } from '@/lib/accounts/planColumns'
import { isOwner, normalizeEmail } from '@/lib/allowlist'
import { db, hasDatabase } from '@/lib/db/client'
import { accountIdOf } from '@/lib/db/ids'
import { accounts, leadAttribution } from '@/lib/db/schema'
import { planStateFor } from '@/lib/plans/entitlements'

/** One arrival, as a screen prints it. */
export interface TouchLine {
  source: string | null
  medium: string | null
  campaign: string | null
  term: string | null
  content: string | null
  clickIdKind: string | null
  clickId: string | null
  refererHost: string | null
  landingPath: string | null
  at: Date | null
}

/** Where one account came from. `last` is null when there has only ever been one arrival. */
export interface AttributionLine {
  first: TouchLine
  last: TouchLine | null
  frozenAt: Date | null
}

/** `ok: false` is "could not read"; `line: null` is "nothing was ever recorded for this account". */
export type AttributionRead = { ok: true; line: AttributionLine | null } | { ok: false }

/** How one channel is doing. A null in any of the three keys is "that arrival carried no such label". */
export interface ChannelRow {
  source: string | null
  medium: string | null
  campaign: string | null
  /** Registrations begun and not yet turned into an account — a lead, still open. */
  pending: number
  /** Accounts created. */
  accounts: number
  /** Of those accounts, how many are on a paid plan **right now**, by effective plan. */
  paying: number
}

export interface LeadRollup {
  rows: ChannelRow[]
  /**
   * Accounts with no attribution row at all, counted apart rather than dropped.
   *
   * Two populations live here and neither is small: **every account created before this feature
   * shipped**, which is never backfilled by decision, and every sign-up whose browser carried
   * no arrival worth recording — somebody who typed the address in, or arrived from a private
   * tab. A `GROUP BY` over the campaign columns would omit both in silence, and the first
   * months would read as though they had no traffic.
   */
  unattributed: { accounts: number; paying: number }
}

/** Which arrival a rollup groups by: the one that discovered somebody, or the one that closed. */
export type RollupBasis = 'first' | 'last'

function touchLine(row: Record<string, unknown>, prefix: 'first' | 'last'): TouchLine {
  const at = row[`${prefix}TouchAt`]
  const text = (key: string): string | null => {
    const value = row[`${prefix}${key}`]
    return typeof value === 'string' ? value : null
  }

  return {
    source: text('Source'),
    medium: text('Medium'),
    campaign: text('Campaign'),
    term: text('Term'),
    content: text('Content'),
    clickIdKind: text('ClickIdKind'),
    clickId: text('ClickId'),
    refererHost: text('RefererHost'),
    landingPath: text('LandingPath'),
    at: at instanceof Date ? at : null,
  }
}

/**
 * Where one account came from, for the Identity tab.
 *
 * Asked by `accountId`, never by the address on the row: that address is history, frozen at the
 * moment of the arrival, so a reader who has since changed theirs would be looked up under the
 * new one and found to have come from nowhere. The same defect the numeric key exists to remove,
 * and the same note `couponViewsFor` carries.
 */
export async function attributionFor(ownerEmail: string): Promise<AttributionRead> {
  if (!hasDatabase) return { ok: false }

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) return { ok: false }

  try {
    const rows = await db()
      .select()
      .from(leadAttribution)
      .where(eq(leadAttribution.accountId, accountIdOf(normalizeEmail(ownerEmail))))
      .limit(1)

    const row = rows[0]
    if (row === undefined) return { ok: true, line: null }

    const record = row as unknown as Record<string, unknown>
    return {
      ok: true,
      line: {
        first: touchLine(record, 'first'),
        /* `last_touch_at IS NULL` is the whole test for "one provenance, ever" — the schema's
           own invariant, which is why nothing here compares ten columns to find out. */
        last: row.lastTouchAt === null ? null : touchLine(record, 'last'),
        frozenAt: row.frozenAt,
      },
    }
  } catch (error) {
    console.error('attributionFor failed', error)
    return { ok: false }
  }
}

/**
 * How each channel is doing, for `/leads`.
 *
 * Two queries and no aggregation in SQL — see this module's header for why the plan rule must be
 * resolved in TypeScript. The volumes make it free: one row per lead ever, and one row per
 * account with no attribution.
 *
 * `basis` decides which arrival the grouping is by. On `'last'` the *effective* last touch is
 * used — the stored last, falling back to the first — because a reader with one arrival has a
 * last touch too, and it is that one.
 */
export async function leadRollup(basis: RollupBasis): Promise<LeadRollup | null> {
  if (!hasDatabase) return null

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) return null

  try {
    const now = new Date()

    const [leads, orphans] = await Promise.all([
      db()
        .select({ row: leadAttribution, plan: PLAN_COLUMNS })
        .from(leadAttribution)
        .leftJoin(accounts, eq(accounts.id, leadAttribution.accountId)),
      /* Every account no attribution row points at. `notExists` rather than `NOT IN`, which
         answers nothing at all the moment the subquery yields a single NULL. */
      db()
        .select({ plan: PLAN_COLUMNS })
        .from(accounts)
        .where(
          notExists(
            db()
              .select({ one: sql`1` })
              .from(leadAttribution)
              .where(and(eq(leadAttribution.accountId, accounts.id), isNotNull(leadAttribution.accountId))),
          ),
        ),
    ])

    const paying = (plan: PlanRow | null): boolean =>
      plan !== null && plan.plan !== null && planStateFor(storedPlanFrom(plan), now).effectivePlan !== 'free'

    const grouped = new Map<string, ChannelRow>()

    for (const entry of leads) {
      const row = entry.row
      const useLast = basis === 'last' && row.lastTouchAt !== null
      const source = useLast ? row.lastSource : row.firstSource
      const medium = useLast ? row.lastMedium : row.firstMedium
      const campaign = useLast ? row.lastCampaign : row.firstCampaign

      const key = `${source ?? ''} ${medium ?? ''} ${campaign ?? ''}`
      const current = grouped.get(key) ?? { source, medium, campaign, pending: 0, accounts: 0, paying: 0 }

      if (row.accountId === null) {
        current.pending += 1
      } else {
        current.accounts += 1
        if (paying(entry.plan as PlanRow | null)) current.paying += 1
      }

      grouped.set(key, current)
    }

    const rows = [...grouped.values()].sort((a, b) => b.accounts + b.pending - (a.accounts + a.pending))

    return {
      rows,
      unattributed: {
        accounts: orphans.length,
        paying: orphans.filter((entry) => paying(entry.plan as PlanRow | null)).length,
      },
    }
  } catch (error) {
    console.error('leadRollup failed', error)
    return null
  }
}

/**
 * Every open lead — a registration begun and never turned into an account — newest first.
 *
 * On `/leads` beside the rollup, because a channel's "pending" count is a number somebody will
 * want to look behind: these are addresses that arrived from a campaign and stopped at the
 * verification email, which is a different problem from a campaign that brings nobody.
 */
export async function openLeads(limit: number): Promise<{ email: string; line: AttributionLine }[] | null> {
  if (!hasDatabase) return null

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) return null

  try {
    const rows = await db()
      .select()
      .from(leadAttribution)
      .where(isNull(leadAttribution.accountId))
      .orderBy(desc(leadAttribution.createdAt))
      .limit(limit)

    return rows.map((row) => {
      const record = row as unknown as Record<string, unknown>
      return {
        email: row.email,
        line: {
          first: touchLine(record, 'first'),
          last: row.lastTouchAt === null ? null : touchLine(record, 'last'),
          frozenAt: row.frozenAt,
        },
      }
    })
  } catch (error) {
    console.error('openLeads failed', error)
    return null
  }
}
