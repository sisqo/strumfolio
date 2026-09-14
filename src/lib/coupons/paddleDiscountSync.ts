/**
 * Putting a campaign's three Paddle Discounts where the checkout can find them.
 *
 * The database-and-SDK half of `paddleDiscount.ts`, which owns the translation and is where the
 * rules are tested. A plain module rather than `'use server'`: `actions.ts` calls it, and a
 * `'use server'` export is an endpoint the browser can call — the defect `redeemable.ts` was
 * moved out of `checkout.ts` to prevent.
 *
 * **It runs when a campaign is written, not when one is sold.** The buy path must not create
 * anything: a checkout that has to reach Paddle twice is a checkout with two ways to fail, and
 * the first press of a new campaign would carry the latency of three `discounts.create` calls.
 * So `createCampaign` and `updateCampaign` call this, and what a failure leaves behind is a
 * campaign with empty columns — which `discountIdFor` reads as «no discount behind this» and
 * `startPaddleCheckout` turns into a refusal. **Nothing here can charge the listino to somebody
 * promised a discount**, which is the one property the whole feature is arranged around.
 *
 * **Updating in place is safe because `updateCampaign` already refuses a percent change once
 * anybody has redeemed.** That guardrail was inert while `coupon_redemptions` had no writer —
 * `redeemed` counted zero for ever, so nothing was ever locked. The same commit that gives the
 * table a writer is what arms it, and it is what stands between an operator editing a live
 * campaign and a reader's price moving underneath a subscription Paddle is already billing.
 *
 * **Nothing is ever archived merely because a price id could not be named.** A transient gap —
 * `PADDLE_PRICE_IDS` absent from one environment, a live catalogue built one product at a time
 * — would otherwise retire a discount that is live on real subscriptions. Absence means «leave
 * it exactly as it is»; the only thing that retires an entity here is a decision on the
 * campaign row itself: the Lifetime being switched off, or the campaign being archived.
 */

import { eq } from 'drizzle-orm'

import { db, hasDatabase } from '@/lib/db/client'
import { couponCampaigns } from '@/lib/db/schema'
import { paddleClient } from '@/lib/plans/paddleClient'
import { paddlePriceId } from '@/lib/plans/paddlePrices'

import { DISCOUNT_ID_COLUMN, discountSpecs } from './paddleDiscount'
import type { DiscountIds, DiscountKind, DiscountSpec } from './paddleDiscount'

export type SyncFailure =
  /** No `PADDLE_API_KEY` here — a preview or a local run. The campaign is saved; it sells nothing. */
  | 'not-configured'
  | 'no-database'
  | 'not-found'
  | 'failed'

export type SyncResult = { ok: true; synced: DiscountKind[] } | { ok: false; reason: SyncFailure }

const COLUMNS = {
  code: couponCampaigns.code,
  discountPercent: couponCampaigns.discountPercent,
  discountMonths: couponCampaigns.discountMonths,
  appliesToLifetime: couponCampaigns.appliesToLifetime,
  expiresAt: couponCampaigns.expiresAt,
  archivedAt: couponCampaigns.archivedAt,
  paddleDiscountIdMonthly: couponCampaigns.paddleDiscountIdMonthly,
  paddleDiscountIdAnnual: couponCampaigns.paddleDiscountIdAnnual,
  paddleDiscountIdLifetime: couponCampaigns.paddleDiscountIdLifetime,
} as const

/**
 * What `discounts.create` and `discounts.update` are handed, camelCase as the SDK wants it.
 *
 * `expiresAt` is passed as `null` and not omitted when a campaign has no expiry, because this is
 * also the update path: a campaign whose deadline an operator *removes* has to have the field
 * cleared on the entity too, and an omitted field leaves Paddle's copy standing. The same for
 * `maximumRecurringIntervals`, where the stale value would be a discount that quietly stops
 * three months before the campaign says it does.
 */
function body(spec: DiscountSpec) {
  return {
    description: spec.description,
    type: 'percentage' as const,
    amount: spec.amount,
    recur: spec.recur,
    maximumRecurringIntervals: spec.maximumRecurringIntervals,
    restrictTo: spec.restrictTo,
    expiresAt: spec.expiresAt === null ? null : spec.expiresAt.toISOString(),
    /*
     * The two fields whose absence is the design. No code is generated and none is supplied, so
     * Paddle's own «Add discount code» field — already hidden by `showAddDiscounts: false` —
     * has nothing to accept even if it came back. And no `usage_limit`: Paddle's is «an overall
     * limit for this discount, rather than a per-customer limit», which is neither of this
     * app's two ceilings nor its once-per-account index. `coupon_redemptions` holds all three.
     */
    enabledForCheckout: false,
    usageLimit: null,
    customData: { app: 'strumfolio' },
  }
}

