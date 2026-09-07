/**
 * The writes: claiming an occurrence, dispatching it, recording what happened, and skipping
 * one by hand.
 *
 * **The claim is an insert, and it happens before anything is sent.** Every guarantee this
 * feature makes rests on that one ordering. A read-then-write — «has this been done? no? do
 * it» — has a window in it, and the window is exactly as long as a delivery takes; two runs
 * inside it both find nothing and both send. Inserting first turns the question over to the
 * unique indexes on `outreach_actions`, which answer it inside a single statement: whoever's
 * insert lands owns the occurrence, and everybody else is refused by the database rather than
 * by a check.
 *
 * The price of that ordering is stated where it lands rather than hidden: a delivery whose
 * outcome cannot be written back leaves a `pending` row, so the engine knows something started
 * and not whether it arrived. `STALE_ATTEMPT_MS` below is where that is dealt with, and it is
 * deliberately dealt with by an operator and not by a rule.
 *
 * A plain module, no `'use server'`: `actions.ts` owns the directive and the owner check, and
 * these functions are also the seam a schedule would call — see `runDueOutreach`.
 */

import { and, eq, ne, or, sql } from 'drizzle-orm'

import { db, hasDatabase } from '@/lib/db/client'
import { outreachActions } from '@/lib/db/schema'

import { eligibilityFor } from './eligibility'
import { HANDLERS } from './handlers'
import type { OutreachDelivery, OutreachTarget } from './handlers'
import { occurrenceKeyFor } from './occurrence'
import { outreachAccountFor, outreachViewFor, dueKinds } from './read'
import type { OutreachAccount } from './read'
import { MAX_OUTREACH_DETAIL, MAX_OUTREACH_REASON, OUTREACH, readOutreachStatus } from './types'
import type { OutreachFailure, OutreachKind, OutreachResult, OutreachStatus } from './types'

/**
 * How long an attempt is assumed to still be running.
 *
 * A `pending` row younger than this is refused with `in-flight` rather than taken over, which
 * is the one place this engine could send twice. Older than this and it is offered to an
 * operator as a retry — because the alternative is an occurrence stuck forever behind a row
 * whose process died, and because the person pressing the button is the one who can tell
 * whether the first attempt actually landed. Fifteen minutes is far longer than any delivery
 * here takes (a Resend call, or an in-app write) and far shorter than the gap between two
 * occurrences of anything.
 */
export const STALE_ATTEMPT_MS = 15 * 60 * 1000

