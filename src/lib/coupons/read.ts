/**
 * Reading campaigns, and resolving the one a reader is arriving with.
 *
 * A plain module, not `'use server'`: every caller is already server-side (`/pricing`,
 * `/checkout`, `/coupons`, and `mockPurchase`), and the pure half it leans on lives next door
 * in `discount.ts`/`types.ts` where a `node:test` file can reach it. Same split as
 * `plans/resolve.ts` and `settings/read.ts`.
 *
 * **The cookie is never believed.** It carries a code and nothing else — no percentage, no
 * amount — and every read re-derives the discount from the table: the campaign's state, its
 * window, its ceilings, its `entry`, and for the Lifetime its coverage. A tampered cookie
 * therefore discounts nothing, and a campaign archived five minutes ago stops discounting on
 * the next request rather than whenever a cookie happens to expire.
 *
 * Nothing here throws. `/pricing` renders the price list through `activeCoupon`, so a failure
 * has to mean "no coupon" and never "no page" — the same discipline `loadNotifySettings`
 * documents for a screen it must not take down.
 */

import { and, count, desc, eq, isNull } from 'drizzle-orm'

import { db, hasDatabase } from '@/lib/db/client'
import { accountIdOf } from '@/lib/db/ids'
import { couponCampaigns, couponRedemptions } from '@/lib/db/schema'
import type { CheckoutPlan } from '@/lib/plans/prices'

import { campaignStatus } from './discount'
import type { CampaignFacts } from './discount'
import { entryAllowsCode, entryAllowsUrl, isRedeemable, normalizeCode, readChannel, readEntry, readPercent } from './types'
import type { CampaignStatus, CouponChannel, CouponEntry, CouponFailure } from './types'

/**
 * A campaign as the rest of the app sees it: the facts that decide prices, plus the
 * bookkeeping `/coupons` renders. `status` and `redeemed` are computed, never columns.
 */
export interface Campaign extends CampaignFacts {
  id: string
  name: string
  channel: CouponChannel | null
  notes: string | null
  entry: CouponEntry
  isDefault: boolean
  createdAt: Date
  createdBy: string | null
  status: CampaignStatus
  redeemed: number
}

const COLUMNS = {
  id: couponCampaigns.id,
  name: couponCampaigns.name,
  code: couponCampaigns.code,
  channel: couponCampaigns.channel,
  notes: couponCampaigns.notes,
  discountPercent: couponCampaigns.discountPercent,
  discountMonths: couponCampaigns.discountMonths,
  appliesToLifetime: couponCampaigns.appliesToLifetime,
  startsAt: couponCampaigns.startsAt,
  expiresAt: couponCampaigns.expiresAt,
  usageLimitSubscription: couponCampaigns.usageLimitSubscription,
  usageLimitLifetime: couponCampaigns.usageLimitLifetime,
  entry: couponCampaigns.entry,
  isDefault: couponCampaigns.isDefault,
  archivedAt: couponCampaigns.archivedAt,
  createdAt: couponCampaigns.createdAt,
  createdBy: couponCampaigns.createdBy,
} as const

/**
 * What `select(COLUMNS)` hands back.
 *
 * Written out rather than inferred from `COLUMNS` with a mapped type: drizzle's column type
 * carries its nullability in a place a naive `infer` misses, and the version that compiled
 * declared every nullable column non-null — which type-checks and then lies about `notes`,
 * `expiresAt` and `archivedAt`, the three fields the whole status calculation turns on.
 */
interface CampaignRow {
  id: string
  name: string
  code: string
  channel: string
  notes: string | null
  discountPercent: string
  discountMonths: number | null
  appliesToLifetime: boolean
  startsAt: Date
  expiresAt: Date | null
  usageLimitSubscription: number | null
  usageLimitLifetime: number | null
  entry: string
  isDefault: boolean
  archivedAt: Date | null
  createdAt: Date
  createdBy: string | null
}

/**
 * One row plus its redemption count, made into a `Campaign`.
 *
 * `readPercent` is applied here rather than trusted: a cell this cannot read means the campaign
 * discounts nothing, which `discountedAmount` then honours by returning the amount unchanged.
 * A `'0'` fallback would have been the same thing spelled worse.
 */
