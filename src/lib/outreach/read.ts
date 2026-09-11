/**
 * The reads: what is known about one account before anything is aimed at it, and what has
 * already been aimed at it.
 *
 * A plain module, no `'use server'` — it is called from `actions.ts` (which has the directive
 * and the owner check) and from `run.ts`, and nothing here crosses the client boundary. That
 * also leaves it free to export interfaces and a synchronous predicate beside the queries they
 * belong to.
 *
 * Every read answers `null` for "could not tell" rather than an empty result. On this screen
 * the two are opposite answers — the same rule `rateLimitStatusFor` states — and here the cost
 * of collapsing them is sharper than a wrong dash: «no rows» reads as «nothing has been sent
 * to this account», which is precisely the sentence somebody would act on by sending it again.
 */

import { desc, eq } from 'drizzle-orm'

import { normalizeEmail } from '@/lib/allowlist'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts, newsletterPrefs, outreachActions } from '@/lib/db/schema'
import { planStateFor } from '@/lib/plans/entitlements'
import { readPendingCycle } from '@/lib/plans/prices'
import { readPendingPlan, readPlan, readPlanStatus } from '@/lib/plans/types'

import { eligibilityFor } from './eligibility'
import type { Eligibility, OutreachFacts } from './eligibility'
import { isBuilt } from './handlers'
import { occurrenceKeyFor } from './occurrence'
import { OUTREACH_LIST, STALE_ATTEMPT_MS, readOutreachKind, readOutreachStatus } from './types'
import type { OutreachKind, OutreachStatus } from './types'

/**
 * One account, as this feature needs it: the eligibility facts, plus the identity a handler
 * writes to and the id a claim is made with.
 *
 * The id is carried rather than re-derived with `accountIdOf` at insert time, deliberately.
 * That helper yields NULL for an account that does not exist, and a NULL here would not fail —
 * it would write a row whose pointer is null, which the partial unique index does not police.
 * The claim would still be caught by the email index, but the row would look like one belonging
 * to a deleted account. Reading the number first means the insert either names a real account
 * or fails on the foreign key.
 */
export interface OutreachAccount extends OutreachFacts {
  accountId: number
  ownerEmail: string
  firstName: string | null
  lastName: string | null
}

/**
 * One claimed occurrence, flattened for the screen.
 *
 * Dates as ISO strings rather than `Date`s, the `CampaignRow` precedent: every one of them is
 * displayed, and the panel is a client component.
 *
 * `kind` stays a raw string. A row can name an action this deploy no longer declares — an
 * action retired, a row written by a newer version — and rewriting it to something recognised
 * would be this module inventing history. The screen prints what it finds.
 */
export interface OutreachRow {
  id: number
  kind: string
  occurrenceKey: string
  status: OutreachStatus
  channel: string
  detail: string | null
  reason: string | null
  attempts: number
  lastAttemptAt: string | null
  createdAt: string
  triggeredBy: string | null
}

/** One declared action, against one account, at one moment. */
export interface OutreachLine {
  kind: OutreachKind
  /** The occurrence current at the moment of the read — `'2026'`, `'once'`. */
  occurrenceKey: string
  /** Whether a handler exists (`handlers.ts`). False means the row shows no run button at all. */
  built: boolean
  eligibility: Eligibility
  /** The row already claimed for this occurrence, or null while none has been. */
  current: OutreachRow | null
  /**
   * A `pending` row whose attempt started inside `STALE_ATTEMPT_MS` — something is running
   * right now.
   *
   * Computed here and carried, rather than left to the panel to work out from the clock: the
   * same window decides whether `runOutreach` refuses with `in-flight`, and a screen offering a
   * button the action would refuse is a screen that lies. The client must not re-derive a rule
   * the server enforces.
   */
  inFlight: boolean
}