/** Both handler strings are clamped on the way in: see `MAX_OUTREACH_DETAIL`. */
function clamp(value: string, max: number): string {
  const trimmed = value.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

function targetFor(account: OutreachAccount, occurrenceKey: string): OutreachTarget {
  return {
    ownerEmail: account.ownerEmail,
    firstName: account.firstName,
    lastName: account.lastName,
    effectivePlan: account.effectivePlan,
    occurrenceKey,
  }
}

/**
 * One row standing in the way of a claim — not the screen's `OutreachRow`, deliberately: the
 * only questions asked of it are the three the verdict below is made from, and a type that
 * carries no more than that cannot be read as the row an operator sees.
 */
interface OccurrenceClaim {
  id: number
  status: OutreachStatus
  lastAttemptAt: string | null
  /** True when the row points at this very account; false when only the address matched. */
  own: boolean
}

/**
 * Every row already on file for this occurrence, whether it points at this account or merely
 * names its address.
 *
 * Both, because both unique indexes can refuse the insert and they refuse for different
 * reasons: the pointer index for this account's own earlier row, the email index for a row
 * left behind by a *previous* account at the same address — which is precisely the
 * delete-and-recreate an action carrying a voucher must not be farmable by. A lookup by id
 * alone would find nothing there and read the refusal as a database error.
 *
 * Four columns and not a star-expanded select, the shape a migration applied after the deploy
 * breaks (`listAllAccounts`' own note).
 */
async function claimsForOccurrence(
  account: OutreachAccount,
  kind: OutreachKind,
  occurrenceKey: string,
): Promise<OccurrenceClaim[]> {
  const rows = await db()
    .select({
      id: outreachActions.id,
      accountId: outreachActions.accountId,
      status: outreachActions.status,
      lastAttemptAt: outreachActions.lastAttemptAt,
    })
    .from(outreachActions)
    .where(
      and(
        eq(outreachActions.kind, kind),
        eq(outreachActions.occurrenceKey, occurrenceKey),
        or(
          eq(outreachActions.accountId, account.accountId),
          eq(outreachActions.accountOwnerEmail, account.ownerEmail),
        ),
      ),
    )

  return rows.map((row) => ({
    id: row.id,
    status: readOutreachStatus(row.status),
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    own: row.accountId === account.accountId,
  }))
}

/**
 * What to do about an insert the database refused: retry this row, or refuse outright.
 *
 * Three rules, in this order, and the middle one is the whole anti-farming argument:
 *
 * 1. **Any `done` row wins.** The occurrence is finished with, whichever of the two indexes
 *    holds it.
 * 2. **Only a row pointing at *this* account may be taken over.** A conflict caused by the
 *    address alone means some earlier account at that address already had this action — its
 *    pointer is null because it was deleted, or it belongs to a different id because the
 *    address moved — and the address is the level at which "once ever" has to hold, or
 *    deleting an account and signing up again farms the voucher. Reported as `already-done`,
 *    which is what it is from the address's point of view.
 * 3. **A young `pending` row is in flight.** See `STALE_ATTEMPT_MS`.
 */
function claimVerdict(
  claims: readonly OccurrenceClaim[],
  now: Date,
): { takeOver: number } | { reason: OutreachFailure } {
  if (claims.some((claim) => claim.status === 'done')) return { reason: 'already-done' }

  const mine = claims.find((claim) => claim.own)
  if (mine === undefined) return { reason: 'already-done' }

  if (mine.status === 'pending') {
    const started = mine.lastAttemptAt === null ? null : Date.parse(mine.lastAttemptAt)
    if (started !== null && now.getTime() - started < STALE_ATTEMPT_MS) return { reason: 'in-flight' }
  }

  return { takeOver: mine.id }
}

/**
 * Writes the outcome onto the claimed row.
 *
 * Never throws: the delivery has already happened by the time this is called, and a failure to
 * record it must not be reported to the caller as a failure to deliver. It is logged and the
 * row stays `pending`, which reads as «started, never settled» on the screen — see this
 * module's own header on why that state exists at all.
 */
async function settle(id: number, delivery: OutreachDelivery, now: Date): Promise<void> {
  try {
    await db()
      .update(outreachActions)
      .set(
        delivery.ok
          ? { status: 'done', detail: clamp(delivery.detail, MAX_OUTREACH_DETAIL), reason: null, lastAttemptAt: now }
          : { status: 'failed', reason: clamp(delivery.reason, MAX_OUTREACH_DETAIL), lastAttemptAt: now },
      )
      .where(eq(outreachActions.id, id))
  } catch (error) {
    console.error('settle failed', error)
  }
}

/**
 * Run one action against one account, now.
 *
 * The one entry point for both «run it» and «retry it»: which of the two this is depends on
 * whether a row already exists, and the caller does not have to know. That is not a
 * convenience — a separate retry function would need its own copy of the claim rules, and two
 * copies of a rule about not doing something twice is one copy too many. The screen's button
 * changes its label from the row it is drawn beside; both labels call this.
 *
 * `triggeredBy` is `'system'` for anything a schedule or a request path runs on its own, and an
 * operator's address for anything run by hand. Recorded, never checked: authorisation is
 * `actions.ts`' business, and this function is also reachable from a context with no session at
 * all.
 */
export async function runOutreach(
  kind: OutreachKind,
  ownerEmail: string,
  triggeredBy: string,
  now: Date,
): Promise<OutreachResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const definition = OUTREACH[kind]
  const handler = HANDLERS[kind]
  /* Before the claim, deliberately: a kind with no handler must not leave a row behind for
     somebody to clean up, and «not built» is a fact about the deploy, not about this account. */
  if (handler === null) return { ok: false, reason: 'not-built' }

  const account = await outreachAccountFor(ownerEmail, now)
  if (account === null) return { ok: false, reason: 'no-account' }

  if (!eligibilityFor(definition, account).eligible) return { ok: false, reason: 'not-eligible' }

  const occurrenceKey = occurrenceKeyFor(definition.cadence, now)

  let id: number
  try {
    const claimed = await db()
      .insert(outreachActions)
      .values({
        accountId: account.accountId,
        accountOwnerEmail: account.ownerEmail,
        kind,
        occurrenceKey,
        status: 'pending',
        channel: definition.channel,
        attempts: 1,
        lastAttemptAt: now,
        triggeredBy,
      })
      /* No conflict target: either index may be the one that refuses, and the verdict below
         tells them apart by looking at what is actually there. */
      .onConflictDoNothing()
      .returning({ id: outreachActions.id })

    const fresh = claimed[0]
    if (fresh === undefined) {
      const verdict = claimVerdict(await claimsForOccurrence(account, kind, occurrenceKey), now)
      if ('reason' in verdict) return { ok: false, reason: verdict.reason }

      /*
       * A compare-and-swap, not a plain update: `status <> 'done'` in the WHERE is what makes
       * the takeover safe against a run that completed between the verdict and this statement.
       * An empty result means exactly that happened, and the honest answer is the one the
       * winner wrote.
       */
      const taken = await db()
        .update(outreachActions)
        .set({
          status: 'pending',
          attempts: sql`${outreachActions.attempts} + 1`,
          lastAttemptAt: now,
          reason: null,
          triggeredBy,
        })
        .where(and(eq(outreachActions.id, verdict.takeOver), ne(outreachActions.status, 'done')))
        .returning({ id: outreachActions.id })

      const retried = taken[0]
      if (retried === undefined) return { ok: false, reason: 'already-done' }
      id = retried.id
    } else {
      id = fresh.id
    }
  } catch (error) {
    console.error('runOutreach could not claim', error)
    return { ok: false, reason: 'failed' }
  }

  let delivery: OutreachDelivery
  try {
    delivery = await handler(targetFor(account, occurrenceKey))
  } catch (error) {
    /* A handler that threw is a failed delivery and not a failed run: the claim stands, the row
       says why, and it stays retryable. */
    console.error(`outreach handler ${kind} threw`, error)
    delivery = { ok: false, reason: 'The handler threw. See the server log.' }
  }

  await settle(id, delivery, now)

  return delivery.ok ? { ok: true } : { ok: false, reason: 'delivery-failed' }
}