/**
 * Create or update this campaign's discounts and write the ids back.
 *
 * Never throws: a campaign that is saved and unsynced is a campaign that refuses to sell at a
 * discount, which is recoverable by pressing Save again. A campaign that could not be saved
 * because Paddle was unreachable is an operator locked out of their own screen.
 */
export async function syncCampaignDiscounts(campaignId: string): Promise<SyncResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const paddle = paddleClient()
  if (paddle === null) return { ok: false, reason: 'not-configured' }

  try {
    const [row] = await db().select(COLUMNS).from(couponCampaigns).where(eq(couponCampaigns.id, campaignId)).limit(1)
    if (row === undefined) return { ok: false, reason: 'not-found' }

    /* An archived campaign has nothing to sell, so syncing it would re-create entities the
       archive was meant to retire. `archiveCampaignDiscounts` is the path for that row. */
    if (row.archivedAt !== null) return { ok: true, synced: [] }

    const held: DiscountIds = {
      paddleDiscountIdMonthly: row.paddleDiscountIdMonthly,
      paddleDiscountIdAnnual: row.paddleDiscountIdAnnual,
      paddleDiscountIdLifetime: row.paddleDiscountIdLifetime,
    }

    const written: Partial<DiscountIds> = {}
    const synced: DiscountKind[] = []

    for (const spec of discountSpecs(row, paddlePriceId)) {
      const existing = held[DISCOUNT_ID_COLUMN[spec.kind]]

      if (existing !== null && existing.startsWith('dsc_')) {
        await paddle.discounts.update(existing, { ...body(spec), status: 'active' })
      } else {
        const created = await paddle.discounts.create(body(spec))
        written[DISCOUNT_ID_COLUMN[spec.kind]] = created.id
      }

      synced.push(spec.kind)
    }

    /*
     * The Lifetime switched off is the one absence that is a decision rather than a gap, so it
     * is the one that retires an entity. Read from the campaign row, never from whether a price
     * could be resolved — see this file's header for why that distinction is load-bearing.
     */
    if (!row.appliesToLifetime && held.paddleDiscountIdLifetime !== null) {
      await archive(paddle, held.paddleDiscountIdLifetime)
      written.paddleDiscountIdLifetime = null
    }

    await db()
      .update(couponCampaigns)
      .set({ ...written, lastSyncedAt: new Date() })
      .where(eq(couponCampaigns.id, campaignId))

    return { ok: true, synced }
  } catch (error) {
    console.error('syncCampaignDiscounts failed', campaignId, error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Retire a campaign's discounts, so archiving it here stops redemptions at Paddle's end too.
 *
 * **The ids are kept, not cleared.** A redemption already made points at an entity that has to
 * stay findable from a transaction in Paddle's dashboard, and un-archiving a campaign is then
 * one sync away rather than three new entities and an orphan of each old one.
 *
 * Archiving stops new redemptions and changes nothing for anybody already living under the
 * discount — which is exactly what `archiveCampaign` promises on this side: «changes nothing
 * for anybody already living under the discount».
 */
export async function archiveCampaignDiscounts(campaignId: string): Promise<SyncResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const paddle = paddleClient()
  if (paddle === null) return { ok: false, reason: 'not-configured' }

  try {
    const [row] = await db().select(COLUMNS).from(couponCampaigns).where(eq(couponCampaigns.id, campaignId)).limit(1)
    if (row === undefined) return { ok: false, reason: 'not-found' }

    const retired: DiscountKind[] = []

    for (const kind of ['monthly', 'annual', 'lifetime'] as const) {
      const id = row[DISCOUNT_ID_COLUMN[kind]]
      if (id === null || !id.startsWith('dsc_')) continue
      await archive(paddle, id)
      retired.push(kind)
    }

    await db().update(couponCampaigns).set({ lastSyncedAt: new Date() }).where(eq(couponCampaigns.id, campaignId))

    return { ok: true, synced: retired }
  } catch (error) {
    console.error('archiveCampaignDiscounts failed', campaignId, error)
    return { ok: false, reason: 'failed' }
  }
}

async function archive(paddle: NonNullable<ReturnType<typeof paddleClient>>, discountId: string) {
  await paddle.discounts.update(discountId, { status: 'archived' })
}
