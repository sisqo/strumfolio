/**
 * The ledger of coupons *shown*: the upsert that records a sighting, and the read the Payments
 * tab prints from it.
 *
 * A plain module and not `'use server'`, `read.ts`' own arrangement: every caller here is
 * already server-side — the `signIn` callback in `auth.ts`, `verifyEmail`, the account detail
 * page — and the one caller that arrives from a browser reaches this through `noteCouponView`
 * in `actions.ts`, which is where the session is checked. Both halves of one table in one file
 * rather than split across `read.ts`/`actions.ts`, because the read and the write share the
 * whole of what makes a row true and nothing else in either module touches this table.
 *
 * **What this exists to fix.** `applyCoupon`/`rememberUrlCoupon` write the `songbook-coupon`
 * cookie and nothing else, so until this table a coupon somebody landed with and did not buy
 * on was recorded nowhere on this side: not per account, not per campaign, gone the moment
 * that browser cleared its cookies. `couponViews` in `db/schema.ts` carries the shape; this
 * module carries the two rules that keep it honest — one row per account per campaign, and a
 * code from a client is re-validated against the table before any of it is believed.
 *
 * Nothing here throws. A sighting that cannot be recorded must not take `/pricing` or a
 * sign-in down with it, and a read that fails answers `null` so the screen can print «could
 * not read» rather than the reassuring empty list — `rateLimitStatusFor`'s rule.
 */

import { randomUUID } from 'crypto'