function toCampaign(row: CampaignRow, redeemed: number, now: Date): Campaign {
  const facts: CampaignFacts = {
    code: row.code,
    discountPercent: readPercent(row.discountPercent) ?? '0',
    discountMonths: row.discountMonths,
    appliesToLifetime: row.appliesToLifetime,
    startsAt: row.startsAt,
    expiresAt: row.expiresAt,
    usageLimitSubscription: row.usageLimitSubscription,
    usageLimitLifetime: row.usageLimitLifetime,
    archivedAt: row.archivedAt,
  }

  return {
    ...facts,
    id: row.id,
    name: row.name,
    channel: readChannel(row.channel),
    notes: row.notes,
    entry: readEntry(row.entry),
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    status: campaignStatus(facts, now, redeemed),
    redeemed,
  }
}

/**
 * How many accounts have redeemed each campaign — one grouped query rather than one per row.
 *
 * The number `usage_limit` is compared against, and the reason
 * `coupon_redemptions_once` exists: this is a `count(*)` over rows that are unique per account,
 * so it is Paddle's `times_used` computed rather than mirrored.
 */
async function redemptionCounts(): Promise<Map<string, number>> {
  const rows = await db()
    .select({ campaignId: couponRedemptions.campaignId, held: count() })
    .from(couponRedemptions)
    .groupBy(couponRedemptions.campaignId)

  return new Map(rows.map((row) => [row.campaignId, row.held]))
}

/** Every campaign, newest first — `/coupons`' own list. `null` when the table cannot be read. */
export async function allCampaigns(): Promise<Campaign[] | null> {
  if (!hasDatabase) return null

  try {
    const now = new Date()
    const [rows, counts] = await Promise.all([
      db().select(COLUMNS).from(couponCampaigns).orderBy(desc(couponCampaigns.createdAt)),
      redemptionCounts(),
    ])

    return rows.map((row) => toCampaign(row, counts.get(row.id) ?? 0, now))
  } catch (error) {
    console.error('allCampaigns failed', error)
    return null
  }
}

/** One campaign by id, for the edit form. */
export async function campaignById(id: string): Promise<Campaign | null> {
  if (!hasDatabase) return null

  try {
    const now = new Date()
    const rows = await db().select(COLUMNS).from(couponCampaigns).where(eq(couponCampaigns.id, id)).limit(1)
    const row = rows[0]
    if (row === undefined) return null

    return toCampaign(row, await redeemedCount(id), now)
  } catch (error) {
    console.error('campaignById failed', error)
    return null
  }
}

/** How many accounts have redeemed one campaign. */
export async function redeemedCount(campaignId: string): Promise<number> {
  const rows = await db()
    .select({ held: count() })
    .from(couponRedemptions)
    .where(eq(couponRedemptions.campaignId, campaignId))

  return rows[0]?.held ?? 0
}

async function campaignByCode(code: string, now: Date): Promise<Campaign | null> {
  const rows = await db()
    .select(COLUMNS)
    .from(couponCampaigns)
    .where(eq(couponCampaigns.code, normalizeCode(code)))
    .limit(1)

  const row = rows[0]
  if (row === undefined) return null
  return toCampaign(row, await redeemedCount(row.id), now)
}

/**
 * The campaign `?promo=1` resolves to — the one flagged `is_default` and not archived.
 *
 * At most one exists, enforced by `coupon_campaigns_one_default`, so `limit(1)` is a statement
 * about the schema rather than a guess. The `archivedAt is null` half of that index is what
 * makes archiving the current default and flagging another possible.
 */
async function defaultCampaign(now: Date): Promise<Campaign | null> {
  const rows = await db()
    .select(COLUMNS)
    .from(couponCampaigns)
    .where(and(eq(couponCampaigns.isDefault, true), isNull(couponCampaigns.archivedAt)))
    .limit(1)

  const row = rows[0]
  if (row === undefined) return null
  return toCampaign(row, await redeemedCount(row.id), now)
}

