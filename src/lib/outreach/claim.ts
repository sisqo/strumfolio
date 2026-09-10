/**
 * Taking an occurrence, and writing down what became of it.
 *
 * **The one part of this feature that must exist exactly once.** Every guarantee it makes
 * rests on a single ordering — the claim is an insert, and it happens before anything is sent
 * — and on reading the database's refusal correctly when two attempts race. A read-then-write
 * («has this been done? no? do it») has a window in it as long as a delivery takes, and two
 * runs inside that window both find nothing and both send. Inserting first turns the question
 * over to the unique indexes on `outreach_actions`, which answer it inside one statement.
 *
 * Extracted from `run.ts` when a second caller appeared: `sendGiftNotice`
 * (`accounts/actions.ts`) claims and settles the same way but composes its own message, so it
 * cannot go through `runOutreach`. Two implementations of a rule about not doing something
 * twice is one implementation too many — and the half that would have been got wrong is not
 * the insert but `claimVerdict`, since **there are two unique indexes here, not one**, and
 * they refuse for different reasons.
 *
 * A plain module, no `'use server'`: it is called from `run.ts` and from a server action that
 * owns its own directive and its own owner check.
 */

import { and, eq, ne, or, sql } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { outreachActions } from '@/lib/db/schema'

import type { OutreachDelivery } from './handlers'
import { MAX_OUTREACH_DETAIL, STALE_ATTEMPT_MS, readOutreachStatus } from './types'
import type { OutreachChannel, OutreachFailure, OutreachKind, OutreachStatus } from './types'

/** Both handler strings are clamped on the way in: see `MAX_OUTREACH_DETAIL`. */
export function clamp(value: string, max: number): string {
  const trimmed = value.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

/**
 * The account a claim is made against — the id it points at and the address it records.
 *
 * Two fields and not `OutreachAccount`, which structurally satisfies this: the claim needs
 * neither the eligibility facts nor the name, and a type that carries them would suggest this
 * module has an opinion about them. `sendGiftNotice` has read its own row and passes what it
 * has.
 */
export interface ClaimTarget {
  accountId: number
  ownerEmail: string
}

/**
 * One row standing in the way of a claim — not the screen's `OutreachRow`, deliberately: the
 * only questions asked of it are the three the verdict below is made from, and a type that
 * carries no more than that cannot be read as the row an operator sees.
 */
export interface OccurrenceClaim {
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
export async function claimsForOccurrence(
  target: ClaimTarget,
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
        or(eq(outreachActions.accountId, target.accountId), eq(outreachActions.accountOwnerEmail, target.ownerEmail)),
      ),
    )

  return rows.map((row) => ({
    id: row.id,
    status: readOutreachStatus(row.status),
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    own: row.accountId === target.accountId,
  }))
}

/** Either «take this row over» or «refuse», the latter naming the row where there is one. */
export type ClaimVerdict = { takeOver: number } | { reason: OutreachFailure; row: number | null }

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
export function claimVerdict(claims: readonly OccurrenceClaim[], now: Date): ClaimVerdict {
  if (claims.some((claim) => claim.status === 'done')) return { reason: 'already-done', row: null }

  const mine = claims.find((claim) => claim.own)
  if (mine === undefined) return { reason: 'already-done', row: null }

  if (mine.status === 'pending') {
    const started = mine.lastAttemptAt === null ? null : Date.parse(mine.lastAttemptAt)
    if (started !== null && now.getTime() - started < STALE_ATTEMPT_MS) {
      /* The row is named even while the answer is «no», because a *skip* during a live attempt
         is allowed and needs it — see `suppressOutreach`. A run is not. */
      return { reason: 'in-flight', row: mine.id }
    }
  }

  return { takeOver: mine.id }
}

/**
 * Take the occurrence, or say why it could not be taken — the statement every send in this
 * feature stands behind.
 *
 * Answers the id of a row that is now `pending` and belongs to the caller, who may go and
 * deliver. Both paths into that are here rather than at the call site: the insert that wins,
 * and the compare-and-swap that takes over a row left by an attempt that failed, was skipped,
 * or died. A caller that got only the insert would be correct until the first retry.
 *
 * `triggeredBy` is `'system'` for anything a schedule or a request path runs on its own, and
 * an operator's address for anything run by hand. Recorded, never checked: authorisation
 * belongs to the server action, and this is reachable from a context with no session at all.
 */
export async function claimOccurrence(
  target: ClaimTarget,
  kind: OutreachKind,
  occurrenceKey: string,
  channel: OutreachChannel,
  triggeredBy: string,
  now: Date,
): Promise<{ ok: true; id: number } | { ok: false; reason: OutreachFailure }> {
  try {
    const claimed = await db()
      .insert(outreachActions)
      .values({
        accountId: target.accountId,
        accountOwnerEmail: target.ownerEmail,
        kind,
        occurrenceKey,
        status: 'pending',
        channel,
        attempts: 1,
        lastAttemptAt: now,
        triggeredBy,
      })
      /* No conflict target: either index may be the one that refuses, and the verdict below
         tells them apart by looking at what is actually there. */
      .onConflictDoNothing()
      .returning({ id: outreachActions.id })

    const fresh = claimed[0]
    if (fresh !== undefined) return { ok: true, id: fresh.id }

    const verdict = claimVerdict(await claimsForOccurrence(target, kind, occurrenceKey), now)
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
    return retried === undefined ? { ok: false, reason: 'already-done' } : { ok: true, id: retried.id }
  } catch (error) {
    console.error('claimOccurrence failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Writes the outcome onto the claimed row.
 *
 * Never throws: the delivery has already happened by the time this is called, and a failure to
 * record it must not be reported to the caller as a failure to deliver. It is logged and the
 * row stays `pending`, which reads as «started, never settled» on the screen — see `run.ts`'
 * own header on why that state exists at all.
 */
export async function settle(id: number, delivery: OutreachDelivery, now: Date): Promise<void> {
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
