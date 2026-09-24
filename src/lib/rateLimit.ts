/**
 * A fixed-window rate limit, backed by `rateLimitHits` rather than a service of its own
 * (v3.2) — one shared table for registration, resend, password
 * recovery and login, keyed by whatever the caller is throttling: an email for an
 * action tied to an address, an IP for one that is not.
 *
 * One atomic upsert per attempt (see `checkRateLimit`), because login is behind it and a
 * login limit is a security boundary. It used to be read-then-write, described here as «one
 * attempt over the limit» at worst — which was true of two racing requests and false of fifty.
 */

import { lt, sql } from 'drizzle-orm'
import { headers } from 'next/headers'

import { db, hasDatabase } from '@/lib/db/client'
import { rateLimitHits } from '@/lib/db/schema'
import { linkOrigin } from '@/lib/origin'

/**
 * How long a row may outlive the window it measured before it is deleted. Every caller's
 * window is ten minutes, so a day never touches a live window — and it is the figure the
 * Privacy Policy states (§6: an IP address or email address in these counters is deleted
 * within a day), so the two must move together.
 */
const PURGE_AFTER_MS = 24 * 60 * 60 * 1000

/** How often one process bothers to purge — see `purgeStaleHits`. */
const PURGE_EVERY_MS = 60 * 60 * 1000

let lastPurgeAt = 0

/**
 * Deletes the rows whose window closed more than `PURGE_AFTER_MS` ago.
 *
 * Until 2026-09-03 nothing ever removed a row from this table: a key was overwritten by
 * the next hit on the same key and otherwise kept for good, so every IP address that ever
 * tried to sign in stayed here indefinitely — a retention the Privacy Policy could not
 * honestly describe. There is no cron anywhere in this repo (CLAUDE.md), so the purge runs
 * here, at read time, the same way `resolveSubscription` collapses an expired plan at the
 * moment somebody asks. Once an hour per process rather than on every call: a serverless
 * instance is short-lived, so in practice this is once per instance, and a sign-in attempt
 * does not pay for a DELETE it did not need. Fails silently, like `checkRateLimit` itself:
 * a purge that cannot run must never decide whether a request goes through.
 */
async function purgeStaleHits(now: Date): Promise<void> {
  if (now.getTime() - lastPurgeAt < PURGE_EVERY_MS) return
  lastPurgeAt = now.getTime()

  try {
    await db()
      .delete(rateLimitHits)
      .where(lt(rateLimitHits.windowStart, new Date(now.getTime() - PURGE_AFTER_MS)))
  } catch (error) {
    console.error('purgeStaleHits failed', error)
  }
}

/**
 * The caller's address, Vercel's way (first hop in `x-forwarded-for`), or null with no
 * proxy in front. Lives here, not in any one `'use server'` action file, because every
 * surface this rate limit protects — registration, resend, password recovery — needs the
 * same three lines, and a `'use server'` module cannot export it: every export of one
 * must be an async action, and this is a helper, not something a client should ever call.
 */
export async function requestIp(): Promise<string | null> {
  const h = await headers()
  /* Vercel's own header first: it sets it itself and a client cannot, where `x-forwarded-for`
     is trustworthy only because Vercel happens to overwrite it — true today, not a promise any
     other host makes. */
  const forwardedFor = h.get('x-vercel-forwarded-for') ?? h.get('x-forwarded-for')
  return forwardedFor?.split(',')[0]?.trim() || null
}

/**
 * The origin this request actually arrived on — the same `Host`-header derivation
 * NextAuth's own `trustHost` uses (see CLAUDE.md on `AUTH_URL`), so a verification or
 * password-reset link tracks whatever domain is live instead of going stale on the next
 * domain move, which is exactly what happened when `AUTH_URL` was removed from
 * Production on 2026-08-21 and these links silently fell back to `http://localhost:3000`.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers()
  /* Checked against the hosts this installation answers on — `linkOrigin` has the reason. */
  return linkOrigin(h.get('x-forwarded-host') ?? h.get('host'), h.get('x-forwarded-proto'))
}

/** True when the request is allowed to proceed; false once `limit` is reached within `windowMs`. */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (!hasDatabase) return true

  try {
    const now = new Date()
    await purgeStaleHits(now)

    /*
     * One statement: the window reset, the increment and the answer happen together under the
     * row's lock, so N requests racing on one key get N different counts back. The first
     * version read the count, decided, and then wrote `count + 1` as a *value* — so a batch of
     * fifty parallel sign-in attempts all read the same count, all passed, and all wrote the
     * same next number: the limit of ten became roughly five hundred.
     *
     * A refused attempt still increments. That changes nothing about when the window ends —
     * `window_start` only moves when it has expired — and a counter that stopped at the limit
     * is what made the read-then-write shape necessary in the first place.
     */
    const windowStart = sql`${now.toISOString()}::timestamptz`
    const expired = sql`${rateLimitHits.windowStart} <= ${windowStart} - make_interval(secs => ${windowMs / 1000})`

    const rows = await db()
      .insert(rateLimitHits)
      .values({ key, windowStart: now, count: 1 })
      .onConflictDoUpdate({
        target: rateLimitHits.key,
        set: {
          windowStart: sql`case when ${expired} then ${windowStart} else ${rateLimitHits.windowStart} end`,
          count: sql`case when ${expired} then 1 else ${rateLimitHits.count} + 1 end`,
        },
      })
      .returning({ count: rateLimitHits.count })

    const count = rows[0]?.count
    return count === undefined || count <= limit
  } catch (error) {
    // Fails open, like the rest of this feature without a database: a query that cannot
    // be read must not turn a deterrent into an outage for every legitimate request behind it.
    console.error('checkRateLimit failed', error)
    return true
  }
}
