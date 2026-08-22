import type { Metadata } from 'next'
import Link from 'next/link'

import { Footer } from '@/components/Footer'
import { IconCheck } from '@/components/icons'
import { PricingPlans } from '@/components/PricingPlans'
import type { ComparisonRow, PlanColumn } from '@/components/PricingPlans'
import { APP_NAME } from '@/lib/brand'
import { euro, LIFETIME, PRICES } from '@/lib/plans/prices'
import type { PaidPlan } from '@/lib/plans/prices'
import { mockCheckoutEnabled } from '@/lib/plans/resolve'
import { PLANS } from '@/lib/plans/types'
import type { BookletTier } from '@/lib/plans/types'

const SHARE_TITLE = `${APP_NAME} — Plans and pricing`

/*
 * Whether the lifetime offer is still in the catalogue — the comparison `LIFETIME.closesOn`
 * was created for and, until now, the one nothing performed.
 *
 * **Read when the page is built, not when it is read.** This page is statically generated
 * (see the page's own comment below), so `new Date()` freezes at build time: the block does
 * not vanish at midnight on the closing day, it vanishes on the first build after it. That is
 * the trade taken deliberately over `export const revalidate`, which would give the one page
 * in this app whose content is a constant a cache lifetime, and would do it for a date known
 * months in advance. What the comparison buys even frozen is that no deploy can ship the
 * closed offer — today a deploy in 2027 would still print it, date and all. The remaining
 * duty is a human one and is written beside `closesOn`: take the block out on that day.
 *
 * A string comparison, not `Date` arithmetic: `closesOn` is stored ISO precisely so that a
 * comparison is a comparison and not a parse of prose, and `<=` keeps the closing day itself
 * open, which is what "in the catalogue until" says. UTC on both sides, which for a date that
 * matters to the day and not to the hour is the only reading that does not depend on where
 * the build ran.
 */
const LIFETIME_OPEN = new Date().toISOString().slice(0, 10) <= LIFETIME.closesOn

/*
 * Every number in this sentence is interpolated, like every number on the page below it:
 * a meta description is the one place a stale price is invisible to whoever changed the
 * real one, because nothing on the screen shows it.
 *
 * "free to start" is deliberately not the wording. It reads as a trial, and the first
 * thing this page says is that there is no trial — the free plan has no end date. That
 * distinction is the same one `DESCRIPTION` on /login now makes.
 *
 * The lifetime clause is gated on `LIFETIME_OPEN` for the same reason the block itself is,
 * and this is the half that is easy to miss: a meta description is the one place a closed
 * offer would keep being advertised with nothing on the screen to show it. This sentence is
 * what a shared link renders as a card, so leaving it ungated would put "€149 once, until 31
 * December 2026" in front of readers who cannot buy it, in the place nobody thinks to look.
 */
