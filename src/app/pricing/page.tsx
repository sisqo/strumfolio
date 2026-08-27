import type { Metadata } from 'next'
import Link from 'next/link'

import { Footer } from '@/components/Footer'
import { IconCheck } from '@/components/icons'
import { LifetimeCta, PricingPlans } from '@/components/PricingPlans'
import type { ComparisonRow, PlanColumn } from '@/components/PricingPlans'
import { isOwner } from '@/lib/allowlist'
import { loadIdentity } from '@/lib/auth/actions'
import { APP_NAME } from '@/lib/brand'
import { euro, LIFETIME, PRICES } from '@/lib/plans/prices'
import type { PaidPlan } from '@/lib/plans/prices'
import { mockCheckoutEnabled } from '@/lib/plans/resolve'
import { PLANS } from '@/lib/plans/types'
import type { BookletTier, FeatureRequestTier } from '@/lib/plans/types'
import { mustChooseNow } from '@/lib/plans/viewer'
import type { Viewer } from '@/lib/plans/viewer'

const SHARE_TITLE = `${APP_NAME} — Plans and pricing`

/*
 * Whether the lifetime offer is still in the catalogue — the comparison `LIFETIME.closesOn`
 * was created for.
 *
 * **Read when the page is read, since v3.13** — a function rather than the module-scope
 * constant this was, and the change is worth the paragraph it costs. While the page was
 * statically generated `new Date()` froze at build time: the block did not vanish at midnight
 * on the closing day, it vanished on the first deploy after it, and the standing duty beside
 * `closesOn` was for a human to remember. The page now reads the session (see the page's own
 * comment below), so it is rendered per request anyway; the reader's own clock comes free with
 * that, and the offer closes on the day it says it closes. A duty removed rather than moved.
 *
 * A function and not a constant precisely so it cannot drift back: a `const` here would be
 * evaluated once per server process, which on a long-lived instance is a subtler version of
 * the same bug — right for the first reader of the day and wrong for the last.
 *
 * A string comparison, not `Date` arithmetic: `closesOn` is stored ISO precisely so that a
 * comparison is a comparison and not a parse of prose, and `<=` keeps the closing day itself
 * open, which is what "in the catalogue until" says. UTC on both sides, which for a date that
 * matters to the day and not to the hour is the only reading that does not depend on where
 * the server happens to be.
 */
function lifetimeOpen(): boolean {
  return new Date().toISOString().slice(0, 10) <= LIFETIME.closesOn
}

/*
 * Every number in this sentence is interpolated, like every number on the page below it:
 * a meta description is the one place a stale price is invisible to whoever changed the
 * real one, because nothing on the screen shows it.
 *
 * "free to start" is deliberately not the wording. It reads as a trial, and the first
 * thing this page says is that there is no trial — the free plan has no end date. That
 * distinction is the same one `DESCRIPTION` on /login now makes.
 *
 * The lifetime clause is gated on `lifetimeOpen()` for the same reason the block itself is,
 * and this is the half that is easy to miss: a meta description is the one place a closed
 * offer would keep being advertised with nothing on the screen to show it. This sentence is
 * what a shared link renders as a card, so leaving it ungated would put "€149 once, until 31
 * December 2026" in front of readers who cannot buy it, in the place nobody thinks to look.
 *
 * A function, and `generateMetadata` below rather than a `metadata` constant, for the reason
 * `lifetimeOpen` is a function: this sentence and the block on the screen have to close on the
 * same day, and a constant evaluated at module load cannot.
 */
