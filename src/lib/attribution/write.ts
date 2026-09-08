/**
 * The database half of attribution: the two writes, and the four seams that call them.
 *
 * A plain module and not `'use server'`, `coupons/views.ts`' own arrangement — every caller is
 * already server-side (`register`, `verifyEmail`, `confirmPendingRegistration`, the `signIn`
 * callback) and none of them arrives from a browser on its own.
 *
 * **Only two of the four seams read the cookie, and that is not an oversight to tidy up.**
 * `recordLeadAttribution` reads it, because it runs in the lead's own browser;
 * `freezeLeadAttribution` matches by address and fills the pointer, nothing more. The reasons
 * are specific:
 *
 * - `confirmPendingRegistration` runs in the **operator's** browser. Reading the cookie there
 *   would attribute the lead to whatever campaign the admin last clicked.
 * - `verifyEmail` runs in the reader's own browser but not necessarily the same one: a
 *   verification link is very often opened on another device, where this cookie has never
 *   existed. It must not depend on finding one.
 *
 * **Nothing here throws.** A registration or a sign-in must succeed even if this bookkeeping
 * trips — the standing rule `recordSignIn`, `provisionAccount` and `attachCouponViewFromCookie`
 * all already follow. A lead with no attribution is a hole in a statistic; a registration that
 * fails because a marketing insert did is a customer lost.
 */

import { and, eq, isNull } from 'drizzle-orm'
import { cookies } from 'next/headers'

import { db, hasDatabase } from '@/lib/db/client'
import { accounts, leadAttribution } from '@/lib/db/schema'

import { ATTRIBUTION_COOKIE, decodeAttribution, effectiveLastTouch } from './touch'
import type { Touch } from './touch'

/** The `first_*` columns, as a touch fills them. */
function firstColumns(touch: Touch) {
  return {
    firstSource: touch.source,
    firstMedium: touch.medium,
    firstCampaign: touch.campaign,
    firstTerm: touch.term,
    firstContent: touch.content,
    firstClickIdKind: touch.clickIdKind,
    firstClickId: touch.clickId,
    firstRefererHost: touch.refererHost,
    firstLandingPath: touch.landingPath,
    firstTouchAt: new Date(touch.at),
  }
}

/** The `last_*` columns. `null` writes them all empty, which is what «one provenance» looks like. */
function lastColumns(touch: Touch | null) {
  return {
    lastSource: touch?.source ?? null,
    lastMedium: touch?.medium ?? null,
    lastCampaign: touch?.campaign ?? null,
    lastTerm: touch?.term ?? null,
    lastContent: touch?.content ?? null,
    lastClickIdKind: touch?.clickIdKind ?? null,
    lastClickId: touch?.clickId ?? null,
    lastRefererHost: touch?.refererHost ?? null,
    lastLandingPath: touch?.landingPath ?? null,
    lastTouchAt: touch === null ? null : new Date(touch.at),
  }
}

/** Whether a stored row's first touch says the same thing as one carried in a cookie. */
function matchesStoredFirst(stored: { firstSource: string | null; firstCampaign: string | null; firstLandingPath: string | null }, touch: Touch): boolean {
  return stored.firstSource === touch.source && stored.firstCampaign === touch.campaign && stored.firstLandingPath === touch.landingPath
}

/**
 * Record the arrival this browser was carrying, against an address that has just been given.
 *
 * **Seam 1 — `register()`**, in the same action that writes `pendingRegistrations`, and **the
 * first half of seam 4**, the Google sign-up. Both are the moment an address stops being
 * anonymous, which is the moment there is something for a row to be about.
 *
 * A row is written **only when the cookie actually carries an arrival**. A visitor who came
 * straight to the site, from no campaign and no referring page, gets no row — and `/leads`
 * counts them in a line of its own rather than inventing a channel for them.
 *
 * **`first_*` is written once and never rewritten.** The conflict branch is not an upsert of the
 * whole row: a second registration on a still-open address refines only the *last* touch, so
 * the campaign that discovered somebody survives them registering again from somewhere else —
 * `coupon_views.first_seen_at` keeps its date the same way. When the newest provenance merely
 * repeats what is already stored, nothing is written at all, which is what keeps `last_touch_at
 * IS NULL` meaning «one provenance, ever».
 *
 * The insert carries a bare `ON CONFLICT DO NOTHING` rather than naming
 * `lead_attribution_open`'s partial predicate. Two registrations racing on one address is the
 * only thing it has to survive, and the loser having written nothing is the correct outcome —
 * the index is what makes «one open row per address» true, and not naming its `WHERE` here
 * avoids the hazard `coupon_views_once` documents, where one character of difference makes
 * every write fail on a path that logs and carries on.
 */
