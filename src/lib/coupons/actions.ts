'use server'

/**
 * The writes: accepting a code into the cookie, dropping it, and the `/coupons` CRUD.
 *
 * Every campaign write re-checks `isOwner` itself rather than trusting the page that rendered
 * the form, the discipline `settings/actions.ts` and `plans/checkout.ts` both state: a server
 * action is reachable by anything holding a session cookie, so a page's `notFound()` is a
 * courtesy to the reader and never the fence.
 *
 * `applyCoupon` and `clearCoupon` are the two exceptions to that, deliberately: they are
 * reachable by anyone, signed in or not, because a visitor typing a code on `/pricing` is the
 * ordinary case. What they can do is write one cookie in their own browser — and the cookie
 * decides nothing on its own, since every read re-derives the discount from the table
 * (`read.ts`' own header).
 */

import { randomUUID } from 'crypto'

import { and, eq, isNull, ne, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'

import { auth } from '@/auth'
import { isOwner } from '@/lib/allowlist'
import { currentUser } from '@/lib/auth/session'
import { db, hasDatabase } from '@/lib/db/client'
import { couponCampaigns } from '@/lib/db/schema'

import { campaignStatus, cookieMaxAge } from './discount'
import { allCampaigns, campaignById, redeemedCount, resolveTypedCode } from './read'
import {
  COUPON_COOKIE,
  COUPON_COOKIE_MAX_DAYS,
  entryAllowsUrl,
  isCodeShape,
  normalizeCode,
  readChannel,
  readEntry,
  readLimit,
  readMonths,
  readPercent,
} from './types'
import type { CampaignFailure, CouponFailure } from './types'

/**
 * Accept a code, either typed into the banner or arriving on a URL.
 *
 * Writes the code alone — no percentage, no amount — for the reason `read.ts` gives at length:
 * everything that decides a price is re-derived from the table on every request, so the cookie
 * is a pointer and not a claim.
 *
 * `httpOnly`, because nothing client-side needs to read it: `/pricing` is already served per
 * request (it reads the session through `loadIdentity`), so the server read is free.
 * `sameSite: 'lax'` so a click straight from a Google advertisement still carries it.
 */
export async function applyCoupon(
  raw: string,
): Promise<{ ok: true; code: string } | { ok: false; reason: CouponFailure }> {
  const code = normalizeCode(raw)
  /* The shape check first, so a stray form submission never reaches the database at all — and
     a wrong shape is `'unknown-code'`, the same sentence as a code that does not exist. */
  if (!isCodeShape(code)) return { ok: false, reason: 'unknown-code' }
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  const resolved = await resolveTypedCode(code, user?.accountOwnerEmail ?? null)
  if (!resolved.ok) return resolved

  const maxAge = cookieMaxAge(resolved.campaign.expiresAt, new Date(), COUPON_COOKIE_MAX_DAYS)
  /* A campaign already over yields `0`, which would write a cookie that expires on arrival —
     refused as expired instead, which is the sentence that describes what happened. */
  if (maxAge === 0) return { ok: false, reason: 'expired' }

  const jar = await cookies()
  jar.set(COUPON_COOKIE, resolved.campaign.code, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  })

  return { ok: true, code: resolved.campaign.code }
}

/**
 * The same acceptance, for a code that arrived on a URL rather than being typed.
 *
 * Separate from `applyCoupon` for the one difference that matters: this checks `entry` allows
 * `url`, and it refuses in silence. Somebody arriving from an advertisement with a code that no
 * longer resolves is served the full listino and no banner — never a diagnostic.
 *
 * **Why this is an action and not a write during the page's own render:** Next.js allows a
 * cookie write only from a server action, a route handler or middleware, which
 * `strumTogether/session.ts` already records having learnt. So `CouponBar` calls this once on
 * mount when the page tells it the URL brought a coupon the cookie does not yet hold. Nothing
 * on the screen waits for it: the prices are already discounted from `searchParams` in the
 * first byte of HTML, and the cookie is only what makes the discount survive the reader coming
 * back tomorrow with a bare `/pricing`.
 *
 * The middleware was the alternative and was rejected: it has six return points and a header
 * comment warning against simplifying its conditionals, it runs on the edge where the database
 * is unreachable — so `?promo=1` could not be resolved to a campaign at all — and it could not
 * compute the campaign-aware `Max-Age` this does.
 *
 * Takes the code alone. An earlier draft took `expiresAt` and `entry` as arguments, which is
 * the same mistake as trusting the cookie: a client can pass anything, so the campaign is
 * re-read here.
 */
