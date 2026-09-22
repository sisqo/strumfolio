/**
 * Which account a guest's token grants a read of — the one question `./guestReads` asks first.
 *
 * **A plain module on purpose, and not a line in `session.ts`.** That file carries
 * `'use server'`, so every function it exports is an action a browser can call by id; this one
 * answers with the broadcaster's **email address**, and the token it takes is handed to
 * strangers by QR code and WhatsApp. Exported from there, a follower holding the link could ask
 * for the leader's address directly. Imported from here by `guestReads.ts`, it is a step inside
 * those actions and never an endpoint of its own — `redeemable.ts`' reason for leaving
 * `checkout.ts`.
 */

import { eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { db, hasDatabase } from '@/lib/db/client'
import { accounts, singAlongSessions } from '@/lib/db/schema'

/**
 * How long a broadcast survives with nobody at the wheel.
 *
 * Long enough to outlast a set's intermission, short enough that a link shared once
 * and forgotten does not stay a standing, unauthenticated way to read the whole
 * repertoire for weeks.
 */
export const IDLE_HOURS = 8

const broadcastAccount = alias(accounts, 'broadcast_account')

/**
 * The account whose repertoire the token's live broadcast is showing, or null when the token
 * does not resolve to one that is still fresh. Every guest read is scoped to this and nothing
 * wider — a token proves the broadcaster started a broadcast, not that a stranger may browse
 * every account in the installation.
 */
export async function broadcastAccountForToken(token: string): Promise<string | null> {
  if (!hasDatabase) return null

  const rows = await db()
    .select({ email: broadcastAccount.ownerEmail, lastActiveAt: singAlongSessions.lastActiveAt })
    .from(singAlongSessions)
    .innerJoin(broadcastAccount, eq(singAlongSessions.broadcastAccountId, broadcastAccount.id))
    .where(eq(singAlongSessions.token, token))
    .limit(1)

  const row = rows[0]
  if (row === undefined || Date.now() - row.lastActiveAt.getTime() > IDLE_HOURS * 60 * 60 * 1000) return null
  return row.email
}
