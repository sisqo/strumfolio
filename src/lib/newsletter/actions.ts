'use server'

/**
 * A reader's own newsletter preference — subscribe/unsubscribe, and which cadence
 * while subscribed (`PLAN-newsletter.md`). A file of its own, not folded into
 * `accounts/actions.ts`: a table of its own justifies it, same principle that already
 * keeps `checkout.ts` separate from the rest of `plans/`.
 *
 * Not read or written through `usePrefs()`/`prefsQueue` (`PrefsProvider.tsx`) — that
 * channel is wired specifically to `userPrefs`'s columns, built for reading
 * preferences that change often and sync optimistically (zoom, notation).
 * Subscribing is a rare, deliberate action, so this reads and writes with a direct
 * server action instead, the same pattern `loadOwnName`/`updateOwnName` already use.
 */

import { eq } from 'drizzle-orm'

import { auth } from '@/auth'
import { isOwner, normalizeEmail } from '@/lib/allowlist'
import { db, hasDatabase } from '@/lib/db/client'
import { accountIdOf } from '@/lib/db/ids'
import { newsletterPrefs } from '@/lib/db/schema'

import { nextStamps } from './stamps'
import type { NewsletterFrequency, NewsletterPrefs, NewsletterResult, NewsletterSummary } from './types'

const DEFAULT_PREFS: NewsletterPrefs = { subscribed: false, frequency: 'monthly' }

/**
 * Your own newsletter preference, for the Settings view to prefill. `null` only when
 * nobody is signed in — a missing row (never provisioned, or that insert failed) reads
 * as `DEFAULT_PREFS`, same "no row = default" treatment `newsletterPrefs`'s own schema
 * comment describes.
 */
export async function loadNewsletterPrefs(): Promise<NewsletterPrefs | null> {
  if (!hasDatabase) return null

  const session = await auth()
  const email = session?.user?.email
  if (!email) return null

  const rows = await db()
    .select({ subscribed: newsletterPrefs.subscribed, frequency: newsletterPrefs.frequency })
    .from(newsletterPrefs)
    .where(eq(newsletterPrefs.accountId, accountIdOf(normalizeEmail(email))))
    .limit(1)

  const row = rows[0]
  if (row === undefined) return DEFAULT_PREFS
  return { subscribed: row.subscribed, frequency: row.frequency as NewsletterFrequency }
}

/**
 * Changes your own newsletter preference. Keyed on the signed-in address itself, never
 * `accountOwnerEmail` — the same choice `updateOwnName` makes for the same reason: this
 * is a fact about *you*, not about whichever account a global owner has switched into.
 *
 * An upsert, not a plain `UPDATE`: the row can legitimately be missing (the insert in
 * `provisionAccount` failed, or an account predates the `0035` migration and was
 * somehow never backfilled). A bare `UPDATE` against an absent row touches nothing and
 * still reports success, leaving the toggle look like it worked while nothing saved.
 */
export async function updateNewsletterPrefs(
  subscribed: boolean,
  frequency: NewsletterFrequency,
): Promise<NewsletterResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  const email = session?.user?.email
  if (!email) return { ok: false, reason: 'no-session' }

  const ownerEmail = normalizeEmail(email)
  const now = new Date()

  try {
    const existing = await loadRow(ownerEmail)
    const { subscribedAt, unsubscribedAt } = nextStamps(existing?.subscribed ?? null, subscribed, now)

    await db()
      .insert(newsletterPrefs)
      .values({
        accountId: accountIdOf(ownerEmail),
        subscribed,
        frequency,
        subscribedAt: subscribedAt ?? null,
        unsubscribedAt: unsubscribedAt ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: newsletterPrefs.accountId,
        set: {
          subscribed,
          frequency,
          ...(subscribedAt !== undefined ? { subscribedAt } : {}),
          ...(unsubscribedAt !== undefined ? { unsubscribedAt } : {}),
          updatedAt: now,
        },
      })
    return { ok: true }
  } catch (error) {
    console.error('updateNewsletterPrefs failed', error)
    return { ok: false, reason: 'failed' }
  }
}

async function loadRow(ownerEmail: string): Promise<{ subscribed: boolean } | null> {
  const rows = await db()
    .select({ subscribed: newsletterPrefs.subscribed })
    .from(newsletterPrefs)
    .where(eq(newsletterPrefs.accountId, accountIdOf(ownerEmail)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * One account's newsletter preference, for the admin's Newsletter fieldset on
 * `/accounts/[email]` (`PLAN-account-admin.md`, point 7) — distinct from
 * `loadNewsletterPrefs` above, which is keyed on `session.user.email` and would leak the
 * *operator's own* preference instead of the account being viewed. `isOwner`-gated,
 * since this takes an explicit target rather than reading the caller's own session.
 *
 * Null on refusal or a failed read (e.g. `0035` not yet applied where this runs) — the
 * caller shows "data unavailable" for this one fieldset instead of losing the rest of
 * the page, the same resilience `usageSummaryFor` (`accounts/read.ts`) practices.
 */
export async function loadNewsletterSummaryFor(ownerEmail: string): Promise<NewsletterSummary | null> {
  if (!hasDatabase) return null

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) return null

  try {
    const rows = await db()
      .select({
        subscribed: newsletterPrefs.subscribed,
        frequency: newsletterPrefs.frequency,
        subscribedAt: newsletterPrefs.subscribedAt,
        unsubscribedAt: newsletterPrefs.unsubscribedAt,
      })
      .from(newsletterPrefs)
      .where(eq(newsletterPrefs.accountId, accountIdOf(normalizeEmail(ownerEmail))))
      .limit(1)

    const row = rows[0]
    if (row === undefined) {
      return { subscribed: false, frequency: 'monthly', subscribedAt: null, unsubscribedAt: null }
    }
    return {
      subscribed: row.subscribed,
      frequency: row.frequency as NewsletterFrequency,
      subscribedAt: row.subscribedAt?.toISOString() ?? null,
      unsubscribedAt: row.unsubscribedAt?.toISOString() ?? null,
    }
  } catch (error) {
    console.error('loadNewsletterSummaryFor failed', error)
    return null
  }
}
