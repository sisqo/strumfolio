import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'

import { CouponBar } from '@/components/CouponBar'
import { CouponOverlay } from '@/components/CouponOverlay'
import { Footer } from '@/components/Footer'
import { IconCheck } from '@/components/icons'
import { LifetimeCta, PricingPlans } from '@/components/PricingPlans'
import type { ColumnPrice, ComparisonRow, PlanColumn } from '@/components/PricingPlans'
import { isOwner } from '@/lib/allowlist'
import { loadIdentity } from '@/lib/auth/actions'
import { APP_NAME } from '@/lib/brand'
import {
  appliedCopy,
  deadlineCopy,
  discountedAmount,
  durationCopy,
  firstYearCopy,
  offerCopy,
} from '@/lib/coupons/discount'
import { activeCoupon, advertisableCampaign } from '@/lib/coupons/read'
import type { Campaign } from '@/lib/coupons/read'
import { COUPON_COOKIE, OFFER_COLLAPSED_COOKIE } from '@/lib/coupons/types'
import { euro, LIFETIME, PRICES } from '@/lib/plans/prices'
import type { BillingPeriod, PaidPlan } from '@/lib/plans/prices'
import { mockCheckoutEnabled } from '@/lib/plans/resolve'
import { formatPlanDate } from '@/lib/plans/subscriptionCopy'
import { loadLifetimeOnSale } from '@/lib/settings/read'
import { PLAN_VALUES, PLANS } from '@/lib/plans/types'
import type { BookletTier, FeatureRequestTier, Plan } from '@/lib/plans/types'
import { mustChooseNow } from '@/lib/plans/viewer'
import type { Viewer } from '@/lib/plans/viewer'

const SHARE_TITLE = `${APP_NAME} — Plans and pricing`

/*
 * Whether the lifetime offer is still in the catalogue.
 *
 * **A stored setting since coupons landed**, replacing a `lifetimeOpen()` that compared today
 * against `LIFETIME.closesOn`. The history is worth keeping because the destination is the
 * same one that comparison was already walking towards: it had been converted from a module
 * constant to a function precisely so it could not freeze at build time, and the duty it still
 * left behind — a human remembering to redeploy on the closing day — is what a row in
 * `app_settings` finally discharges. See `loadLifetimeOnSale` and the `lifetime.on_sale` key.
 *
 * The clock is no longer part of this answer at all, which is the point: an owner closes the
 * offer on the day they decide to, not on the first deploy after a date compiled into the code.
 */

/*
 * Every number in this sentence is interpolated/*
 * Every number in this sentence is interpolated, like every number on the page below it:
 * a meta description is the one place a stale price is invisible to whoever changed the
 * real one, because nothing on the screen shows it.
 *
 * "free to start" is deliberately not the wording. It reads as a trial, and the first
 * thing this page says is that there is no trial — the free plan has no end date. That
 * distinction is the same one `DESCRIPTION` on /login now makes.
 *
 * The lifetime clause is gated on the same setting the block itself is, and this is the half
 * that is easy to miss: a meta description is the one place a withdrawn offer would keep being
 * advertised with nothing on the screen to show it. This sentence is what a shared link renders
 * as a card, so leaving it ungated would put "€199.99 once for Premium for life" in front of
 * readers who cannot buy it, in the place nobody thinks to look.
 *
 * **No coupon reaches this sentence, and that is a decision.** `generateMetadata` receives no
 * `searchParams`, so it cannot see one — and it should not: a link somebody copies while a
 * campaign is applied would otherwise advertise a discounted price to everyone who opens it,
 * including readers the campaign was never for. Written down here so it does not later read as
 * an oversight.
 *
 * Async, and `generateMetadata` below rather than a `metadata` constant, because the answer is
 * now a database read: the clause and the block on the screen have to agree, and a constant
 * evaluated at module load cannot ask.
 */
function describe(lifetimeOnSale: boolean): string {
  return (
    `Four plans, priced in euro with tax included: a free plan with no end date, then ` +
    `${euro(PRICES.standard.year.amount)}, ${euro(PRICES.plus.year.amount)} or ` +
    `${euro(PRICES.premium.year.amount)} a year` +
    (lifetimeOnSale ? ` — or ${euro(LIFETIME.amount)} once for Premium for life.` : `.`)
  )
}

/*
 * `title: 'Pricing'` through the root layout's `%s · Strumfolio` template, so a shared link
 * reads "Pricing · Strumfolio" and names the app without naming it twice. /login opts out of
 * the template with `absolute` only because its own title already contains the name; this
 * page has no such reason.
 *
 * `openGraph.title` and `twitter.title` still spell the app name out, and that is not a
 * duplication to tidy away: Next applies the title template to `title` alone, never to
 * either of these, so a bare 'Pricing' here would be exactly the meaningless card the
 * template is what saves us from. `images` is repeated too, for the same reason: the root
 * layout's own `openGraph.images` does not carry over once a page declares its own
 * `openGraph` object — Next replaces the block wholesale rather than merging into it.
 */