const DESCRIPTION =
  `Four plans, priced in euro with tax included: a free plan with no end date, then ` +
  `${euro(PRICES.standard.year.amount)}, ${euro(PRICES.plus.year.amount)} or ` +
  `${euro(PRICES.premium.year.amount)} a year` +
  (LIFETIME_OPEN
    ? ` — or ${euro(LIFETIME.amount)} once for Premium for life, until ${LIFETIME.closesOnLabel}.`
    : `.`)

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
export const metadata: Metadata = {
  title: 'Pricing',
  description: DESCRIPTION,
  openGraph: {
    title: SHARE_TITLE,
    description: DESCRIPTION,
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/brand/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SHARE_TITLE,
    description: DESCRIPTION,
    images: ['/brand/og-image.png'],
  },
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

const LIFETIME_PILL = `Price valid until ${LIFETIME.closesOnLabel}`

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
    /* Free is not sold through `checkout.ts` — it is what an account already is — so it gets
       the one card button that is never conditional on `CHECKOUT_LIVE`. */
    cta: { href: '/register', label: 'Start free' },
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
 * `plain` and `custom` return the identical string, and this map is the code-level guard that
 * keeps a customizable booklet off this page: `bookletBrandLine` asks only whether the tier is
 * `branded`, so premium's `custom` behaves exactly like plus' `plain` today and listing a
 * customizable booklet would be selling something that does not exist. A `switch` over the
 * union rather than an `=== 'branded'` test, so the day a fifth tier is added this stops
 * compiling instead of quietly describing it as "without that line" — and so that whoever
 * starts gating on `custom` has to come here and split these two cases apart deliberately.
 * `prices.test.ts` pins the same fact from the other side, next to the numbers.
 */
function bookletCell(tier: BookletTier): string | null {
  switch (tier) {
    case 'no':
      return null
    case 'branded':
      return 'With a «Printed with Strumfolio» line'
    case 'plain':
    case 'custom':
      return 'Without that line'
  }
}

/**
 * The device ceiling as a table cell, with free's 0 written as no cell at all.
 *
 * Never "0", for the reason `capWorthNaming` exists in `types.ts`: "0 of 0" reads as a fault in
 * the software, and so does a 0 in a table. Free cannot lead a session at all, so this row is
 * simply not part of that plan.
 *
 * Premium's own cell is written by hand in `ROWS` rather than through this function — see the
 * row itself for why "Unlimited" is the v3.4 redesign's deliberate call there, over the "100"
 * this function would otherwise print.
 */
function deviceCell(devices: number): string | null {
  return devices === 0 ? null : String(devices)
}

/** A feature named on this page before the gate that would enforce it exists — see the two
 * "Printed booklet …" theme rows below for the one place this table says so out loud. */
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
 * booklet is coming, not that it is here.
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
     * The row that claimed a gate the code does not have. `saveGlobalPrefs` is the one control
     * point, and its own comment says why it can only be a soft one: the diagrams are drawn in
     * the browser from a table that ships with the app, so nothing server-side can stop a reader
     * seeing ukulele shapes. What it refuses is *storing* the choice — the row is written back
     * with `guitar` and the answer is `not-in-plan`, which `prefs/queue.ts` treats as finished
     * rather than surfacing. So the free reader who taps Ukulele gets ukulele shapes until the
     * next reload, and the old note («the instrument stays set to guitar, so a ukulele player
     * reads guitar shapes») sold Standard for something Free already delivers and told a reader
     * their own screen was lying. What the paid plans buy is that the choice sticks: across a
     * reload, and across their other devices. That is true today and stays true the day the
     * client-side half of the gate lands.
     */
    note: 'Tap any chord to see the fingering. From Standard up, the choice is remembered across devices.',
    /*
     * All four cells name both instruments, and the free cell used to say just «Guitar» — which
     * was the same false gate the old note claimed, in the one place a reader comparing columns
     * actually looks. What differs between the columns is the four words after the comma, and a
     * near-identical row is the honest shape here: `PLANS[plan].ukulele` is still what decides,
     * so the cells cannot drift from the gate, and what the gate really withholds is the memory
     * of the choice rather than the drawing.
     */
    cells: (['free', 'standard', 'plus', 'premium'] as const).map((plan) =>
      PLANS[plan].ukulele ? 'Guitar and ukulele, choice saved' : 'Guitar and ukulele',
    ),
  },
  {
    label: '«Sing Together» session',
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
    label: '«Sing Together» devices',
    note: 'Maximum number of devices following a «Sing Together» session.',
    cells: [
      deviceCell(PLANS.free.devices),
      deviceCell(PLANS.standard.devices),
      deviceCell(PLANS.plus.devices),
      /*
       * "Unlimited", the v3.4 design's own call, over the honest "100" `deviceCell` would
       * otherwise print (`PLANS.premium.devices` really is 100, not null — see its own comment
       * in `types.ts` on why that stays a real number for the *gate*). This is a labelling
       * choice on this one table cell, not a change to what `admits` actually enforces in
       * `singAlong/devices.ts`: a 101st guest is still refused, this cell just no longer says so.
       */
      'Unlimited',
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
   * should find the claim beside the feature it modifies, not after "Sing Together" or
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
  {
    label: 'Feature requests',
    /*
     * The design's own note, word for word — not what the site's support inbox actually does
     * today (anybody may write in, on any plan). The v3.4 redesign's own call, confirmed
     * rather than assumed: only Premium gets a row here, and the note names the plan's own
     * benefit rather than the other three's absence, matching the design's phrasing exactly.
     */
    note: 'You can request new features from the dev team with top prioritization.',
    cells: [null, null, null, 'Yes'],
  },
]

/**
 * What Strumfolio costs — the one page a visitor reads while deciding whether to pay, and the
 * only page in the app that has to be readable by somebody who has never signed in and by a
 * reader who signed in months ago, without knowing which of the two is looking.
 *
 * **This page must stay statically generated.** That is not enforced by anything: it holds
 * only as long as nothing here awaits `searchParams`, calls `cookies()`, `headers()` or
 * `auth()`, and nothing here calls any of the database-touching exports of
 * `@/lib/plans/resolve` — `entitlementsOf`, `deviceCapOf`, `effectivePlanOf` — or anything
 * under `@/lib/data`. `mockCheckoutEnabled`, imported here, is the one exception and not a
 * loophole in that rule: it is a bare, synchronous `process.env` read with no query behind
 * it, so calling it at render time is exactly as static-safe as reading `@/lib/plans/prices`,
 * just resolved at *build* time instead of never — which is the entire point of
 * `CHECKOUT_LIVE` existing at all: a flag flipped in Vercel takes effect on the next build's
 * copy of this page, not before. `@/lib/plans/types` and
 * `@/lib/plans/prices` are both pure and safe. There is no `export const dynamic` here
 * because nothing in this repository uses `force-static` — the four legal pages prerender
 * under this same root layout with no such declaration — and a comment is what a later
 * reader actually reads. The reason it matters: a price list rendered per request would be
 * a database read and a cold start for a page whose content is a constant.
 *
 * `new Date()` at module scope — `LIFETIME_OPEN`, above — is on the permitted side of that
 * list, and is spelled out here so a later reader does not have to guess: reading the clock
 * is not a dynamic API, so it does not opt the page out of prerendering. What it does instead
 * is take the build's value and keep it, which is a consequence rather than a hazard and is
 * documented where the constant is declared. Anything that needs the *reader's* clock, as
 * opposed to the build's, cannot be done here at all without giving up the paragraph above.
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
export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-[70rem] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
      <div className="text-center">
        <span className="pricing-eyebrow">Pricing</span>
        {/*
          * `.landing-title`, not `.screen-title` — the design's own 48px, matching /login's own
          * hero rather than the smaller size every other internal screen's H1 uses. This is the
          * one other page that opens with a title page rather than a place to read from.
          */}
        <h1 className="landing-title mt-5">What Strumfolio costs</h1>
        <p className="mx-auto mt-4 max-w-[38rem] text-[1.03125rem] leading-[1.6] text-muted">
          {HERO_SUBTITLE}
        </p>
      </div>

      <section className="mt-8">
        <PricingPlans columns={COLUMNS} rows={ROWS} tableTitle="What changes between plans" />
      </section>

      {/*
        * Rendered only while the offer is open — see `LIFETIME_OPEN`. The block states its own
        * closing date, so left ungated it would spend 2027 advertising a price at a price list's
        * full volume and explaining, in the same breath, that the price is gone.
        */}
      {LIFETIME_OPEN && (
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
                <h2 className="lifetime-title">Lifetime</h2>
                <p className="lifetime-what">{LIFETIME_WHAT}</p>
              </div>

              <div className="flex-none sm:text-right">
                <p className="lifetime-original">{euro(LIFETIME.originalAmount)}</p>
                <p className="lifetime-price">{euro(LIFETIME.amount)}</p>
                <p>
                  <span className="lifetime-pill">{LIFETIME_PILL}</span>
                </p>

                {CHECKOUT_LIVE && (
                  <Link href="/checkout/lifetime" className="btn btn-primary btn-sm mt-4 w-full sm:w-auto">
                    Choose Lifetime
                  </Link>
                )}
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
        * The one call to action on the page, and it is a line of text. Four symmetrical
        * columns with no button in any of them is what keeps the page honest while it cannot
        * sell; a single link at the foot is what keeps it useful to somebody who has decided.
        */}
      <p className="mt-14 text-center text-sm text-muted">
        New here?{' '}
        <Link href="/register" className="text-accent hover:underline">
          Create an account
        </Link>
        .
      </p>

      <Footer />
    </main>
  )
}
