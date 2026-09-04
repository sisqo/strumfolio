import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CampaignList } from '@/components/CampaignList'
import type { CampaignRow } from '@/components/CampaignList'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { auth } from '@/auth'
import { isOwner } from '@/lib/allowlist'
import { loadCampaigns } from '@/lib/coupons/actions'
import type { Campaign } from '@/lib/coupons/read'
import { CAMPAIGN_FAILURE_MESSAGE } from '@/lib/coupons/types'

export const metadata: Metadata = { title: 'Coupons' }

/**
 * Per request, never prerendered — the same reason `/accounts`, `/emails` and `/app-settings`
 * say so, one degree sharper here: every status on this screen is computed from the clock
 * (`campaignStatus`), so a page built at deploy time would show a campaign as `scheduled` for
 * as long as nothing else triggered a rebuild.
 */
export const dynamic = 'force-dynamic'

const DAY = 24 * 60 * 60 * 1000

/** How long a campaign has been the `?promo=1` target — measured from when it started running. */
function defaultForDays(campaign: Campaign, now: Date): number | null {
  if (!campaign.isDefault) return null
  const from = campaign.startsAt > now ? now : campaign.startsAt
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY))
}

/** «312 of 500», «84 used, no limit» — the ceiling beside the count it is measured by. */
function limitLabel(campaign: Campaign): string {
  if (campaign.usageLimitSubscription === null) {
    return `${campaign.redeemed} used, no limit`
  }
  return `${campaign.redeemed} of ${campaign.usageLimitSubscription}`
}

/** A `Date` as the `datetime-local` round trip wants it — see `localValue` in `CampaignForm`. */
function iso(value: Date | null): string {
  return value === null ? '' : value.toISOString()
}

function toRow(campaign: Campaign, now: Date): CampaignRow {
  return {
    id: campaign.id,
    redeemed: campaign.redeemed,
    name: campaign.name,
    code: campaign.code,
    channel: campaign.channel ?? 'paid',
    notes: campaign.notes ?? '',
    discountPercent: campaign.discountPercent,
    /* Blank rather than `'forever'`: it is what the form's own placeholder says, so the field
       reads the same whether it was never filled in or deliberately cleared. */
    discountMonths: campaign.discountMonths === null ? '' : String(campaign.discountMonths),
    appliesToLifetime: campaign.appliesToLifetime,
    startsAt: iso(campaign.startsAt),
    expiresAt: iso(campaign.expiresAt),
    usageLimitSubscription:
      campaign.usageLimitSubscription === null ? '' : String(campaign.usageLimitSubscription),
    usageLimitLifetime: campaign.usageLimitLifetime === null ? '' : String(campaign.usageLimitLifetime),
    entry: campaign.entry,
    isDefault: campaign.isDefault,
    status: campaign.status,
    defaultForDays: defaultForDays(campaign, now),
    /* Only worth flagging while it is actually running: an archived or expired campaign with no
       end date is a historical fact, not an exposure. */
    endless: campaign.expiresAt === null && campaign.status === 'active',
    limitLabel: limitLabel(campaign),
  }
}

/**
 * Promotional campaigns — the gestionale for `lib/coupons/`.
 *
 * `notFound()` rather than a role notice, like every other owner-only page here: "this does not
 * exist" and "this is not yours" should look identical from outside. The fence is also inside
 * every action this screen calls (`requireOwner`), because a server action is reachable by
 * anything holding a session cookie — this check is the courtesy to the reader.
 *
 * What is deliberately **not** on this screen: a delete. A campaign is archived and never
 * removed, because `coupon_redemptions` references it and the record of what somebody paid has
 * to survive the campaign being retired. An archived code can never be reused either — it ends
 * up on coupon-listing sites, and reviving it reopens a tap somebody believed closed.
 */
export default async function CouponsPage() {
  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) notFound()

  const result = await loadCampaigns()
  const now = new Date()

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="coupons" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">Coupons</h1>
          <p className="mt-2 text-sm leading-[1.45] text-muted">
            {/*
              * Says the two things an operator has to hold in mind before touching anything:
              * that the number in «months» does more than it looks like on a yearly plan, and
              * that a discount already given cannot be taken back. Both are enforced further in,
              * but reading them here is what stops a campaign being created wrong in the first
              * place.
              */}
            A percentage off, a code, and a window. The duration is in months and rounds up to whole years on the
            yearly cycle, so one month discounts a full first year. Nothing here can change what somebody has already
            redeemed.
          </p>
        </header>

        {result.ok ? (
          <CampaignList campaigns={result.campaigns.map((campaign) => toRow(campaign, now))} />
        ) : (
          <p className="notice notice-error" role="alert">
            {CAMPAIGN_FAILURE_MESSAGE[result.reason]}
          </p>
        )}

        <Footer />
      </main>
    </PrefsProvider>
  )
}
