/**
 * What `/accounts` needs to draw the two courtesy icons on every row — the `listAccountPlans`
 * shape: one query, keyed by address, joined into the list page the same way `plans` already
 * is.
 *
 * A plain module, no `'use server'` — called from a server component (`/accounts`'s
 * `page.tsx`), which needs no directive to call an async function directly.
 */

import { inArray } from 'drizzle-orm'

import { auth } from '@/auth'
import { isOwner } from '@/lib/allowlist'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts, outreachActions } from '@/lib/db/schema'

export interface CourtesyStatus {
  thanksSent: boolean
  checkinSent: boolean
  optedOut: boolean
}

/**
 * Every account's courtesy status, in one map — `null` on no database or a failed read, the
 * same convention `listAccountPlans` and `listAllAccounts` both follow, so `/accounts` can tell
 * "nothing to show" apart from "could not read."
 *
 * **Two reads, not one.** `accounts.courtesy_opted_out_at` and `outreach_actions` are separate
 * tables, merged here the way `outreachAccountFor` already merges `accounts` with a separate
 * `newsletter_prefs` read — one table cannot answer both halves of this question.
 *
 * Re-checks `isOwner` itself, the `listAllAccounts` discipline: `/accounts`'s own page gate is
 * a courtesy to the reader, never the fence.
 */
export async function listCourtesyStatus(): Promise<Map<string, CourtesyStatus> | null> {
  if (!hasDatabase) return null

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) return null

  try {
    const accountRows = await db()
      .select({ ownerEmail: accounts.ownerEmail, courtesyOptedOutAt: accounts.courtesyOptedOutAt })
      .from(accounts)

    const result = new Map<string, CourtesyStatus>(
      accountRows.map((row) => [row.ownerEmail, { thanksSent: false, checkinSent: false, optedOut: row.courtesyOptedOutAt !== null }]),
    )

    /*
     * `status = 'done'` only, matching the settled-row-is-the-only-truth rule the outreach
     * engine already states: a `failed` or a stale `pending` row must read as "not sent" here,
     * because clicking the icon again is exactly what re-enters `claimOccurrence`'s
     * compare-and-swap and retries it.
     *
     * **Grouped by `account_owner_email`, not `account_id`.** `claimVerdict`'s rule 2 treats a
     * row matching only by address (no matching `accountId`, e.g. after the account behind it
     * was deleted and recreated) as `already-done` — the anti-farming guarantee this schema's
     * two unique indexes exist for. Reading by `accountId` instead would show an icon as "not
     * sent" for an address the send action would actually refuse, the same "screen lies"
     * failure `OutreachLine.inFlight` was built to avoid, in a new place.
     */
    const rows = await db()
      .select({ kind: outreachActions.kind, accountOwnerEmail: outreachActions.accountOwnerEmail, status: outreachActions.status })
      .from(outreachActions)
      .where(inArray(outreachActions.kind, ['courtesy_thanks', 'courtesy_checkin']))

    for (const row of rows) {
      if (row.status !== 'done') continue
      const entry = result.get(row.accountOwnerEmail)
      if (entry === undefined) continue
      if (row.kind === 'courtesy_thanks') entry.thanksSent = true
      else if (row.kind === 'courtesy_checkin') entry.checkinSent = true
    }

    return result
  } catch (error) {
    console.error('listCourtesyStatus failed', error)
    return null
  }
}