export async function rememberUrlCoupon(raw: string): Promise<{ ok: boolean }> {
  const code = normalizeCode(raw)
  if (!isCodeShape(code) || !hasDatabase) return { ok: false }

  try {
    const now = new Date()
    const rows = await db()
      .select({
        code: couponCampaigns.code,
        entry: couponCampaigns.entry,
        discountPercent: couponCampaigns.discountPercent,
        discountMonths: couponCampaigns.discountMonths,
        appliesToLifetime: couponCampaigns.appliesToLifetime,
        startsAt: couponCampaigns.startsAt,
        expiresAt: couponCampaigns.expiresAt,
        usageLimitSubscription: couponCampaigns.usageLimitSubscription,
        usageLimitLifetime: couponCampaigns.usageLimitLifetime,
        archivedAt: couponCampaigns.archivedAt,
        id: couponCampaigns.id,
      })
      .from(couponCampaigns)
      .where(eq(couponCampaigns.code, code))
      .limit(1)

    const row = rows[0]
    if (row === undefined || !entryAllowsUrl(readEntry(row.entry))) return { ok: false }

    const status = campaignStatus(
      { ...row, discountPercent: readPercent(row.discountPercent) ?? '0' },
      now,
      await redeemedCount(row.id),
    )
    if (status !== 'active') return { ok: false }

    const maxAge = cookieMaxAge(row.expiresAt, now, COUPON_COOKIE_MAX_DAYS)
    if (maxAge === 0) return { ok: false }

    const jar = await cookies()
    jar.set(COUPON_COOKIE, row.code, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge,
    })

    return { ok: true }
  } catch (error) {
    console.error('rememberUrlCoupon failed', error)
    return { ok: false }
  }
}

/** Drop the coupon — the banner's «Remove». */
export async function clearCoupon(): Promise<{ ok: true }> {
  const jar = await cookies()
  jar.delete(COUPON_COOKIE)
  return { ok: true }
}

/** What the `/coupons` form submits. Every field a string, as a form gives them. */
export interface CampaignInput {
  name: string
  code: string
  channel: string
  notes: string
  discountPercent: string
  discountMonths: string
  appliesToLifetime: boolean
  startsAt: string
  expiresAt: string
  usageLimitSubscription: string
  usageLimitLifetime: string
  entry: string
  isDefault: boolean
}

interface ValidCampaign {
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
}

/**
 * The validations, in one place so the action and not only the form imposes them.
 *
 * Two of the reference document's checks are deliberately absent. «Almeno uno dei tre
 * `applies_to_*` attivo» has nothing left to mean — the monthly and the yearly cycle are
 * covered by construction (see `discountCycles`) — and the «copertura dei price ID» check is a
 * comparison against a Paddle catalogue that does not exist yet.
 *
 * The two *warnings* the plan asks for are not here, on purpose: a warning that blocks is a
 * validation, and both of these describe something the operator may legitimately want. They
 * live in the form, beside the field they are about.
 */
function validate(input: CampaignInput): { ok: true; value: ValidCampaign } | { ok: false; reason: CampaignFailure } {
  const code = normalizeCode(input.code)
  if (!isCodeShape(code)) return { ok: false, reason: 'bad-code' }
  if (input.name.trim() === '') return { ok: false, reason: 'bad-name' }

  const channel = readChannel(input.channel)
  if (channel === null) return { ok: false, reason: 'bad-channel' }

  const percent = readPercent(input.discountPercent)
  if (percent === null) return { ok: false, reason: 'bad-percent' }

  const months = readMonths(input.discountMonths)
  if (!months.ok) return { ok: false, reason: 'bad-months' }

  const subscriptionLimit = readLimit(input.usageLimitSubscription)
  const lifetimeLimit = readLimit(input.usageLimitLifetime)
  if (!subscriptionLimit.ok || !lifetimeLimit.ok) return { ok: false, reason: 'bad-limit' }

  if (input.appliesToLifetime && lifetimeLimit.limit === null) {
    return { ok: false, reason: 'lifetime-needs-limit' }
  }

  const startsAt = input.startsAt.trim() === '' ? new Date() : new Date(input.startsAt)
  if (Number.isNaN(startsAt.getTime())) return { ok: false, reason: 'bad-window' }

  const expiresAt = input.expiresAt.trim() === '' ? null : new Date(input.expiresAt)
  if (expiresAt !== null && Number.isNaN(expiresAt.getTime())) return { ok: false, reason: 'bad-window' }
  if (expiresAt !== null && expiresAt <= startsAt) return { ok: false, reason: 'bad-window' }

  const entry = readEntry(input.entry)
  /*
   * A default campaign unreachable by link is a `?promo=1` that resolves to nothing, in
   * silence, on advertising traffic already paid for — the most expensive way to be wrong in
   * this whole feature, which is why it is a refusal and not a warning.
   */
  if (input.isDefault && !entryAllowsUrl(entry)) return { ok: false, reason: 'default-needs-url' }

  return {
    ok: true,
    value: {
      name: input.name.trim(),
      code,
      channel,
      notes: input.notes.trim() === '' ? null : input.notes.trim(),
      discountPercent: percent,
      discountMonths: months.months,
      appliesToLifetime: input.appliesToLifetime,
      startsAt,
      expiresAt,
      usageLimitSubscription: subscriptionLimit.limit,
      usageLimitLifetime: lifetimeLimit.limit,
      entry,
      isDefault: input.isDefault,
    },
  }
}

