/**
 * One MCP write at a time per account, so each one counts the account as the last one left it.
 *
 * **Why it exists — measured, not argued** (2026-09-27): the caps are read before a write and
 * the row is inserted in a transaction of its own (`saveSong`'s own comment calls it «raceable»),
 * so ten `create_song` calls in parallel against an account with one song of room left all
 * passed, and a Standard account ended at 309 songs of 300. The app accepts that race because a
 * person pressing buttons cannot reach it; an assistant that runs tools in parallel reaches it by
 * default. Serialising the MCP writes makes each one read a count that includes the last, which
 * is the whole fix — the gate itself is unchanged.
 *
 * **A row in `rate_limit_hits`, not an advisory lock.** Production reaches Neon through a
 * pooler in transaction mode, where a session lock is released or kept by whoever holds the
 * connection next; a row with a timestamp works across instances and needs no migration. The
 * key `mcp-write:<account id>` cannot collide with a rate-limit key, and `purgeStaleHits`
 * deletes only rows a day old, so it never frees a live lease. A lease older than `LEASE_MS` is
 * taken over, so a crashed call cannot lock an account for more than that.
 */

import { and, eq, lt, sql } from 'drizzle-orm'

import { db, hasDatabase } from '@/lib/db/client'
import { rateLimitHits } from '@/lib/db/schema'

const LEASE_MS = 30_000
/* A queued call waits up to a minute: ten writes in a row took ~30 s from this VM to Neon, and a
   refusal after a wait is a worse answer than a slow success. */
const WAIT_MS = 60_000
const STEP_MS = 250

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Runs `work` holding the account's write lease, or answers `'busy'` after `WAIT_MS`. */
export async function withAccountLease<T>(accountId: number, work: () => Promise<T>): Promise<T | 'busy'> {
  if (!hasDatabase) return work()

  const key = `mcp-write:${accountId}`
  const deadline = Date.now() + WAIT_MS
  let held: Date | null = null

  try {
    while (held === null) {
      /* A millisecond `Date`, written and compared as itself, so the release below finds exactly
         this lease and never a successor's. */
      const now = new Date()
      const stale = new Date(now.getTime() - LEASE_MS)
      const rows = await db()
        .insert(rateLimitHits)
        .values({ key, windowStart: now, count: 1 })
        .onConflictDoUpdate({
          target: rateLimitHits.key,
          set: { windowStart: now, count: 1 },
          setWhere: lt(rateLimitHits.windowStart, stale),
        })
        .returning({ windowStart: rateLimitHits.windowStart })

      if (rows.length > 0) {
        held = now
        break
      }
      if (Date.now() >= deadline) return 'busy'
      await sleep(STEP_MS)
    }
  } catch (error) {
    /* Fails open like the rate limit it borrows the table from: the write itself still meets
       every gate, and an unreadable table must not stop every assistant at once. */
    console.error('mcp lease failed', error)
    return work()
  }

  try {
    return await work()
  } finally {
    await db()
      .delete(rateLimitHits)
      .where(and(eq(rateLimitHits.key, key), eq(rateLimitHits.windowStart, sql`${held.toISOString()}::timestamptz`)))
      .catch((error) => console.error('mcp lease release failed', error))
  }
}
