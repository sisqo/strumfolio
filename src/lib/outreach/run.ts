/**
 * The writes: claiming an occurrence, dispatching it, recording what happened, and skipping
 * one by hand.
 *
 * **The claim is an insert, and it happens before anything is sent.** Every guarantee this
 * feature makes rests on that one ordering, which now lives in `claim.ts` — extracted when a
 * second caller appeared (`sendGiftNotice`, which composes its own message and so cannot go
 * through `runOutreach`). Read that file for the rule; what remains here is the shape of a
 * run: check, claim, dispatch, settle.
 *
 * The price of that ordering is stated where it lands rather than hidden: a delivery whose
 * outcome cannot be written back leaves a `pending` row, so the engine knows something started
 * and not whether it arrived. `STALE_ATTEMPT_MS` (`types.ts`) is where that is dealt with, and
 * it is deliberately dealt with by an operator and not by a rule.
 *
 * A plain module, no `'use server'`: `actions.ts` owns the directive and the owner check, and
 * these functions are also the seam a schedule would call — see `runDueOutreach`.
 */

import { and, eq, ne } from 'drizzle-orm'

import { db, hasDatabase } from '@/lib/db/client'
import { outreachActions } from '@/lib/db/schema'

import { claimOccurrence, claimVerdict, claimsForOccurrence, clamp, settle } from './claim'
import { eligibilityFor } from './eligibility'
import { HANDLERS } from './handlers'
import type { OutreachDelivery, OutreachTarget } from './handlers'
import { occurrenceKeyFor } from './occurrence'
import { outreachAccountFor, outreachViewFor, dueKinds } from './read'
import type { OutreachAccount } from './read'
import { MAX_OUTREACH_REASON, OUTREACH } from './types'
import type { OutreachFailure, OutreachKind, OutreachResult } from './types'

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

  const claim = await claimOccurrence(account, kind, occurrenceKey, definition.channel, triggeredBy, now)
  if (!claim.ok) return { ok: false, reason: claim.reason }

  let delivery: OutreachDelivery
  try {
    delivery = await handler(targetFor(account, occurrenceKey))
  } catch (error) {
    /* A handler that threw is a failed delivery and not a failed run: the claim stands, the row
       says why, and it stays retryable. */
    console.error(`outreach handler ${kind} threw`, error)
    delivery = { ok: false, reason: 'The handler threw. See the server log.' }
  }

  await settle(claim.id, delivery, now)

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
    /*
     * An in-flight attempt is **not** a reason to refuse a skip — it is the most likely moment
     * somebody wants one — so that verdict is taken over rather than reported, which is what
     * `row` is carried for. A completed occurrence is a refusal: there is nothing left to
     * prevent. The compare-and-swap below is what keeps the takeover safe either way; if the
     * live attempt settles as `done` first, it wins and this answers `already-done`.
     */
    const id =
      'takeOver' in verdict ? verdict.takeOver : verdict.reason === 'in-flight' ? verdict.row : null
    if (id === null) {
      return { ok: false, reason: 'takeOver' in verdict ? 'failed' : verdict.reason }
    }

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
