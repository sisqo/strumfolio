/**
 * Writing a verified Paddle event into the account it belongs to.
 *
 * The rules live in `webhook.ts` and are tested there; this is the database half. It writes
 * the same `plan`/`planStatus`/`planExpiresAt`/`pendingPlan`/`pendingCycle` columns the mock
 * checkout writes — `checkout.ts`'s header is the description of this file's job, written
 * before it existed — plus the two `paddle_*` id columns the mock deliberately never touches,
 * which are exactly what lets the *next* event find this account without a `custom_data` stamp.
 *
 * **It never touches the `granted*` columns**, and that is the same standing decision
 * `mockPurchase` records: a gift lives in those columns, and a renewal re-asserting
 * `plan`/`planStatus` over them would silently erase it. `setGrant` is the only writer there.
 *
 * **Idempotency is the primary key and not a second ledger.** `paddle_events.event_id` is the
 * PK and Paddle re-sends the same `event_id` on every retry, so the insert *is* the dedup:
 * `onConflictDoNothing` returning no row means this event has already been applied, and the
 * route answers 200 so Paddle stops retrying. Everything happens in one transaction, so an
 * event can never be recorded as handled by a delivery whose write then failed — the retry
 * would otherwise find the row present, conclude "already applied", and the account would
 * never be updated at all.
 *
 * The event is recorded **whether or not** an account was found. A payment that arrives for
 * nobody is precisely the thing worth having a row for, and `paddle_events`' own schema
 * comment says so: «the ledger's job is to have the event, not to have understood it».
 */

import { eq } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { accounts, paddleEvents } from '@/lib/db/schema'

import { subscriptionEffect, transactionEffect, type AccountRef, type PaddleEventEffect } from './webhook'

/** What the route hands over, already verified and deserialised. */
export interface IncomingPaddleEvent {
  eventId: string
  eventType: string
  occurredAt: Date | null
  data: unknown
}

export type ApplyOutcome =
  /** Columns written, or the event was recorded and said nothing about a subscription. */
  | 'applied'
  /** This `event_id` had already been handled — a retry. Still a 200. */
  | 'duplicate'
  /** Recorded, but no account here answers to it. Still a 200: retrying will not find one. */
  | 'unmatched'

function effectOf(event: IncomingPaddleEvent): PaddleEventEffect | null {
  const data = event.data as never

  if (event.eventType.startsWith('subscription.')) return subscriptionEffect(data)
  if (event.eventType === 'transaction.completed') return transactionEffect(data)

  return null
}

/**
 * The account this event belongs to, tried in the order of what a *first* purchase can
 * possibly carry: the stamp the checkout put on the transaction, then either id column a
 * previous event will have written.
 */
async function findAccount(ref: AccountRef) {
  const columns = { id: accounts.id, ownerEmail: accounts.ownerEmail }

  if (ref.accountId !== null) {
    const [row] = await db().select(columns).from(accounts).where(eq(accounts.id, ref.accountId)).limit(1)
    if (row) return row
  }

  if (ref.paddleSubscriptionId !== null) {
    const [row] = await db()
      .select(columns)
      .from(accounts)
      .where(eq(accounts.paddleSubscriptionId, ref.paddleSubscriptionId))
      .limit(1)
    if (row) return row
  }

  if (ref.paddleCustomerId !== null) {
    const [row] = await db()
      .select(columns)
      .from(accounts)
      .where(eq(accounts.paddleCustomerId, ref.paddleCustomerId))
      .limit(1)
    if (row) return row
  }

  return null
}

export async function applyPaddleEvent(event: IncomingPaddleEvent, rawBody: string): Promise<ApplyOutcome> {
  const effect = effectOf(event)
  const account = effect ? await findAccount(effect.account) : null

  return db().transaction(async (tx) => {
    const recorded = await tx
      .insert(paddleEvents)
      .values({
        eventId: event.eventId,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        /* Both columns, and not redundant: the address is the historical fact of who this
           arrived for, the id is the pointer every read uses. `logMockEvent` says the same. */
        accountOwnerEmail: account?.ownerEmail ?? null,
        accountId: account?.id ?? null,
        paddleSubscriptionId: effect?.account.paddleSubscriptionId ?? null,
        /* Paddle's own bytes, not a re-serialisation: the payload is evidence, and the day a
           mapping turns out to be wrong this is what the correction is replayed from. */
        payload: rawBody,
      })
      .onConflictDoNothing({ target: paddleEvents.eventId })
      .returning({ eventId: paddleEvents.eventId })

    if (recorded.length === 0) return 'duplicate'
    if (!effect || !account) return effect && !account ? 'unmatched' : 'applied'

    if (effect.columns) {
      await tx
        .update(accounts)
        .set({
          plan: effect.columns.plan,
          planStatus: effect.columns.status,
          planExpiresAt: effect.columns.expiresAt,
          pendingPlan: effect.columns.pendingPlan,
          pendingCycle: effect.columns.pendingCycle,
          paddleCustomerId: effect.account.paddleCustomerId,
          paddleSubscriptionId: effect.account.paddleSubscriptionId,
        })
        .where(eq(accounts.id, account.id))
    }

    return 'applied'
  })
}