export interface OutreachView {
  lines: OutreachLine[]
  /**
   * Everything on file for this account, newest occurrence included — past occurrences, the
   * current one, and rows naming a kind this deploy does not declare.
   *
   * It is **not** «everything except `lines`», which is what it meant while the panel drew the
   * current occurrence in a section of its own. `lines` survives for `dueKinds` and the
   * run-everything pass, which are server-side; nothing renders it, so a row omitted here is a
   * row nobody can see.
   */
  history: OutreachRow[]
}

/** Due means: buildable, allowed, and not yet claimed for the occurrence current now. */
export function isDue(line: OutreachLine): boolean {
  return line.built && line.eligibility.eligible && line.current === null
}

/** Whether this row's attempt is young enough that something is presumably still running. */
function stillRunning(row: OutreachRow | null, now: Date): boolean {
  if (row === null || row.status !== 'pending' || row.lastAttemptAt === null) return false
  return now.getTime() - Date.parse(row.lastAttemptAt) < STALE_ATTEMPT_MS
}

/**
 * The account's own facts. `null` for no database, no such account, or a failed read — the
 * three cases a caller treats identically, since none of them may result in anything being
 * sent.
 *
 * The newsletter row is read separately and its failure is **not** the whole read's failure: it
 * resolves to `newsletterSubscribed: null`, which `consentGate` turns into a refusal that says
 * consent could not be read. Folding it into a null account instead would report «no such
 * account» for an account that plainly exists.
 */
export async function outreachAccountFor(ownerEmail: string, now: Date): Promise<OutreachAccount | null> {
  if (!hasDatabase) return null

  const address = normalizeEmail(ownerEmail)

  try {
    const rows = await db()
      .select({
        id: accounts.id,
        ownerEmail: accounts.ownerEmail,
        firstName: accounts.firstName,
        lastName: accounts.lastName,
        suspendedAt: accounts.suspendedAt,
        plan: accounts.plan,
        planStatus: accounts.planStatus,
        planExpiresAt: accounts.planExpiresAt,
        pendingPlan: accounts.pendingPlan,
        pendingCycle: accounts.pendingCycle,
        grantedPlan: accounts.grantedPlan,
        grantedUntil: accounts.grantedUntil,
      })
      .from(accounts)
      .where(eq(accounts.ownerEmail, address))
      .limit(1)

    const row = rows[0]
    if (row === undefined) return null

    /* The same narrowing `storedPlanOf` does, and for its stated reasons — `readPendingPlan`
       and not `readPlan` on the pending column, so an unreadable cell means «nothing
       scheduled» rather than a cancellation; the grant contributes only when it is actually
       set. `planStateFor` then answers which side is in force, which is the plan an audience
       rule is about: a gifted Premium is a Premium for this purpose. */
    const state = planStateFor(
      {
        plan: readPlan(row.plan),
        expiresAt: row.planExpiresAt,
        status: readPlanStatus(row.planStatus),
        pendingPlan: readPendingPlan(row.pendingPlan),
        pendingCycle: readPendingCycle(row.pendingCycle),
        grantedPlan: row.grantedPlan === null ? null : readPlan(row.grantedPlan),
        grantedUntil: row.grantedUntil,
      },
      now,
    )

    return {
      accountId: row.id,
      ownerEmail: row.ownerEmail,
      firstName: row.firstName,
      lastName: row.lastName,
      suspended: row.suspendedAt !== null,
      newsletterSubscribed: await consentOf(row.id),
      effectivePlan: state.effectivePlan,
    }
  } catch (error) {
    console.error('outreachAccountFor failed', error)
    return null
  }
}

/**
 * Whether this account is subscribed, or `null` when that could not be established.
 *
 * A **missing** row is `false` and not null: `provisionAccount` writes one for every account it
 * creates, and its absence means nobody ever subscribed — which is a real answer, and the one
 * `loadNewsletterSummaryFor` already gives. Only a read that threw is null.
 */
async function consentOf(accountId: number): Promise<boolean | null> {
  try {
    const rows = await db()
      .select({ subscribed: newsletterPrefs.subscribed })
      .from(newsletterPrefs)
      .where(eq(newsletterPrefs.accountId, accountId))
      .limit(1)

    return rows[0]?.subscribed ?? false
  } catch (error) {
    console.error('consentOf failed', error)
    return null
  }
}