function describe(): string {
  return (
    `Four plans, priced in euro with tax included: a free plan with no end date, then ` +
    `${euro(PRICES.standard.year.amount)}, ${euro(PRICES.plus.year.amount)} or ` +
    `${euro(PRICES.premium.year.amount)} a year` +
    (lifetimeOpen()
      ? ` — or ${euro(LIFETIME.amount)} once for Premium for life, until ${LIFETIME.closesOnLabel}.`
      : `.`)
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
export function generateMetadata(): Metadata {
  const description = describe()

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
 * "Promo", added ahead of the redesign's own badge beside the price rather than above it —
 * the badge now sits at the same height as the number it qualifies instead of underneath it,
 * and "price valid until" on its own read as though €149 itself were about to change, when
 * what actually closes on that date is the offer, not the plan.
 */
const LIFETIME_PILL = `Promo price valid until ${LIFETIME.closesOnLabel}`

/*
 * What replaces the whole of "If a plan ends" — the section heading, the cancelling
 * mechanics, and the fourteen-day refund promise that used to close it. This is the v3.4
 * redesign's own call: the fuller rule is not written anywhere else on the site, and going
 * with only this shorter reassurance is a deliberate trade of that explanatory prose for the
 * lighter page the redesign asks for, made once and knowingly rather than lost by accident.
 */
/** The lead sentence, bold in the design — see the JSX below for the plain rest of it. */
const TRUST_NOTE_LEAD = 'Nothing you put in here is ever deleted'

const TRUST_NOTE_REST = 'If a subscription ends, your songs stay readable, printable and exportable.'

/**
 * Read once and reused by every column and by the Lifetime block below, rather than called
 * separately in each: it is a build-time env read (see its own comment in `resolve.ts`), so
 * every call in one build agrees regardless, but one name for "is the mock live" is one fewer
 * thing to keep saying the same way.
 */
const CHECKOUT_LIVE = mockCheckoutEnabled()

/** A paid column, worded once for the three that differ only in their amounts and their audience. */
function paidColumn(name: string, plan: PaidPlan, audience: string): PlanColumn {
  const { year, month } = PRICES[plan]

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
     */
    price: {
      year: { amount: euro(year.amount), suffix: '/yr' },
      month: { amount: euro(month.amount), suffix: '/mo' },
    },
    audience,
    /* Standard and Premium both buy something — the faint tint `.is-paid` draws for both,
       never for Free (nothing bought) or Plus (its own `.is-featured` instead). */
    paid: true,
    checkoutPlan: CHECKOUT_LIVE ? plan : undefined,
  }
}

const COLUMNS: PlanColumn[] = [
  {
    name: 'Free',
    slug: 'free',
    /* Both states are the same, so the free column does not move under a toggle that has
       nothing to say about it — no suffix either, the same reason. */
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
  ),
  {
    ...paidColumn(
      'Plus',
      'plus',
      `Unlimited songbooks and songs, up to ${PLANS.plus.devices} other screens, printed booklet with no ` +
        'credit line.',
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
  ),
]

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
 * in the code today. The two cases are now split apart on request — premium's cell names the
 * custom line — which makes this cell a **roadmap claim** rather than a description of what
 * the PDF currently prints, in the same class as the two "Printed booklet themes" rows below
 * and unlike every other cell on this page. What premium's booklet does today is exactly what
 * plus' does; what this cell says is what it will do.
 *
 * A `switch` over the union rather than an `=== 'branded'` test, so the day a fifth tier is
 * added this stops compiling instead of quietly describing it as "without that line".
 * `prices.test.ts` pins the gap from the other side, next to the numbers: it still asserts
 * that nothing in the code can tell `plain` and `custom` apart, and fails the day something
 * can — which is the day this cell stops being a promise.
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
      return 'With your custom line'
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
 * does not have it. `Entitlements.refused` has six fields and `smartCapo` is not one of them,
 * and `PlanLimits` says out loud that no call site reads the field and that no gate may be
 * invented for it. So the free plan gets the smart capo suggestion today and would still get
 * it the day `SONGBOOK_PLANS` is switched on — a row here would sell Standard for something
 * Free already delivers.
 *
 * The customizable booklet is no longer in that same boat. `bookletCell`'s own comment still
 * holds — `custom` behaves exactly like `plain` today, and no cell above may claim otherwise —
 * but the two "Printed booklet …" rows below name it anyway, worded `COMING_SOON` rather than
 * as something these plans already do. That is a deliberate roadmap commitment on a public
 * page, confirmed rather than assumed: a reader on Plus or Premium is being told a themed
 * booklet is coming, not that it is here. "AI MCP integration" is the same kind of row for
 * the same reason, confirmed separately: nothing in this repository speaks MCP yet.
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
 * What has *not* changed: nothing here awaits `searchParams`, and nothing here reads any
 * per-request state beyond the identity above — so the page still renders exactly the same
 * HTML for every reader in the same state, which is what keeps it reviewable. Still no
 * `export const dynamic`: reading cookies is what makes a page dynamic in this router, and
 * the declaration would only restate what `loadIdentity` already forces.
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
export default async function PricingPage() {
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

  /* Read once per request, like `CHECKOUT_LIVE` above — both the block and the metadata's own
     clause have to agree on the same day, and `describe()` asks the same function. */
  const lifetimeIsOpen = lifetimeOpen()

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

      <section className="mt-8">
        <PricingPlans columns={COLUMNS} rows={ROWS} tableTitle="What changes between plans" viewer={viewer} />
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
                <p className="lifetime-original">{euro(LIFETIME.originalAmount)}</p>
                {/* The badge beside the price rather than under it — the redesign's own call,
                    so the two read as one fact ("this number, until this date") instead of a
                    price with a caveat trailing after it. */}
                <div className="mt-1 flex items-center justify-end gap-3">
                  <span className="lifetime-pill">{LIFETIME_PILL}</span>
                  <p className="lifetime-price">{euro(LIFETIME.amount)}</p>
                </div>

                {CHECKOUT_LIVE && <LifetimeCta href="/checkout/lifetime" viewer={viewer} />}
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
    </main>
  )
}