/**
 * Whether a campaign may be redeemed for a given plan and cycle, by a given account.
 *
 * The per-plan half of the ceiling check that `campaignStatus` deliberately leaves out: a
 * Lifetime ceiling reached does not close a campaign, it only stops the Lifetime. Called by
 * `mockPurchase` immediately before it writes, so what is checked is what is charged.
 */
export async function redeemability(
  campaign: Campaign,
  plan: CheckoutPlan,
  accountOwnerEmail: string,
): Promise<{ ok: true } | { ok: false; reason: CouponFailure }> {
  if (!isRedeemable(campaign.status)) {
    return {
      ok: false,
      reason:
        campaign.status === 'expired'
          ? 'expired'
          : campaign.status === 'scheduled'
            ? 'not-started'
            : campaign.status === 'exhausted'
              ? 'exhausted'
              : 'unknown-code',
    }
  }

  if (plan === 'lifetime' && !campaign.appliesToLifetime) return { ok: false, reason: 'unknown-code' }

  /*
   * The Lifetime's own stricter ceiling, counted over the Lifetime redemptions alone — a
   * campaign that has sold its 50 Lifetimes keeps selling subscriptions, which is the whole
   * point of the second column existing.
   */
  if (plan === 'lifetime' && campaign.usageLimitLifetime !== null) {
    const rows = await db()
      .select({ held: count() })
      .from(couponRedemptions)
      .where(and(eq(couponRedemptions.campaignId, campaign.id), eq(couponRedemptions.plan, 'lifetime')))
    if ((rows[0]?.held ?? 0) >= campaign.usageLimitLifetime) return { ok: false, reason: 'exhausted' }
  }

  if (plan !== 'lifetime' && campaign.usageLimitSubscription !== null) {
    if (campaign.redeemed >= campaign.usageLimitSubscription) return { ok: false, reason: 'exhausted' }
  }

  /*
   * Asked by `accountId`, never by the address (v4.7). The address is still on the row, and
   * on purpose — it is what makes deleting and recreating an account fail to hand out the
   * discount twice — but it is *history*, frozen at the moment of redemption, so a reader who
   * changed their address would look themselves up under the new one, find nothing, and
   * redeem again. That is the same defect the numeric key exists to remove, wearing a
   * different cause. See `couponRedemptions` in `db/schema.ts` for both indexes.
   */
  const already = await db()
    .select({ id: couponRedemptions.id })
    .from(couponRedemptions)
    .where(
      and(
        eq(couponRedemptions.campaignId, campaign.id),
        eq(couponRedemptions.accountId, accountIdOf(accountOwnerEmail)),
      ),
    )
    .limit(1)

  if (already.length > 0) return { ok: false, reason: 'already-redeemed' }

  return { ok: true }
}

/**
 * Resolving a typed code — what the banner's input field submits.
 *
 * **Three genuinely different refusals collapse into `'unknown-code'`**: no such code, a
 * campaign whose `entry` is `'url'` so its code may not be typed, and an archived one.
 * `COUPON_FAILURE_MESSAGE` gives them one sentence. A distinct message for the second would
 * tell somebody probing the form that a hidden code exists, which is the only thing
 * `entry: 'url'` is for.
 *
 * `'already-redeemed'` is deliberately *not* one of them, and stays its own message: it is
 * about this account, not about the code, and a reader who has already used a code is helped
 * by being told so.
 */