/**
 * Record that an occurrence will deliberately not be run — «we were allowed to and chose not
 * to», which is a different answer from no row at all and from a failure.
 *
 * Claims the occurrence exactly as a run does, so a skip and a run race the same way and the
 * skip is as binding as a send. It asks for **neither** a handler nor eligibility: an action
 * with no handler is precisely one worth pre-empting for an account it should never reach, and
 * an account that is ineligible today may not be next month — the point of writing the row is
 * that the decision outlives the reason for it.
 */
export async function suppressOutreach(
  kind: OutreachKind,
  ownerEmail: string,
  reason: string,
  triggeredBy: string,
  now: Date,
): Promise<OutreachResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const account = await outreachAccountFor(ownerEmail, now)
  if (account === null) return { ok: false, reason: 'no-account' }

  const definition = OUTREACH[kind]
  const occurrenceKey = occurrenceKeyFor(definition.cadence, now)
  const said = clamp(reason, MAX_OUTREACH_REASON)

  try {
    const claimed = await db()
      .insert(outreachActions)
      .values({
        accountId: account.accountId,
        accountOwnerEmail: account.ownerEmail,
        kind,
        occurrenceKey,
        status: 'suppressed',
        channel: definition.channel,
        /* Zero, and it stays zero: nothing was attempted, which is what distinguishes this row
           from a `failed` one that gave up. */
        attempts: 0,
        reason: said === '' ? null : said,
        triggeredBy,
      })
      .onConflictDoNothing()
      .returning({ id: outreachActions.id })

    if (claimed[0] !== undefined) return { ok: true }

    const verdict = claimVerdict(await claimsForOccurrence(account, kind, occurrenceKey), now)
    /* An in-flight attempt is *not* a reason to refuse a skip — it is the most likely moment
       somebody wants one — but a completed occurrence is: there is nothing left to prevent. */
    if ('reason' in verdict && verdict.reason !== 'in-flight') return { ok: false, reason: verdict.reason }

    const id = 'takeOver' in verdict ? verdict.takeOver : null
    if (id === null) return { ok: false, reason: 'failed' }

    const taken = await db()
      .update(outreachActions)
      .set({ status: 'suppressed', reason: said === '' ? null : said, triggeredBy })
      .where(and(eq(outreachActions.id, id), ne(outreachActions.status, 'done')))
      .returning({ id: outreachActions.id })

    return taken[0] === undefined ? { ok: false, reason: 'already-done' } : { ok: true }
  } catch (error) {
    console.error('suppressOutreach failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Everything due for one account, run in declaration order.
 *
 * **This is the seam a schedule would call**, once there is one: this repository has no
 * background job anywhere in it (`resolveSubscription`'s own note, and `campaignStatus`'), so
 * today the only caller is the button on `/accounts/[email]`. A cron route or a hook on
 * sign-in would loop accounts and call this per account — nothing here needs to change for
 * that, and nothing here assumes a person is watching.
 *
 * Sequential, not `Promise.all`: each of these is a delivery to the same person, and a burst of
 * parallel emails to one reader is worse than a run that takes a second longer. It also keeps
 * the claim statements from contending with each other.
 *
 * Reports what it ran rather than a bare ok. «Two actions, one refused» is what the operator
 * pressing the button has to be told; a single boolean would make a run that did nothing look
 * exactly like a run that did everything.
 */
export async function runDueOutreach(
  ownerEmail: string,
  triggeredBy: string,
  now: Date,
): Promise<{ ok: true; ran: OutreachKind[]; refused: OutreachKind[] } | { ok: false; reason: OutreachFailure }> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const view = await outreachViewFor(ownerEmail, now)
  if (view === null) return { ok: false, reason: 'no-account' }

  const ran: OutreachKind[] = []
  const refused: OutreachKind[] = []

  for (const kind of dueKinds(view)) {
    const result = await runOutreach(kind, ownerEmail, triggeredBy, now)
    if (result.ok) ran.push(kind)
    else refused.push(kind)
  }

  return { ok: true, ran, refused }
}