async function requireOwner(): Promise<{ ok: true; email: string } | { ok: false; reason: CampaignFailure }> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return { ok: false, reason: 'no-session' }
  if (!isOwner(email, process.env.ALLOWED_EMAILS)) return { ok: false, reason: 'not-owner' }
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  return { ok: true, email }
}

/**
 * Clear the flag off whatever campaign currently holds it.
 *
 * `coupon_campaigns_one_default` is a unique index, so writing a second default without this
 * fails the insert rather than quietly producing two — which is the behaviour the index is
 * there for. This runs first so the intended write is the one that survives, and it runs in
 * the same transaction as that write so a failure cannot leave the installation with no
 * default at all.
 */
async function unflagOtherDefaults(tx: Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0], keep: string | null) {
  await tx
    .update(couponCampaigns)
    .set({ isDefault: false })
    .where(
      keep === null
        ? and(eq(couponCampaigns.isDefault, true), isNull(couponCampaigns.archivedAt))
        : and(eq(couponCampaigns.isDefault, true), isNull(couponCampaigns.archivedAt), ne(couponCampaigns.id, keep)),
    )
}

export async function createCampaign(
  input: CampaignInput,
): Promise<{ ok: true; id: string } | { ok: false; reason: CampaignFailure }> {
  const owner = await requireOwner()
  if (!owner.ok) return owner

  const checked = validate(input)
  if (!checked.ok) return checked

  const id = randomUUID()

  try {
    await db().transaction(async (tx) => {
      if (checked.value.isDefault) await unflagOtherDefaults(tx, null)
      await tx.insert(couponCampaigns).values({ id, ...checked.value, createdBy: owner.email })
    })
  } catch (error) {
    /*
     * The one failure worth distinguishing: `unique('coupon_campaigns_code')` refusing a code
     * somebody has already used. Matched on the constraint name rather than the driver's
     * message shape, which is the half that survives a driver upgrade.
     */
    if (error instanceof Error && error.message.includes('coupon_campaigns_code')) {
      return { ok: false, reason: 'duplicate-code' }
    }
    console.error('createCampaign failed', error)
    return { ok: false, reason: 'failed' }
  }

  console.warn(`coupon campaign created: ${checked.value.code} (${checked.value.discountPercent}%) by ${owner.email}`)
  return { ok: true, id }
}

/**
 * Edit a campaign, with the two guardrails that protect people who already redeemed it.
 *
 * The discount itself is frozen the moment anybody has redeemed the campaign, and a ceiling can
 * never drop below the redemptions already counted — both from `PLAN-coupons.md`'s guardrail
 * table, and both about the same thing: what somebody was promised has to stay what they were
 * promised. The remedy for a discount that needs to change is a new campaign, which is why the
 * refusal says so.
 */