export async function resolveTypedCode(
  code: string,
  accountOwnerEmail: string | null,
): Promise<{ ok: true; campaign: Campaign } | { ok: false; reason: CouponFailure }> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  try {
    const now = new Date()
    const campaign = await campaignByCode(code, now)
    if (campaign === null || !entryAllowsCode(campaign.entry)) return { ok: false, reason: 'unknown-code' }

    if (!isRedeemable(campaign.status)) {
      return {
        ok: false,
        reason:
          campaign.status === 'expired'
            ? 'expired'
            : campaign.status === 'scheduled'
              ? 'not-started'
              : campaign.status === 'exhausted'
                ? 'exhausted'
                : 'unknown-code',
      }
    }

    /*
     * Told at the point of typing rather than at the checkout, when it can be told at all: a
     * visitor has no account to have redeemed anything with, so this is skipped for them and
     * `mockPurchase` is the backstop either way.
     */
    if (accountOwnerEmail !== null) {
      const already = await db()
        .select({ id: couponRedemptions.id })
        .from(couponRedemptions)
        .where(
          and(
            eq(couponRedemptions.campaignId, campaign.id),
            eq(couponRedemptions.accountId, accountIdOf(accountOwnerEmail)),
          ),
        )
        .limit(1)
      if (already.length > 0) return { ok: false, reason: 'already-redeemed' }
    }

    return { ok: true, campaign }
  } catch (error) {
    console.error('resolveTypedCode failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * The campaign a request is arriving with, whatever route it came by.
 *
 * The precedence is the decision: an explicit `?coupon=CODE` beats `?promo=1`, because a named
 * code is more specific than a flag; the cookie is the fallback for a reader who accepted one
 * earlier. A `?coupon=` that does not resolve shows no error and no banner — somebody arriving
 * from an advertisement is served the full listino rather than a diagnostic — whereas a *typed*
 * code that does not resolve says why, through `resolveTypedCode` above. One is a reply to an
 * action, the other to a URL.
 *
 * A campaign reached from the URL must allow `url` entry; the cookie is trusted for its code
 * only, and re-validated here in full every time.
 */
export async function activeCoupon(input: {
  coupon?: string
  promo?: string
  cookie: string | null
}): Promise<Campaign | null> {
  if (!hasDatabase) return null

  try {
    const now = new Date()

    if (input.coupon !== undefined && input.coupon !== '') {
      const named = await campaignByCode(input.coupon, now)
      if (named !== null && entryAllowsUrl(named.entry) && isRedeemable(named.status)) return named
      return null
    }

    if (input.promo !== undefined && input.promo !== '') {
      const fallback = await defaultCampaign(now)
      if (fallback !== null && entryAllowsUrl(fallback.entry) && isRedeemable(fallback.status)) return fallback
      return null
    }

    if (input.cookie !== null && input.cookie !== '') {
      const remembered = await campaignByCode(input.cookie, now)
      /*
       * No `entry` check on this branch, and that is not an oversight: the cookie is only ever
       * written by a route that already checked it, so re-testing it would refuse a coupon a
       * reader legitimately accepted from a campaign later narrowed to `url`-only. State,
       * window and ceilings are re-checked, which is what the "never believe the cookie" rule
       * is actually about.
       */
      if (remembered !== null && isRedeemable(remembered.status)) return remembered
    }

    return null
  } catch (error) {
    console.error('activeCoupon failed', error)
    return null
  }
}

/**
 * The campaign the overlay advertises — the live one whose code is meant to be public.
 *
 * Gated on `entryAllowsCode`, and that is the load-bearing half rather than a detail: a
 * `entry: 'url'` campaign exists precisely so its code is *not* known, so putting it on a
 * banner with a Copy button would hand out the one thing that setting is for. A campaign
 * reachable only by link is advertised by the link, not by this.
 *
 * The newest first, and one at a time: two offers on one bar is two offers nobody picks. There
 * is no ranking beyond recency, deliberately — the operator decides which campaign is live, and
 * having two overlapping ones is a mistake `/coupons` shows rather than a case to arbitrate
 * here.
 */
export async function advertisableCampaign(): Promise<Campaign | null> {
  if (!hasDatabase) return null

  try {
    const now = new Date()
    const [rows, counts] = await Promise.all([
      db()
        .select(COLUMNS)
        .from(couponCampaigns)
        .where(isNull(couponCampaigns.archivedAt))
        .orderBy(desc(couponCampaigns.createdAt)),
      redemptionCounts(),
    ])

    for (const row of rows) {
      const campaign = toCampaign(row, counts.get(row.id) ?? 0, now)
      if (entryAllowsCode(campaign.entry) && isRedeemable(campaign.status)) return campaign
    }
    return null
  } catch (error) {
    /* "No offer to advertise" — never a reason a page fails to render. `/login` is the front
       door, and a coupon table that cannot be read must not close it. */
    console.error('advertisableCampaign failed', error)
    return null
  }
}