import { and, desc, eq, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'

import { db, hasDatabase } from '@/lib/db/client'
import { accountIdOf } from '@/lib/db/ids'
import { accounts, couponCampaigns, couponRedemptions, couponViews } from '@/lib/db/schema'

import { campaignStatus, viewStanding } from './discount'
import { campaignByCode, redemptionCounts } from './read'
import { COUPON_COOKIE, isCodeShape, normalizeCode, readPercent } from './types'
import type { CampaignStatus, ViewStanding } from './types'

/**
 * Record that one account has been shown one campaign.
 *
 * **The code is an argument here, unlike at `mockPurchase`, and the difference is what the
 * argument can buy.** A code travelling as a parameter into a checkout is a self-service
 * discount of any size; a code travelling into this is a reader asking to be recorded as
 * having seen a campaign that really exists and is really live — which grants nothing, and is
 * re-validated anyway, so the worst a tampered call achieves is one true-shaped row about a
 * real campaign against the caller's own account. `rememberUrlCoupon` takes its code the same
 * way and for the same reason.
 *
 * `campaignByCode` is what does the validating, and it is a call and not a copy of the
 * campaign's `where` clause: the state, window and ceilings are `campaignStatus`' to decide,
 * once, wherever the question is asked. Only `active` is recorded — a sighting of an expired or
 * archived campaign is a row nobody could act on, and `activeCoupon` would not have shown it
 * either.
 *
 * The account written is the reader's **current** account, never their sign-in identity, so a
 * view agrees with what `mockPurchase` would charge.
 *
 * **The account id is selected and looked at, not rendered as a subquery**, which is the one
 * thing `accountIdOf` says of itself must never be done with it: it yields NULL for an address
 * with no account, and `accountId` here is nullable — so an `accountIdOf` in the insert wrote a
 * row with a null pointer instead of refusing. That row is unreachable, since every read asks
 * by the pointer, *and* it is invisible to `coupon_views_once`, whose `WHERE account_id IS NOT
 * NULL` excludes it — so the upsert became an insert and one row appeared per mount, for ever.
 * Found by running this function against the dev database rather than by reading it. An address
 * with no account row is now simply refused, which is the honest answer: there is nothing for
 * the sighting to be about yet.
 */
export async function recordCouponView(rawCode: string, accountOwnerEmail: string): Promise<{ ok: boolean }> {
  const code = normalizeCode(rawCode)
  if (!isCodeShape(code) || !hasDatabase) return { ok: false }

  try {
    /* In parallel, because neither answer depends on the other: three queries, two round trips
       of latency, and this is called from a page mount. */
    const [campaign, owner] = await Promise.all([
      campaignByCode(code, new Date()),
      db().select({ id: accounts.id }).from(accounts).where(eq(accounts.ownerEmail, accountOwnerEmail)).limit(1),
    ])
    if (campaign === null || campaign.status !== 'active') return { ok: false }

    const accountId = owner[0]?.id
    if (accountId === undefined) return { ok: false }

    /*
     * One statement, and `first_seen_at` is what it protects: the insert's default writes it
     * once and the conflict branch never names it, so a reader who has been coming back to the
     * same offer for a fortnight keeps the date they first saw it. `lastSeenAt` is written with
     * SQL's own `now()` rather than a JS `Date` for `planChosenAt`'s reason in `checkout.ts` —
     * inside `sql` there is no column for the driver to infer a timestamp from.
     *
     * The `targetWhere` repeats `coupon_views_once`' predicate **exactly**, because that is how
     * Postgres infers a partial index as an `ON CONFLICT` target. One character apart and every
     * write fails with «no unique or exclusion constraint matching the ON CONFLICT
     * specification», caught by the `catch` below, logged, and recorded nowhere.
     */
    await db()
      .insert(couponViews)
      .values({
        id: randomUUID(),
        campaignId: campaign.id,
        accountOwnerEmail,
        accountId,
        code: campaign.code,
      })
      .onConflictDoUpdate({
        target: [couponViews.campaignId, couponViews.accountId],
        targetWhere: sql`${couponViews.accountId} is not null`,
        set: { lastSeenAt: sql`now()` },
      })

    return { ok: true }
  } catch (error) {
    console.error('recordCouponView failed', error)
    return { ok: false }
  }
}

/**
 * The same record, for a coupon the reader was already carrying when they signed in.
 *
 * The cookie outlives a sign-in, so this is what closes the funnel the feature exists for:
 * somebody clicks an advertisement while signed out, registers, and is recorded against the
 * account that registration just created. Called from `auth.ts`'s `signIn` callback — the one
 * place a session is created — and from `verifyEmail`, which never runs through that callback
 * because it hands out its own cookie (`issueSessionCookie`).
 *
 * The cookie is read here rather than at either call site so `COUPON_COOKIE` stays spelled in
 * one place per path. Two spellings of a cookie name is a feature that records nobody and
 * reports no error at all — `devices.ts` says the same about its own.
 *
 * **The Google branch depends on `sameSite: 'lax'`**, since that callback runs on the
 * top-level redirect back from Google rather than on a request from our own page. A lax cookie
 * is sent on exactly that kind of navigation, which is why `applyCoupon` sets it that way in
 * the first place — and if it ever stopped arriving, the bar's own `noteCouponView` records the
 * same sighting on the reader's next visit to `/pricing`. Late, never lost.
 */
export async function attachCouponViewFromCookie(accountOwnerEmail: string): Promise<void> {
  if (!hasDatabase) return

  try {
    const code = (await cookies()).get(COUPON_COOKIE)?.value ?? null
    if (code === null || code === '') return
    await recordCouponView(code, accountOwnerEmail)
  } catch (error) {
    /* A sign-in must succeed even if this trips — `recordSignIn`'s and `provisionAccount`'s
       own rule, and this is the least load-bearing of the three. */
    console.error('attachCouponViewFromCookie failed', error)
  }
}

/** One coupon this account was shown, as the Payments tab prints it. */
export interface CouponViewLine {
  code: string
  /** The campaign's own name, which is what an operator recognises — the code is for the reader. */
  campaignName: string
  firstSeenAt: Date
  lastSeenAt: Date
  /** When this account redeemed this campaign, or `null`. A left join, never a column — see the schema. */
  redeemedAt: Date | null
  status: CampaignStatus
  standing: ViewStanding
}

/**
 * Every coupon ever shown to one account, most recently seen first.
 *
 * `null` and not `[]` when the read fails, so the screen can tell «nothing was ever shown to
 * this account» from «could not tell» — the two are opposite answers on the one page built to
 * be believed (`accounts/CLAUDE.md`).
 *
 * **Whether each was redeemed is joined, not stored.** The left join is on the campaign *and*
 * the account, so a campaign this reader saw and somebody else bought stays «not redeemed»
 * here. `redemptionCounts` is the second query, and it is the campaign-wide count
 * `campaignStatus` needs for its ceiling — a different question from the join beside it, which
 * is why both are here.
 *
 * Asked by `accountId`, never by the address: the address on the row is history, frozen at the
 * moment of the sighting, so a reader who has since changed it would look themselves up under
 * the new one and find nothing. The same defect the numeric key exists to remove, and the same
 * note `redeemability` carries.
 */
export async function couponViewsFor(accountOwnerEmail: string): Promise<CouponViewLine[] | null> {
  if (!hasDatabase) return null

  try {
    const now = new Date()
    const [rows, counts] = await Promise.all([
      db()
        .select({
          code: couponViews.code,
          campaignName: couponCampaigns.name,
          firstSeenAt: couponViews.firstSeenAt,
          lastSeenAt: couponViews.lastSeenAt,
          redeemedAt: couponRedemptions.redeemedAt,
          campaignId: couponCampaigns.id,
          discountPercent: couponCampaigns.discountPercent,
          discountMonths: couponCampaigns.discountMonths,
          appliesToLifetime: couponCampaigns.appliesToLifetime,
          startsAt: couponCampaigns.startsAt,
          expiresAt: couponCampaigns.expiresAt,
          usageLimitSubscription: couponCampaigns.usageLimitSubscription,
          usageLimitLifetime: couponCampaigns.usageLimitLifetime,
          archivedAt: couponCampaigns.archivedAt,
        })
        .from(couponViews)
        .innerJoin(couponCampaigns, eq(couponCampaigns.id, couponViews.campaignId))
        .leftJoin(
          couponRedemptions,
          and(
            eq(couponRedemptions.campaignId, couponViews.campaignId),
            eq(couponRedemptions.accountId, couponViews.accountId),
          ),
        )
        .where(eq(couponViews.accountId, accountIdOf(accountOwnerEmail)))
        .orderBy(desc(couponViews.lastSeenAt)),
      redemptionCounts(),
    ])

    return rows.map((row) => {
      const status = campaignStatus(
        {
          code: row.code,
          discountPercent: readPercent(row.discountPercent) ?? '0',
          discountMonths: row.discountMonths,
          appliesToLifetime: row.appliesToLifetime,
          startsAt: row.startsAt,
          expiresAt: row.expiresAt,
          usageLimitSubscription: row.usageLimitSubscription,
          usageLimitLifetime: row.usageLimitLifetime,
          archivedAt: row.archivedAt,
        },
        now,
        counts.get(row.campaignId) ?? 0,
      )

      return {
        code: row.code,
        campaignName: row.campaignName,
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        redeemedAt: row.redeemedAt,
        status,
        standing: viewStanding(status, row.redeemedAt),
      }
    })
  } catch (error) {
    console.error('couponViewsFor failed', error)
    return null
  }
}
