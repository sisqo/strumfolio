/**
 * A fixed-window rate limit, backed by `rateLimitHits` rather than a service of its own
 * (v3.2) — one shared table for registration, resend, password
 * recovery and login, keyed by whatever the caller is throttling: an email for an
 * action tied to an address, an IP for one that is not.
 *
 * Read-then-write, not one atomic statement: there is a window between the `select` and
 * the `insert`/`update` where two requests racing on the same key could both read "room
 * left" and both be let through, one attempt over the limit. Acceptable for a deterrent
 * against abuse — the cost of a false negative is one extra email, not a broken
 * guarantee — not something a security boundary could tolerate.
 */

import { eq, lt } from 'drizzle-orm'
import { headers } from 'next/headers'

import { db, hasDatabase } from '@/lib/db/client'
import { rateLimitHits } from '@/lib/db/schema'

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
  const forwardedFor = (await headers()).get('x-forwarded-for')
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
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/** True when the request is allowed to proceed; false once `limit` is reached within `windowMs`. */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (!hasDatabase) return true

  try {
    const now = new Date()
    await purgeStaleHits(now)

    const rows = await db()
      .select({ windowStart: rateLimitHits.windowStart, count: rateLimitHits.count })
      .from(rateLimitHits)
      .where(eq(rateLimitHits.key, key))
      .limit(1)

    const existing = rows[0]
    const windowExpired = existing !== undefined && now.getTime() - existing.windowStart.getTime() >= windowMs

    if (existing === undefined || windowExpired) {
      await db()
        .insert(rateLimitHits)
        .values({ key, windowStart: now, count: 1 })
        .onConflictDoUpdate({
          target: rateLimitHits.key,
          set: { windowStart: now, count: 1 },
        })
      return true
    }

    if (existing.count < limit) {
      await db()
        .update(rateLimitHits)
        .set({ count: existing.count + 1 })
        .where(eq(rateLimitHits.key, key))
      return true
    }

    return false
  } catch (error) {
    // Fails open, like the rest of this feature without a database: a query that cannot
    // be read must not turn a deterrent into an outage for every legitimate request behind it.
    console.error('checkRateLimit failed', error)
    return true
  }
}