/** Every occurrence ever claimed for one account, newest first. `null` if it could not be read. */
export async function outreachRowsFor(accountId: number): Promise<OutreachRow[] | null> {
  if (!hasDatabase) return null

  try {
    const rows = await db()
      .select({
        id: outreachActions.id,
        kind: outreachActions.kind,
        occurrenceKey: outreachActions.occurrenceKey,
        status: outreachActions.status,
        channel: outreachActions.channel,
        detail: outreachActions.detail,
        reason: outreachActions.reason,
        attempts: outreachActions.attempts,
        lastAttemptAt: outreachActions.lastAttemptAt,
        createdAt: outreachActions.createdAt,
        triggeredBy: outreachActions.triggeredBy,
      })
      .from(outreachActions)
      .where(eq(outreachActions.accountId, accountId))
      .orderBy(desc(outreachActions.createdAt))

    return rows.map((row) => ({
      ...row,
      status: readOutreachStatus(row.status),
      lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }))
  } catch (error) {
    console.error('outreachRowsFor failed', error)
    return null
  }
}

/**
 * The row already claimed for one kind's current occurrence, if there is one — what `run.ts`
 * asks before it does anything, and what the screen's button reads its own label from.
 */
export function currentRow(rows: readonly OutreachRow[], kind: OutreachKind, occurrenceKey: string): OutreachRow | null {
  return rows.find((row) => row.kind === kind && row.occurrenceKey === occurrenceKey) ?? null
}

/**
 * Everything `/accounts/[email]`'s Outreach tab draws: one line per declared action, plus what
 * is left over.
 *
 * `null` when the account or its rows could not be read — never a view with empty lines, which
 * would show every action as never-sent and eligible.
 */
export async function outreachViewFor(ownerEmail: string, now: Date): Promise<OutreachView | null> {
  const account = await outreachAccountFor(ownerEmail, now)
  if (account === null) return null

  const rows = await outreachRowsFor(account.accountId)
  if (rows === null) return null

  /*
   * Only the kinds this panel actually drives. An `elsewhere` action — `gift_notice`, decided
   * on the Plan & gift tab — would otherwise get a line whose every field is wrong: its
   * occurrence key comes from a cadence it does not have, so `currentRow` would never match
   * the row it really wrote and the line would read «nothing claimed yet» beside a message
   * already sent; its eligibility would be computed by a consent gate that does not govern it;
   * and `isDue` would call it due for a run nothing offers. Its rows fall through to `history`
   * below, which is where a record of something already done belongs.
   */
  const lines = OUTREACH_LIST.filter((definition) => definition.trigger === 'panel').map((definition) => {
    const occurrenceKey = occurrenceKeyFor(definition.cadence, now)
    const current = currentRow(rows, definition.kind, occurrenceKey)
    return {
      kind: definition.kind,
      occurrenceKey,
      built: isBuilt(definition.kind),
      eligibility: eligibilityFor(definition, account),
      current,
      inFlight: stillRunning(current, now),
    }
  })

  return {
    lines,
    /*
     * Every row on file, the current occurrence's included. It used to exclude the rows already
     * carried on `lines`, because the panel drew those in a section of its own and a row shown
     * twice reads as two occurrences — and that section is gone (`OutreachPanel`), so the
     * exclusion now only hides this year's greeting from the one table that lists them.
     *
     * A row whose kind this deploy no longer declares belongs here for the same reason it
     * always did: `readOutreachKind` answers null for it, no line is built for it, and it is
     * history like any past occurrence.
     */
    history: rows,
  }
}

/** Which kinds a run-everything pass would actually touch, in declaration order. */
export function dueKinds(view: OutreachView): OutreachKind[] {
  return view.lines.filter(isDue).map((line) => line.kind)
}

/** The label for a row naming a kind this deploy may no longer know — falls back to the stored string. */
export function kindOf(row: OutreachRow): OutreachKind | null {
  return readOutreachKind(row.kind)
}