export async function generateMetadata(): Promise<Metadata> {
  const description = describe(await loadLifetimeOnSale())

  return {
    title: 'Pricing',
    description,
    openGraph: {
      title: SHARE_TITLE,
      description,
      locale: 'en_US',
      type: 'website',
      images: [{ url: '/brand/og-image.png', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: SHARE_TITLE,
      description,
      images: ['/brand/og-image.png'],
    },
  }
}

/*
 * The v3.4 redesign's own hero line, replacing the longer disclosure-heavy `LEDE` this used
 * to be — the tax/currency/no-trial facts it carried still matter and are not gone, only
 * moved: see `BILLING_NOTE`, below, in the smaller print beside the prices themselves rather
 * than in the first sentence a visitor reads.
 */
const HERO_SUBTITLE =
  'One account, every device, nothing to install — your chords, in your key, with your capo — ' +
  'even offline, and on every screen in the room.'

/*
 * The three facts `LEDE` used to say — tax included, a currency-conversion disclaimer, no free
 * trial — are gone from this page entirely (v3.4), matching the design exactly rather than
 * keeping a demoted paragraph the design does not have. The gap this leaves, worth naming
 * because it is not stated anywhere else on the site either: nothing currently tells a reader
 * their bank may convert or add a fee. Left as a known omission rather than invented text the
 * mock does not show.
 *
 * The other clause this page used to carry — «the prices on this page are final» — is gone too.
 * Nothing in this repository can make that promise — `prices.ts` says in its own header that its
 * table and Paddle's catalogue "are two things that must agree, and nothing in this repository
 * can check that they do", and every `paddleId` is still empty.
 *
 * There used to be a third clause here as well, hedging on whether the checkout was even open —
 * `NO_CHECKOUT`, read out loud above the cards regardless of `CHECKOUT_LIVE`. The design has no
 * such notice anywhere, on any build: it shows "Choose Standard"/"Choose Plus"/"Choose Premium"
 * directly, the same as this page now does once `CHECKOUT_LIVE` is true. Keeping the sentence
 * unconditionally was worse than a missed line in a mock — with the mock checkout switched on in
 * production, the page was both offering a real "Choose Standard" button *and* telling the same
 * reader in the paragraph above it that "the checkout is not open". Removed rather than made
 * conditional on `CHECKOUT_LIVE`, because a notice that only exists to disappear the moment
 * checkout opens is exactly the sentence the design never had to begin with.
 */

/*
 * The v3.4 redesign's own line for the lifetime block, replacing `LIFETIME_WHAT` and
 * `LIFETIME_WHEN` — the closing date moves out of this sentence entirely and into
 * `LIFETIME_PILL` below, the small badge beside the price, which is where the mock puts it.
 * What survives from the two constants this replaces: Lifetime is still Premium, exactly,
 * with no renewal to ever come due, and it still inherits whatever Premium becomes later —
 * both true regardless of how the sentence describing them is worded.
 */
const LIFETIME_WHAT =
  'Premium with no renewal date, ever — pay once and keep it, including everything Premium ' +
  'becomes later.'

/*
 * The badge beside the Lifetime price — now a function of the campaign discounting it, where
 * it used to interpolate `LIFETIME.closesOnLabel`.
 *
 * `null` whenever no coupon covers the Lifetime, which is the ordinary state: the badge exists
 * to qualify a struck price, so with nothing struck there is nothing to qualify. That is the
 * same conditionality `ColumnPrice.was` carries and for the same reason.
 *
 * Beside the price rather than above it — the redesign's own call, so the two read as one fact
 * ("this number, until this date") instead of a price with a caveat trailing after it. And
 * still "promo price valid until" and never "price valid until": what ends on that date is the
 * offer, not the plan.
 */
function lifetimePill(coupon: Campaign | null): string | null {
  if (coupon === null || !coupon.appliesToLifetime) return null
  if (coupon.expiresAt === null) return `Promo price with ${coupon.code}`
  return `Promo price valid until ${formatPlanDate(coupon.expiresAt)}`
}

/*
 * What replaces the whole of "If a plan ends" — the section heading, the cancelling
 * mechanics, and the fourteen-day refund promise that used to close it. This is the v3.4
 * redesign's own call: the fuller rule is not written anywhere else on the site, and going
 * with only this shorter reassurance is a deliberate trade of that explanatory prose for the
 * lighter page the redesign asks for, made once and knowingly rather than lost by accident.
 */
/** The lead sentence, bold in the design — see the JSX below for the plain rest of it. */
const TRUST_NOTE_LEAD = 'Nothing you put in here is ever deleted'

/*
 * «printable» was here too, and was the one word in this sentence the code refuses. A
 * subscription ending drops the account to `free`, `PLANS.free.booklet` is `'no'`, and
 * `loadBooklet` (`lib/booklet/actions.ts`) answers `plan-required` — deliberately, and pinned
 * from the other side by `entitlements.test.ts`'s expiry block, which asserts the lapsed
 * limits are `PLANS.free` field for field. There is no second way to print, either: the
 * booklet PDF is the only printing path in the app, and no `@media print` rule exists
 * anywhere in `globals.css`. So the promise had no build in which it was true, rather than
 * being true today and at risk later.
 *
 * The other two words stay because both hold with nothing else live: reading is gated
 * nowhere, and `exportAll`/`exportOrganized` (`lib/import/actions.ts`) check the reader's
 * role and never the plan. The same sentence in `planChangeEmail` (`lib/email/templates.ts`)
 * carried the same third word and lost it in the same change — that message is sent at
 * exactly the moment this claim gets tested, which is the worst place to overpromise.
 */
const TRUST_NOTE_REST = 'If a subscription ends, your songs stay readable and exportable.'

/**
 * Read once and reused by every column and by the Lifetime block below, rather than called
 * separately in each: it is a build-time env read (see its own comment in `resolve.ts`), so
 * every call in one build agrees regardless, but one name for "is the mock live" is one fewer
 * thing to keep saying the same way.
 */
const CHECKOUT_LIVE = mockCheckoutEnabled()

/**
 * One price slot — the number a card shows, and everything a coupon adds beside it.
 *
 * With no coupon this is exactly what it always was: the amount and its suffix, and **no
 * struck price at all**. That absence is the legal argument rather than a rendering choice —
 * the commercial deck rejects struck prices outright, and what answers it is that the listino
 * is genuinely what a reader without a coupon pays. See `ColumnPrice.was`.
 *
 * With one, three things arrive: the discounted amount, the listino struck through, and the
 * sentences underneath. `firstYearCopy` is monthly-only on purpose — the yearly card's own
 * duration line already names both prices and the year they change, so a second line about
 * twelve months would be the same fact twice.
 */
function priceSlot(plan: PaidPlan, cycle: BillingPeriod, coupon: Campaign | null): ColumnPrice {
  const full = PRICES[plan][cycle].amount
  const suffix = cycle === 'year' ? '/yr' : '/mo'
  if (coupon === null) return { amount: euro(full), suffix }

  const discounted = discountedAmount(full, coupon.discountPercent)
  const notes = [durationCopy(full, discounted, coupon.discountMonths, cycle)]
  if (cycle === 'month') {
    const firstYear = firstYearCopy(full, discounted, coupon.discountMonths)
    if (firstYear !== null) notes.push(firstYear)
  }

  return { amount: euro(discounted), suffix, was: euro(full), notes }
}

/** A paid column, worded once for the three that differ only in their amounts and their audience. */
function paidColumn(name: string, plan: PaidPlan, audience: string, coupon: Campaign | null): PlanColumn {
  return {
    name,
    /* Always `plan`, unlike `checkoutPlan` below — a reader's own rank comparison against
       this column has to hold even the day `CHECKOUT_LIVE` is off and there is nothing to
       buy, or "you are on Standard already" would silently stop being true on this card. */
    slug: plan,
    /*
     * Just the number and a small suffix, the design's own shape — see `ColumnPrice`'s own
     * comment in `PricingPlans.tsx` for what this replaced: a worded sentence per period,
     * plus a second line under it disclosing the renewal, on every paid column. Neither the
     * "per year"/"per month" wording nor the renewal disclosure has a home in this design,
     * on any column, so both are gone rather than kept unrendered.
     *
     * The lines a coupon adds are a different matter and do have a home: they are what says
     * how long the discount lasts and what comes after it, which is the one disclosure this
     * page cannot do without — an increase from €2.44 to €3.49 at the fourth charge is
     * exactly what gets disputed when it was never written down.
     */
    price: {
      year: priceSlot(plan, 'year', coupon),
      month: priceSlot(plan, 'month', coupon),
    },
    audience,
    /* Standard and Premium both buy something — the faint tint `.is-paid` draws for both,
       never for Free (nothing bought) or Plus (its own `.is-featured` instead). */
    paid: true,
    checkoutPlan: CHECKOUT_LIVE ? plan : undefined,
  }
}

/**
 * The four cards' worth of copy, per request.
 *
 * A function where this was a module-scope `COLUMNS` constant, and the page's own comment about
 * "only this overlay varies per request" has been updated with it: a coupon changes what every
 * paid card *says*, not merely which one is ringed, so the prices cannot be computed once per
 * process any more. The words themselves are still written exactly once, here.
 */
function columnsFor(coupon: Campaign | null): PlanColumn[] {
  return [
  {
    name: 'Free',
    slug: 'free',
    /* Both states are the same, so the free column does not move under a toggle that has
       nothing to say about it — no suffix either, the same reason. A coupon never touches it:
       there is no price to discount. */
    price: {
      year: { amount: euro('0'), suffix: '' },
      month: { amount: euro('0'), suffix: '' },
    },
    /*
     * Not «to find out whether this is your app», which framed the free plan as an evaluation
     * period — the trial reading the lede spends a sentence denying and /login's own repair
     * rejects by name. The numbers are named here now (they used to live only in the table two
     * sections down) because the v3.4 cards say what living on the plan is actually like, not
     * only that it does not run out.
     */
    audience: `Just you and the instrument. ${PLANS.free.songbooks} songbook, ${PLANS.free.songs} songs — ` +
      'no card, no end date, no trial to run out.',
    /* Free is not sold through `checkout.ts` — it is what an account already is — so its own
       card action is never conditional on `CHECKOUT_LIVE`, unlike every paid column's. */
    cta: true,
  },
  paidColumn(
    'Standard',
    'standard',
    `You lead, one screen follows. ${PLANS.standard.songbooks} songbooks, ${PLANS.standard.songs} songs, ` +
      'a printed booklet.',
    coupon,
  ),
  {
    ...paidColumn(
      'Plus',
      'plus',
      `Unlimited songbooks and songs, up to ${PLANS.plus.devices} other screens, printed booklet with no ` +
        'credit line.',
      coupon,
    ),
    /*
     * The one column raised above the rest — see `.plan-card.is-featured`'s own comment on
     * why this is a reversal and not an oversight. Plus, and never more than one: two ribbons
     * on the same row would each cancel the other's claim to be the one to pick.
     */
    featured: true,
    /* Overrides `paidColumn`'s own `paid: true` — Plus gets `.is-featured` instead, and a
       card must never carry both tints. */
    paid: false,
  },
  /*
   * The mock's own three-clause rhythm, comma-joined exactly like Plus' card above — but not
   * its exact words. «With your name» is the phrase the mock uses for premium's booklet, and
   * it claims a feature `bookletCell`'s own comment says does not exist yet: premium's
   * `custom` tier behaves exactly like plus' `plain` today, credit line dropped and nothing
   * more personalised than that. «No credit line», Plus' own phrase, is the sentence that
   * stays true. The device count that actually sets Premium apart from Plus is not named in
   * either card — the mock does not name it here either — and is left to the table below.
   */
  paidColumn(
    'Premium',
    'premium',
    'The whole room follows, unlimited songs, printed booklet with no credit line.',
    coupon,
  ),
  ]
}

const INCLUDED = 'Included'

/** A cap as a table cell. `null` is genuinely unlimited — no limit in the software at all. */
function capCell(limit: number | null): string {
  return limit === null ? 'Unlimited' : String(limit)
}

/**
 * What a booklet tier is called in a table cell.
 *
 * `plain` and `custom` used to return the identical string, and this map used to be the
 * code-level guard that kept a customizable booklet off this page: `bookletBrandLine` asks
 * only whether the tier is `branded`, so premium's `custom` behaves exactly like plus' `plain`
 * in the code today. The two cases are now split apart — premium's cell names the custom line
 * — which makes this cell a **roadmap claim** rather than a description of what the PDF
 * currently prints. What premium's booklet does today is exactly what plus' does.
 *
 * **So the cell says so, in as many words.** It carried the claim in the present tense for a
 * while, and that was the one unlabelled promise on a page where every other future feature is
 * worded `COMING_SOON` — the two "Printed booklet themes" rows and "AI MCP integration" below.
 * The parenthetical is lower-case rather than that constant reused verbatim, because this cell
 * is a description with a qualifier appended and not a cell whose whole content is the
 * qualifier; the three rows below say nothing else, so there `Coming soon` opens the sentence.
 *
 * A `switch` over the union rather than an `=== 'branded'` test, so the day a fifth tier is
 * added this stops compiling instead of quietly describing it as "without that line".
 * `prices.test.ts` pins the gap from the other side, next to the numbers: it still asserts
 * that nothing in the code can tell `plain` and `custom` apart, and fails the day something
 * can — which is the day the parenthetical here comes back off.
 */
function bookletCell(tier: BookletTier): string | null {
  switch (tier) {
    case 'no':
      return null
    case 'branded':
      return 'With a «Printed with Strumfolio» line'
    case 'plain':
      return 'Without that line'
    case 'custom':
      return 'With your custom line (coming soon)'
  }
}

/**
 * What a feature-request tier is called in a table cell.
 *
 * A `switch` over the union rather than two ternaries, for `bookletCell`'s reason: a fourth
 * tier should stop this compiling rather than quietly fall through to «Yes». `no` is no cell
 * at all rather than the word "No" — the same choice `deviceCell` makes about free's 0, and
 * the same one every row on this page makes about a plan that simply does not include
 * something.
 */
function featureRequestCell(tier: FeatureRequestTier): string | null {
  switch (tier) {
    case 'no':
      return null
    case 'yes':
      return 'Yes'
    case 'priority':
      return 'Yes, with priority'
  }
}

/**
 * The device ceiling as a table cell, with free's 0 written as no cell at all.
 *
 * Never "0", for the reason `capWorthNaming` exists in `types.ts`: "0 of 0" reads as a fault in
 * the software, and so does a 0 in a table. Free cannot lead a session at all, so this row is
 * simply not part of that plan.
 *
 * Premium's cell used to be hand-written as "Unlimited" (the v3.4 redesign's own call) rather
 * than through this function — reversed for the reason the row's own comment gives: it
 * disagreed with `/login`'s FAQ, which already states the same 100 literally.
 */
function deviceCell(devices: number): string | null {
  return devices === 0 ? null : String(devices)
}

/** A feature named on this page before the gate that would enforce it exists — see the two
 * "Printed booklet …" theme rows and "AI MCP integration" below for the one place this
 * table says so out loud. */
const COMING_SOON = 'Coming soon'

/**
 * The comparison, one row per thing a reader is choosing between — every number read from
 * `PLANS`, never typed here, so this table and the gates cannot drift.
 *
 * The consequence of going without lives in the row label, not in the cells: three cells
 * cannot each carry a clause without the table growing wider than a laptop, and it would be
 * the same sentence said three times. So each row header is two lines — the label, then what
 * living without it is like — and the cells stay bare values, "Included", or nothing.
 *
 * One thing is deliberately still absent, for the reason that would make it easy to
 * "complete": there is no smart-capo row, although `PLANS.free.smartCapo === false` says free
 * does not have it. `Entitlements.refused` has seven fields and `smartCapo` is not one of them,
 * and `PlanLimits` says out loud that no call site reads the field and that no gate may be
 * invented for it. So the free plan gets the smart capo suggestion today and would still get
 * it the day `SONGBOOK_PLANS` is switched on — a row here would sell Standard for something
 * Free already delivers.
 *
 * The customizable booklet is no longer in that same boat. `bookletCell`'s own comment still
 * holds — `custom` behaves exactly like `plain` today — and the "Printed booklet" cell above
 * does name the custom line, but with «(coming soon)» on it, so it makes the claim without
 * dating it to today. The two "Printed booklet …" rows below name the themed booklet the same
 * way, worded `COMING_SOON`. All three are deliberate roadmap commitments on a public page,
 * confirmed rather than assumed: a reader on Plus or Premium is being told a themed booklet is
 * coming, not that it is here. "AI MCP integration" is the same kind of row for the same
 * reason, confirmed separately: nothing in this repository speaks MCP yet.
 *
 * Which leaves this table with **no unlabelled promise on it**, and that is the property worth
 * keeping rather than a tidiness to preserve: every cell either describes what the gates do
 * today or says out loud that it does not yet.
 */
const ROWS: ComparisonRow[] = [
  {
    label: 'Songbooks',
    note: 'Maximum number of songbooks.',
    cells: [
      capCell(PLANS.free.songbooks),
      capCell(PLANS.standard.songbooks),
      capCell(PLANS.plus.songbooks),
      capCell(PLANS.premium.songbooks),
    ],
  },
  {
    label: 'Songs',
    note: 'Maximum number of songs.',
    cells: [
      capCell(PLANS.free.songs),
      capCell(PLANS.standard.songs),
      capCell(PLANS.plus.songs),
      capCell(PLANS.premium.songs),
    ],
  },
  /*
   * One row, where the previous design had three — "Import and export ChordPro", "Transpose,
   * capo, auto-scroll, text size" and "Offline, and synced across your own devices" — because
   * all three answered `[INCLUDED, INCLUDED, INCLUDED, INCLUDED]` and a table that says the
   * same four-way tie three times in a row says it once too many. The v3.4 redesign's own
   * "Reading, offline & sync" row folds the three claims into one sentence without dropping
   * any of them.
   */
  {
    label: 'Reading, offline & sync',
    note: 'Offline, transpose, capo chord conversion, auto-scroll.',
    cells: [INCLUDED, INCLUDED, INCLUDED, INCLUDED],
  },
  {
    label: 'Chord shapes',
    /*
     * **The client-side half of this gate now exists**, which is what lets this row go back to
     * naming one instrument for Free. Its history is worth keeping, because the row has been
     * wrong in both directions: it first claimed a gate the code did not have (Free said
     * «Guitar» while a free reader could tap Ukulele and read ukulele shapes all session), and
     * was then corrected to name both instruments in every column, differing only in whether
     * the choice was «saved» — true at the time, and the honest thing to print while
     * `saveGlobalPrefs` was the only control point.
     *
     * What changed is `ReadingPanel`: tapping Ukulele on a plan without it now opens the
     * upgrade dialog instead of switching the diagrams, so Free really does read guitar shapes.
     * `saveGlobalPrefs` is still the half that cannot be bypassed — see `PlanLimits.ukulele`
     * for why neither half is the whole gate — and it is why this claim survives someone
     * reaching past the interface: the choice cannot be stored, so it cannot come back on the
     * next reload or on another device.
     */
    note: 'Tap any chord to see the fingering, on the instrument you play.',
    cells: (['free', 'standard', 'plus', 'premium'] as const).map((plan) =>
      PLANS[plan].ukulele ? 'Guitar and ukulele' : 'Guitar',
    ),
  },
  {
    label: '«Strum Together» session',
    /*
     * The design's own note names the guest's experience, not the cells' own subject (who may
     * lead) — the same gap the mock itself leaves between this row's note and its cells. Kept
     * rather than replaced with a note that explains the cells better, matching the design as
     * given: a guest reads the same song, in the same key, on their own phone, on every plan.
     * `GUEST_LINK`'s fuller version of this same claim lived in the feature-spotlight band
     * this row's note now stands in for (v3.4 removed the band).
     */
    note: 'Everyone on their own screen, on your line, in your key.',
    cells: (['free', 'standard', 'plus', 'premium'] as const).map((plan) =>
      PLANS[plan].mayLead ? INCLUDED : null,
    ),
  },
  {
    label: '«Strum Together» devices',
    note: 'Maximum number of devices following a «Strum Together» session.',
    /*
     * `deviceCell(PLANS.premium.devices)` prints the honest "100" here rather than the v3.4
     * redesign's own "Unlimited" — reversed because `/login`'s FAQ ("How many people can join
     * a Strum Together session?") already states the same 100 literally, with its own comment
     * explicitly rejecting "as many as you like" as false; the two public pages naming the
     * same real cap two different ways was the actual bug, and this table is the one that
     * moved. No change to what `admits` enforces in `strumTogether/devices.ts` either way — a
     * 101st guest was and still is refused.
     */
    cells: [
      deviceCell(PLANS.free.devices),
      deviceCell(PLANS.standard.devices),
      deviceCell(PLANS.plus.devices),
      deviceCell(PLANS.premium.devices),
    ],
  },
  {
    label: 'Printed booklet',
    note: 'A PDF ready to print: cover, index, one song a page.',
    cells: [
      bookletCell(PLANS.free.booklet),
      bookletCell(PLANS.standard.booklet),
      bookletCell(PLANS.plus.booklet),
      bookletCell(PLANS.premium.booklet),
    ],
  },
  /*
   * The redesign's own two new rows, immediately under "Printed booklet" rather than at the
   * table's foot: both are about that same PDF, and a reader comparing what it looks like
   * should find the claim beside the feature it modifies, not after "Strum Together" or
   * "Feature requests" have already changed the subject.
   */
  {
    label: 'Printed booklet themes',
    note: 'Choose a visual style for the printed booklet.',
    /* Standard already has a booklet (`branded`, above) but no theme to pick for it — this
       row is about a choice, not about whether a PDF exists at all. */
    cells: [null, null, COMING_SOON, COMING_SOON],
  },
  {
    label: 'Printed booklet custom themes',
    note: 'Design your own theme for the printed booklet.',
    /* Plus and Premium both carry `custom` in `bookletCell`'s own sense — identical today —
       but only Premium gets this row's promise: the roadmap draws the line one row up from
       where the code currently does. */
    cells: [null, null, null, COMING_SOON],
  },
  /*
   * A second roadmap commitment, confirmed the same way the two booklet-theme rows above
   * were: nothing in this codebase talks to an AI assistant today, let alone over MCP —
   * this row promises a server that does not exist yet, not a soft cap `PLANS` already
   * enforces the way every row above it does.
   */
  {
    label: 'AI MCP integration',
    note: 'Connect an AI assistant to your songbooks over MCP.',
    cells: [null, null, null, COMING_SOON],
  },
  {
    label: 'Feature requests',
    /*
     * Two plans now, not one, and the note has to carry both: Plus buys a way in, Premium buys
     * being read first. The old note named only top prioritization, which was right while
     * Premium was the only column with a cell and would now describe Plus' cell wrongly.
     *
     * Unlike every other row on this page, this one has a **screen** behind it — the hamburger
     * menu's "Request a feature", refused by `requestFeature` on a plan whose tier is `no`. So
     * the cells read the tier itself rather than being written here: `featureRequestCell` is a
     * total map over the union, which is what stops this row and that gate from drifting.
     *
     * `priority` is the one claim on this page that no code enforces and none could — what it
     * buys is the order a person answers in. It is carried into the request email so whoever
     * reads the inbox can honour it, which is as close to a gate as a promise kept by people
     * gets. Not marked `COMING_SOON`, because unlike the booklet themes the feature itself is
     * here: the request really does reach the dev team today.
     */
    note: 'Ask the dev team for what the app is missing — from Premium, your request is read first.',
    cells: (['free', 'standard', 'plus', 'premium'] as const).map((plan) =>
      featureRequestCell(PLANS[plan].featureRequests),
    ),
  },
]

/**
 * What Strumfolio costs — the one page a visitor reads while deciding whether to pay, and the
 * only page in the app that has to be readable by somebody who has never signed in and by a
 * reader who signed in months ago, without knowing which of the two is looking.
 *
 * **This page was statically generated until v3.13, and deliberately is not any more.** The
 * paragraph that used to stand here forbade exactly what the line below now does — `auth()`,
 * by way of `loadIdentity` — so the reversal is recorded rather than quietly overwritten.
 *
 * What the rule bought was a price list served with no database read and no cold start, for a
 * page whose content is a constant. What it cost is in `Viewer`'s own comment
 * (`PricingPlans.tsx`) and is the reason it went: the content is a constant, but *who is
 * reading* is not, and a static page cannot know. Rendered statically, this page's first paint
 * told every reader the same thing — nobody is signed in — which is right for a visitor and
 * wrong for the one reader who cannot have arrived here any other way: `requirePlanChoice`
 * redirects an account that has not chosen a plan *to this page*, and it was met by three
 * cards and a lifetime panel inviting it to register for an account it already has, plus a
 * header offering to sign it in. A placeholder until hydration would have hidden the wrong
 * answer without producing a right one, and would have taken the buttons out of the static
 * HTML for the visitors the staticness was for.
 *
 * So the cost is now paid on every read: one `auth()` cookie decode, plus the two queries
 * `loadIdentity` makes (`planNamesOf`, `hasChosenPlan`). For a page nobody loads in a loop,
 * against the alternative of a page that cannot say anything true until JavaScript runs, that
 * is the cheaper of the two. Two things follow, and both are improvements rather than
 * consequences to manage: `lifetimeOpen()` now reads the reader's clock instead of the build's
 * (see its own comment), and `generateMetadata` closes the lifetime clause on the same day the
 * block on the screen closes.
 *
 * **Now also awaits `searchParams`** (`?plan=`), the one query param `FeaturePaywallModal`'s
 * "See {plan}" link sets when a gated feature sent a reader here — see `highlightPlan` below.
 * The property the old comment stated still mostly holds, narrowed by exactly that: two
 * readers in the same identity state and the same query string still see the same HTML: the
 * page reads no per-request state beyond the identity above and this one param. Still no
 * `export const dynamic`: reading cookies already makes this page dynamic in this router, so
 * the declaration would only restate what `loadIdentity` forces regardless of `searchParams`.
 *
 * One thing left at module scope on purpose: `CHECKOUT_LIVE`. It is a synchronous
 * `process.env` read, so it is evaluated once per server process rather than once per request
 * — which is the same reach it had when this page was built once per deploy, since flipping
 * that flag in Vercel redeploys anyway. `lifetimeOpen()` is a function precisely because the
 * clock is the one thing that does move underneath a long-lived process; a flag in the
 * environment does not.
 *
 * Not inside the `(legal)` route group, whose layout is documented as the shell shared by
 * the four legal pages and wraps its children in `legal-content` prose at `max-w-2xl` —
 * four price columns do not fit that box, and this is not a legal document. It has its own
 * `layout.tsx` instead (`PublicHeader` at 70rem, matching this page's own width), and
 * renders its own `<main>` and its own `<Footer />`, which is the shape `/help/chordpro`
 * already uses; the Footer is also how the legal pages stay reachable from here.
 *
 * Deliberately **not** in `scripts/precache-routes.ts`, and that list's own comment is why
 * somebody will want to add it: it says the public routes that need no session belong there.
 * A precache entry's lifetime is a deploy, not a visit, and for an installed app that has
 * not been opened online that can be weeks — so the lifetime block, which names the day the
 * offer closes, could be served with confidence weeks after that day had passed.
 * A price is a fact with a date on it. Offline this page is a dead link, which is the right
 * failure and the same one `/edit` already chooses in `sw.ts`: better a page that refuses to
 * open than one that opens with last month's prices.
 *
 * The reader's own theme, like every other page now — a comparison table that reads
 * correctly in both themes anyway, drawn entirely in tokens.
 */
export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; coupon?: string; promo?: string }>
}) {
  /*
   * The whole reason this page is no longer static. `loadIdentity` is the same read
   * `RoleProvider` makes from the client, called here instead so that every card, the lifetime
   * panel and the notice above them are already right in the first byte of HTML — see `Viewer`
   * in `PricingPlans.tsx` for what the client-side answer got wrong in the meantime.
   *
   * `null` for a visitor, which is the majority case and the one the shape of `Viewer` keeps
   * simple: one object, four fields, no "still loading" third state to word a sentence for.
   */
  const identity = await loadIdentity()

  /*
   * The one column `FeaturePaywallModal`'s "See {plan}" link named, or `null` for every other
   * arrival at this page (typed in directly, reached from the footer, the mandatory gate…).
   * Checked against `PLAN_VALUES` rather than trusted as a `Plan`: this is a query string, so
   * an unrecognised or absent value highlights nothing rather than throwing — the same
   * "wrong input degrades to no claim" instinct `readPlan` states for a database column,
   * applied here to a URL instead.
   */
  const { plan: planParam, coupon: couponParam, promo: promoParam } = await searchParams
  const highlightPlan: Plan | null = PLAN_VALUES.includes(planParam as Plan) ? (planParam as Plan) : null
  const viewer: Viewer = {
    email: identity?.email ?? null,
    /*
     * The gate's own question, asked the same way `requirePlanChoice` asks it — `isOwner` and
     * then the stored fact. `loadIdentity().planChosen` is only the second half: it comes from
     * `hasChosenPlan`, which has no notion of the exemption a global owner gets, so an owner
     * whose row has never been stamped comes back "has not chosen" while nothing anywhere is
     * stopping them. Read raw, this page told its own author «One step left» in front of a
     * gate they walk straight through.
     */
    mustChoosePlan:
      identity !== null && !isOwner(identity.email, process.env.ALLOWED_EMAILS) && !identity.planChosen,
    plan: identity?.plan ?? null,
    subscriptionPlan: identity?.subscriptionPlan ?? null,
  }

  /*
   * The coupon this request is arriving with, and whether the Lifetime is on sale — read
   * together, because `bannerCopy` needs both to decide whether to say «subscriptions».
   *
   * `activeCoupon` is what settles precedence: an explicit `?coupon=CODE` beats `?promo=1`,
   * and the cookie is the fallback. **Nothing here trusts any of the three** — the code is a
   * pointer, and the campaign's state, window, ceilings and `entry` are all re-read from the
   * table on every request. See `lib/coupons/read.ts`' own header.
   */
  const jar = await cookies()
  const cookieCode = jar.get(COUPON_COOKIE)?.value ?? null
  /* Read here rather than in the component, so the bar is in the server-rendered HTML in the
     state this reader left it — see `CouponOverlay.initiallyCollapsed`. */
  const offerCollapsed = jar.get(OFFER_COLLAPSED_COOKIE)?.value === '1'
  const [coupon, lifetimeIsOpen, advertisable] = await Promise.all([
    activeCoupon({
      coupon: typeof couponParam === 'string' ? couponParam : undefined,
      promo: typeof promoParam === 'string' ? promoParam : undefined,
      cookie: cookieCode,
    }),
    loadLifetimeOnSale(),
    /*
     * The offer to *advertise*, which is a different question from the one applied: the overlay
     * sells a campaign to somebody who has not taken it, and `CouponBar` confirms one that has
     * been taken. Read unconditionally rather than behind `coupon === null` so both answers
     * come from the same instant — a campaign that expires between two awaits would otherwise
     * leave the page showing an applied discount and an advertisement for it at once.
     */
    advertisableCampaign(),
  ])

  /* The two never show together, and this is the one line that guarantees it. */
  const offer = coupon === null ? advertisable : null
  /* Derived once: `offerCopy` returns all three strings together precisely so the numeral, the
     stub and the headline cannot be computed from different inputs. */
  const offerWords = offer === null ? null : offerCopy(offer.discountPercent, offer.discountMonths)

  /*
   * The URL brought a coupon the cookie does not hold yet — handed to `CouponBar`, which
   * writes it once from an effect. Compared against the cookie so a reader reloading
   * `/pricing?promo=1` does not repeat the write on every load; `undefined` the rest of the
   * time, which is what makes that effect a no-op.
   */
  const persist = coupon !== null && coupon.code !== cookieCode ? coupon.code : undefined

  /*
   * The Lifetime's own two coupon facts, derived once so the block below reads as markup.
   * `null` on both whenever no campaign covers the Lifetime, which is the default state of
   * `applies_to_lifetime` and therefore the ordinary one.
   */
  const lifetimeDiscount =
    coupon !== null && coupon.appliesToLifetime ? discountedAmount(LIFETIME.amount, coupon.discountPercent) : null
  const lifetimePillText = lifetimePill(coupon)

  /*
   * The applied bar's two lines, composed from the campaign's own facts — never a stored
   * string. See `appliedCopy`: a bar assembled from what the discount actually does cannot
   * promise what it does not, and a hand-written headline can. `lifetimeIsOpen` is what decides
   * whether the Lifetime is worth naming as an exclusion: with it withdrawn from sale there is
   * nothing for the coupon to be excluding.
   */
  const couponBanner = coupon === null ? null : appliedCopy(coupon, lifetimeIsOpen, formatPlanDate)

  /*
   * Two overlays on the copy written once in `columnsFor`: the coupon, which changes what
   * every paid card *says*, and `highlightPlan`, which changes only which one is ringed. The
   * first is why this is a function call per request rather than the module-scope `COLUMNS`
   * constant it used to be — see `columnsFor`'s own comment.
   */
  const priced = columnsFor(coupon)
  const columns =
    highlightPlan === null
      ? priced
      : priced.map((column) => (column.slug === highlightPlan ? { ...column, highlighted: true } : column))

  return (
    <main className="mx-auto w-full max-w-[70rem] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
      <div className="text-center">
        {/*
          * `.landing-title`, not `.screen-title` — the design's own 48px, matching /login's own
          * hero rather than the smaller size every other internal screen's H1 uses. This is the
          * one other page that opens with a title page rather than a place to read from. No
          * eyebrow above it any more (the redesign's own removal) — `<main>`'s own top padding
          * is now the only thing separating it from the bar above.
          */}
        {/*
          * Two headings for the two things this page is. «What Strumfolio costs» is a price
          * list, which is what a visitor and an existing customer both came for. But a reader
          * the v3.7 gate has stopped did not come for a price list — they were sent here, and
          * every card in front of them says «Choose <plan>» rather than «Upgrade»: for them the
          * page is a step to complete, and the heading now says so.
          *
          * `mustChooseNow` and not a second `email !== null && mustChoosePlan` written out here
          * — that shared function is what keeps this heading and those buttons from ever
          * describing two different screens; see its own comment in `PricingPlans.tsx`.
          *
          * `generateMetadata` deliberately does not follow: the tab title and the share card are
          * about the page, not about who happens to be reading it, and «Choose your plan» in a
          * shared link would be an instruction to somebody nobody is gating.
          */}
        <h1 className="landing-title">
          {mustChooseNow(viewer) ? 'Choose your plan' : 'What Strumfolio costs'}
        </h1>
        <p className="mx-auto mt-4 max-w-[38rem] text-[1.03125rem] leading-[1.6] text-muted">
          {HERO_SUBTITLE}
        </p>
      </div>

      {/*
        * Above the cards, not below them: it is the reason the numbers underneath say what they
        * say, and a reader who scrolls past four discounted prices before finding out why has
        * already formed the wrong idea about the listino.
        */}
      {/*
        * `CouponBar` is now the *applied* state and the typed-code input, and nothing else: the
        * overlay below has taken over advertising an offer nobody has claimed. So this row is
        * hidden exactly when the overlay is showing, which is the one arrangement in which the
        * page never carries two coupon controls at once — see `offer`.
        */}
      {offer === null && (
        <section className="mt-8">
          <CouponBar applied={couponBanner} persist={persist} />
        </section>
      )}

      <section className="mt-5">
        <PricingPlans
          columns={columns}
          rows={ROWS}
          tableTitle="What changes between plans"
          viewer={viewer}
          couponCode={coupon?.code}
        />
      </section>

      {/*
        * Rendered only while the offer is open — see `lifetimeOpen()`. The block states its own
        * closing date, so left ungated it would spend 2027 advertising a price at a price list's
        * full volume and explaining, in the same breath, that the price is gone.
        */}
      {lifetimeIsOpen && (
        <section className="mt-16">
          <div className="lifetime-panel">
            {/*
              * Text on the left, the price on the right — the v3.4 redesign's own layout,
              * replacing the single stacked column this block used to be. `items-end` on
              * `sm:flex-row` so the price block's own right edge lines up with its button
              * underneath it rather than with the panel's own padding.
              */}
            <div className="flex flex-col gap-10 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-[32rem]">
                <span className="lifetime-eyebrow">Pay once</span>
                <h2 className="lifetime-title">
                  Lifetime.
                  <br />
                  Premium forever.
                </h2>
                <p className="lifetime-what">{LIFETIME_WHAT}</p>
              </div>

              <div className="flex-none sm:text-right">
                {/*
                  * The struck anchor, and **only** when a campaign actually covers the
                  * Lifetime. It used to be `LIFETIME.originalAmount`, an unconditional €249
                  * that nobody was ever charged — which is precisely the reference the
                  * commercial deck calls contestable. Now there is either a real campaign
                  * behind the strike or no strike at all.
                  */}
                {lifetimeDiscount !== null && <p className="lifetime-original">{euro(LIFETIME.amount)}</p>}
                {/* The badge beside the price rather than under it — the redesign's own call,
                    so the two read as one fact ("this number, until this date") instead of a
                    price with a caveat trailing after it. */}
                <div className="mt-1 flex items-center justify-end gap-3">
                  {lifetimePillText !== null && <span className="lifetime-pill">{lifetimePillText}</span>}
                  <p className="lifetime-price">{euro(lifetimeDiscount ?? LIFETIME.amount)}</p>
                </div>

                <LifetimeCta
                  href={coupon === null ? '/checkout/lifetime' : `/checkout/lifetime?coupon=${encodeURIComponent(coupon.code)}`}
                  viewer={viewer}
                  checkoutLive={CHECKOUT_LIVE}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/*
        * Replaces the whole of "If a plan ends" — see `TRUST_NOTE_LEAD`'s own comment on what that
        * traded away. The checkmark-in-a-circle is `IconCheck` on the accent's soft tint — the
        * glyph this app already means "settled" with, from a copied link to the plan you are on,
        * rather than a second checkmark drawn for this note alone.
        */}
      <section className="mt-6">
        <div className="card trust-note">
          <span className="trust-note-icon">
            <IconCheck size={18} />
          </span>
          <p className="text-sm leading-[1.5] text-ink">
            <strong>{TRUST_NOTE_LEAD}</strong>. {TRUST_NOTE_REST}
          </p>
        </div>
      </section>

      {/*
        * The closing line, and **only for somebody who has no account yet** — the fourth
        * place on this page that had to learn who is reading it, after the cards, the
        * lifetime panel and the layout's own header button (all three fixed in v3.13, this
        * one missed). It was rendered unconditionally, so every signed-in reader was invited
        * to create the account they were signed into, and the reader it was worst for is the
        * one who cannot have arrived here any other way: `requirePlanChoice` redirects an
        * account that has not chosen a plan *to this page*, and the layout deliberately gives
        * that reader no button at all precisely because every destination is a bounce — while
        * this paragraph offered them a registration form.
        *
        * The comment that used to stand here argued the line was "the one call to action on
        * the page" because "four symmetrical columns with no button in any of them" kept the
        * page honest while it could not sell. Both halves have since stopped being true:
        * `CHECKOUT_LIVE` is on, and every column carries its own button.
        */}
      {viewer.email === null && (
        <p className="mt-14 text-center text-sm text-muted">
          New here?{' '}
          <Link href="/register" className="text-accent hover:underline">
            Create an account
          </Link>
          .
        </p>
      )}

      <Footer />

      {/*
        * Last in the document, and fixed to the foot of the viewport by CSS.
        *
        * The order is the accessibility half of the design: a bar that overlays a page should
        * come *after* the page in reading order rather than interrupting it, so a screen reader
        * reaches the price list before the advertisement for it. `role="region"` with a name is
        * what makes it findable anyway (see `CouponOverlay`).
        */}
      {offer !== null && offerWords !== null && (
        <CouponOverlay
          code={offer.code}
          percent={offerWords.percent}
          duration={offerWords.duration}
          headline={offerWords.headline}
          deadline={deadlineCopy(offer.expiresAt, new Date())}
          href={`/pricing?coupon=${encodeURIComponent(offer.code)}`}
          initiallyCollapsed={offerCollapsed}
        />
      )}
    </main>
  )
}