export async function recordLeadAttribution(email: string): Promise<void> {
  if (!hasDatabase) return

  try {
    const attribution = decodeAttribution((await cookies()).get(ATTRIBUTION_COOKIE)?.value)
    if (attribution === null) return

    const open = await db()
      .select({
        id: leadAttribution.id,
        firstSource: leadAttribution.firstSource,
        firstCampaign: leadAttribution.firstCampaign,
        firstLandingPath: leadAttribution.firstLandingPath,
        lastTouchAt: leadAttribution.lastTouchAt,
        lastSource: leadAttribution.lastSource,
        lastCampaign: leadAttribution.lastCampaign,
      })
      .from(leadAttribution)
      .where(and(eq(leadAttribution.email, email), isNull(leadAttribution.accountId)))
      .limit(1)

    const row = open[0]

    if (row === undefined) {
      await db()
        .insert(leadAttribution)
        .values({ email, ...firstColumns(attribution.first), ...lastColumns(attribution.last) })
        .onConflictDoNothing()
      return
    }

    const newest = effectiveLastTouch(attribution)

    /* Already the whole of what this row says: no write, so the row keeps its own dates. */
    if (matchesStoredFirst(row, newest) && row.lastTouchAt === null) return
    if (row.lastSource === newest.source && row.lastCampaign === newest.campaign && row.lastTouchAt !== null) return

    await db()
      .update(leadAttribution)
      .set(lastColumns(newest))
      .where(eq(leadAttribution.id, row.id))
  } catch (error) {
    console.error('recordLeadAttribution failed', error)
  }
}

/**
 * Point an open lead at the account that has just been created for it, and freeze it.
 *
 * **Seams 2, 3 and the second half of 4** — `verifyEmail`, `confirmPendingRegistration`, and the
 * `signIn` callback. Called *after* `provisionAccount`, never before, for the reason
 * `attachCouponViewFromCookie` already carries: on a first admission the row that
 * `provisionAccount` writes is the one this needs to point at, and a moment earlier there is no
 * account to find.
 *
 * Reads no cookie, by design — see this module's header. Finding no open row is an ordinary
 * outcome and not a failure: an account created before this feature shipped, or a lead who
 * arrived from nowhere in particular, simply has no attribution and never will.
 *
 * **The account id is selected and looked at, never rendered as `accountIdOf`.** That helper
 * yields NULL for an address it cannot find, and `account_id` here is nullable — so a subquery
 * would quietly write NULL, leaving the row open, unfrozen, and eligible to be taken over by the
 * next registration on the same address. `ids.ts` says this of itself, and `recordCouponView`
 * found it the hard way.
 *
 * `frozen_at` is what makes this final: from here nothing in this repo writes the row again, and
 * `lead_attribution_open` no longer sees it, so a future registration on the same address gets a
 * row of its own instead of overwriting this one.
 */
export async function freezeLeadAttribution(email: string): Promise<void> {
  if (!hasDatabase) return

  try {
    const owner = await db().select({ id: accounts.id }).from(accounts).where(eq(accounts.ownerEmail, email)).limit(1)
    const accountId = owner[0]?.id
    if (accountId === undefined) return

    await db()
      .update(leadAttribution)
      .set({ accountId, frozenAt: new Date() })
      .where(and(eq(leadAttribution.email, email), isNull(leadAttribution.accountId)))
  } catch (error) {
    console.error('freezeLeadAttribution failed', error)
  }
}