export async function updateCampaign(
  id: string,
  input: CampaignInput,
): Promise<{ ok: true } | { ok: false; reason: CampaignFailure }> {
  const owner = await requireOwner()
  if (!owner.ok) return owner

  const checked = validate(input)
  if (!checked.ok) return checked

  try {
    const existing = await campaignById(id)
    if (existing === null) return { ok: false, reason: 'not-found' }

    if (existing.redeemed > 0 && checked.value.discountPercent !== existing.discountPercent) {
      return { ok: false, reason: 'percent-locked' }
    }

    for (const limit of [checked.value.usageLimitSubscription, checked.value.usageLimitLifetime]) {
      if (limit !== null && limit < existing.redeemed) return { ok: false, reason: 'limit-below-redeemed' }
    }

    /*
     * Checked against the *incoming* row's own state, computed the same way every screen
     * computes it — so flagging an expired or exhausted campaign as the default is refused
     * before it can produce a dead `?promo=1`.
     */
    if (checked.value.isDefault) {
      const status = campaignStatus(
        { ...existing, ...checked.value, discountPercent: checked.value.discountPercent },
        new Date(),
        existing.redeemed,
      )
      if (status !== 'active' && status !== 'scheduled') return { ok: false, reason: 'default-not-live' }
    }

    await db().transaction(async (tx) => {
      if (checked.value.isDefault) await unflagOtherDefaults(tx, id)
      await tx.update(couponCampaigns).set(checked.value).where(eq(couponCampaigns.id, id))
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('coupon_campaigns_code')) {
      return { ok: false, reason: 'duplicate-code' }
    }
    console.error('updateCampaign failed', error)
    return { ok: false, reason: 'failed' }
  }

  console.warn(`coupon campaign updated: ${checked.value.code} by ${owner.email}`)
  return { ok: true }
}

/**
 * Archive a campaign — the only way to retire one.
 *
 * Never a delete: `coupon_redemptions.campaign_id` references it, and the record of what
 * somebody paid has to survive the campaign being retired. Archiving stops new redemptions and
 * changes nothing for anybody already living under the discount — their `accounts.coupon*`
 * columns keep holding until `discountEndsAt`.
 *
 * The default flag comes off in the same write, because a default that cannot be redeemed is
 * exactly the dead `?promo=1` the validations above refuse to create.
 */
export async function archiveCampaign(id: string): Promise<{ ok: true } | { ok: false; reason: CampaignFailure }> {
  const owner = await requireOwner()
  if (!owner.ok) return owner

  try {
    const updated = await db()
      .update(couponCampaigns)
      .set({ archivedAt: sql`now()`, isDefault: false })
      .where(and(eq(couponCampaigns.id, id), isNull(couponCampaigns.archivedAt)))
      .returning({ code: couponCampaigns.code })

    if (updated.length === 0) return { ok: false, reason: 'not-found' }
    console.warn(`coupon campaign archived: ${updated[0].code} by ${owner.email}`)
  } catch (error) {
    console.error('archiveCampaign failed', error)
    return { ok: false, reason: 'failed' }
  }

  return { ok: true }
}

/** Make one campaign the `?promo=1` target, taking the flag off whichever held it. */
export async function setDefaultCampaign(
  id: string,
  value: boolean,
): Promise<{ ok: true } | { ok: false; reason: CampaignFailure }> {
  const owner = await requireOwner()
  if (!owner.ok) return owner

  try {
    const existing = await campaignById(id)
    if (existing === null) return { ok: false, reason: 'not-found' }

    if (value) {
      if (!entryAllowsUrl(existing.entry)) return { ok: false, reason: 'default-needs-url' }
      if (existing.status !== 'active' && existing.status !== 'scheduled') {
        return { ok: false, reason: 'default-not-live' }
      }
    }

    await db().transaction(async (tx) => {
      if (value) await unflagOtherDefaults(tx, id)
      await tx.update(couponCampaigns).set({ isDefault: value }).where(eq(couponCampaigns.id, id))
    })

    console.warn(`coupon default ${value ? 'set to' : 'cleared from'} ${existing.code} by ${owner.email}`)
  } catch (error) {
    console.error('setDefaultCampaign failed', error)
    return { ok: false, reason: 'failed' }
  }

  return { ok: true }
}

/**
 * The `/coupons` list, behind the ownership check — so the page can be a Server Component that
 * calls one function instead of repeating the fence.
 *
 * `entryAllowsCode` and `redeemedCount` are re-exported through this module rather than read
 * from `read.ts` by the page, for one reason: `read.ts` is a plain module that imports
 * `@/lib/db`, and every one of its callers is server-side already, so there is no boundary to
 * cross. This function exists for the fence, not for the import.
 */
export async function loadCampaigns(): Promise<
  { ok: true; campaigns: NonNullable<Awaited<ReturnType<typeof allCampaigns>>> } | { ok: false; reason: CampaignFailure }
> {
  const owner = await requireOwner()
  if (!owner.ok) return owner

  const campaigns = await allCampaigns()
  if (campaigns === null) return { ok: false, reason: 'failed' }
  return { ok: true, campaigns }
}
