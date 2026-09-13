import { cookies } from 'next/headers'
import { Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'

import { CouponMemory } from '@/components/CouponMemory'
import { CouponOverlay } from '@/components/CouponOverlay'
import { LandingOffer } from '@/components/LandingOffer'
import { EditorPhone } from '@/components/EditorPhone'
import { Footer } from '@/components/Footer'
import {
  IconBooks,
  IconBroadcast,
  IconCheck,
  IconChevronRight,
  IconChordShape,
  IconCode,
  IconComment,
  IconImport,
  IconNotation,
  IconOnStage,
  IconPencil,
  IconPrint,
  IconSliders,
  IconTuningFork,
  IconUsers,
} from '@/components/icons'
import { PublicHeader } from '@/components/PublicHeader'
import { deadlineCopy, offerCopy } from '@/lib/coupons/discount'
import { activeCoupon } from '@/lib/coupons/read'
import { COUPON_COOKIE, OFFER_COLLAPSED_COOKIE, restorableCode } from '@/lib/coupons/types'
import { ReaderPhone } from '@/components/ReaderPhone'
import { StrumTogetherStage } from '@/components/StrumTogetherStage'
import { APP_NAME, APP_PAYOFF } from '@/lib/brand'
import { limitLabel } from '@/lib/plans/limits'
import { paddleCheckoutEnabled, plansEnforced } from '@/lib/plans/resolve'
import { PLANS } from '@/lib/plans/types'

/**
 * The tab title and the share card's headline. Exported because the metadata that carries it
 * is `generateMetadata` in `layout.tsx` beside this file, not a `metadata` export of `page.tsx`
 * — see that layout for why the whole decision about who is reading `/` lives there.
 */
export const LANDING_TITLE = `${APP_NAME} — ${APP_PAYOFF}`

/**
 * Read three times — `metadata.description`, the OpenGraph and Twitter blocks — all of them
 * the layout's, none of them on the page. **A search snippet, and only that.**
 *
 * It used to be the hero's lede as well, on the reasoning that one sentence should work spoken
 * and as a snippet at once. That stopped being worth it: what the hero needs is the one thing
 * the page has not said yet, and what a snippet needs is the words somebody types into a search
 * box — import, chords, lyrics, capo, transpose, offline. The hero's own line is `HERO_SUBHEAD`
 * below, and the two are allowed to differ now rather than one of them settling for the other.
 *
 * So do not "simplify" this back into the visible copy: shortening it is how the page stops
 * being findable, and nobody reading the page would notice.
 *
 * "Completely free." was true of this app for its whole life and stopped being true the day
 * the plans landed (see `lib/plans/types.ts`), so it had to go: /pricing lists four plans and
 * a page that promises the opposite of the price list is worse than either page alone. "Free
 * to start" was the obvious replacement and is rejected — it reads as a trial, and the free
 * plan is not one: it has no end date, which is the first thing /pricing says.
 */
export const LANDING_DESCRIPTION =
  'Play and sing with your own chords and lyrics — import, edit visually, export freely. Key, capo, auto-scroll, synced everywhere. Free to use, with paid plans for bigger repertoires.'

/**
 * The line under the headline: two sentences, and nothing either of them says stands beside
 * them on this screen.
 *
 * It replaced a lede that listed importing, the key, the capo and the free plan — every one of
 * which is now said again within a few hundred pixels, by the four cards beside it and by the
 * capsule under them. A visitor read the same four facts three times before scrolling once. The
 * first sentence says the thing none of them says: what Strumfolio is *not*. The second answers
 * the question a musician asks before handing a repertoire to anybody — what is underneath it,
 * what is not in it, and whether it can be taken back out.
 *
 * **The second sentence does echo further down the page, and that is deliberate.**
 * `EDITOR_POINTS`' third point is «Plain ChordPro underneath … nothing here is locked in», and
 * the FAQ answer on backups spells the zip of plain text out in full. Same argument as the
 * editor card whose title is the editor band's headline word for word: a visitor who reads a
 * hero claim and then scrolls should arrive somewhere that confirms it. What a hero must not do
 * is repeat what sits *next to* it, which is what the old lede did.
 *
 * Each claim is shipped behaviour, not a slogan: every edit writes standard ChordPro and
 * `lib/import/export.ts` hands the stored source back, one song or the whole library as a zip;
 * and «no ads» is the Cookie Policy's own «No advertising or third-party tracking» — no
 * advertising or profiling scripts, no data to advertising networks. The offer banner this page
 * can carry is Strumfolio's own campaign, shown only to a reader who arrived with its link — a
 * price of ours, and not somebody else's advert.
 *
 * Not exported, unlike the description above — nothing outside this page has any use for it.
 */
const HERO_SUBHEAD =
  "Not a catalogue to browse — the songs you actually play, in a songbook that's yours to edit, carry and keep. Plain text files underneath, no ads, and nothing you can't take with you."

/**
 * «1 songbook», «300 songs» — every count below is read from `PLANS` rather than typed, so a
 * cap that changes changes this page too, and the plural agrees with whatever it changed to.
 * The alternative is the one this page has just been repaired for: numbers in prose that were
 * true when they were written.
 */
const count = limitLabel

/** One of the four cards standing beside the headline — see `HERO_CARDS`. */
interface HeroCard {
  icon: React.ReactNode
  title: string
  text: string
}

/**
 * The hero's right-hand column: four cards and, under them, what the free plan holds.
 *
 * They replaced a row of three pills sitting *under* the actions — «Bring your own songs»,
 * «Always with you, even offline», «Key and capo, made smart» — which said the same three
 * things in three words each, beside a cropped band of the three-device photo. The redrawn
 * `Home.dc.html` trades both for this: a sentence per card, and the photo left to the «Every
 * screen you own» band further down, where it is the whole point rather than a texture.
 *
 * The order is the product's own sequence, and the bands below repeat it: get a repertoire in,
 * shape it, put it in the right key, play it anywhere.
 *
 * **The editor is the second card and used to be no card at all.** It is the one thing no other
 * app in this category does — the sheet itself is the editor — and the only place the hero said
 * so was inside the lede that `HERO_SUBHEAD` replaced, which means the flagship claim was
 * carried entirely by a sentence being deleted for repeating everything else. Its title is the
 * headline of the editor band further down, word for word and deliberately: a visitor who reads
 * the card and then scrolls should arrive somewhere that confirms it, not somewhere that
 * rephrases it.
 *
 * «and eleven more» is `ACCEPTED` in `AddSongScreen.tsx` — fifteen extensions, four of them
 * named here. Typed rather than counted, so **a sixteenth format has to change this line too**;
 * naming the formats at all is the point, since "the files you already keep" hid the longest
 * import list in the category behind a phrase that promised nothing.
 */
const HERO_CARDS: HeroCard[] = [
  {
    icon: <IconImport size={19} />,
    title: 'Bring your songs in',
    text: "Import ChordPro, OnSong, PDF, Word and eleven more — or start from the example songbook that's already there.",
  },
  {
    icon: <IconPencil size={19} />,
    title: 'Edit the song, not the code',
    text: 'Chords above the words, nothing to learn. Fix a verse two minutes before you play.',
  },
  {
    icon: <IconTuningFork size={19} />,
    title: 'Set the key, get the capo',
    text: `Transpose to where you sing it and ${APP_NAME} finds the capo that keeps the shapes easy.`,
  },
  {
    icon: <IconComment size={19} />,
    title: 'Play it anywhere',
    text: 'Any screen you own, offline — or share a link and let the room follow along.',
  },
]

interface Feature {
  icon: React.ReactNode
  title: string
  text: string
}

/** One of the three things `StrumTogetherSpotlight` says about the feature below its own headline. */
interface SpotlightPoint {
  icon: React.ReactNode
  title: string
  text: string
}

/**
 * What the editor band says next to the living demo (`EditorDemo`). Three points,
 * one per reason a musician keeps a repertoire tidy: placing chords, keeping the
 * words current, and never being locked in. Every claim below is a shipped
 * behaviour, not an aspiration — the tap-lands-on-a-syllable rule, the drag, the
 * seat past the last word, the suggestions, and the byte-for-byte ChordPro
 * round-trip are all in `components/editor/` and `lib/editor/` today.
 */
const EDITOR_POINTS: SpotlightPoint[] = [
  {
    icon: <IconChordShape size={18} />,
    title: 'Chords land on the syllable',
    text: 'Tap above a line and the chord lands on the syllable under your finger. Drag to nudge it letter by letter, or past the last word where the turnaround goes.',
  },
  {
    icon: <IconPencil size={18} />,
    title: 'Type over the words',
    text: "Words are just text — the chords follow the words they sit on. Fix a verse two minutes before you play and it's saved to your reading screen.",
  },
  {
    icon: <IconCode size={18} />,
    title: 'Plain ChordPro underneath',
    text: 'Every edit writes standard ChordPro. Read the source anytime, export a song or your whole library — nothing here is locked in.',
  },
]

/**
 * What the reading band says. Three points, one per thing a musician changes with the
 * instrument already in their hands: the key and the fret that answers it, how much of a
 * chord the sheet draws, and who is turning the page. Every claim is shipped behaviour — the
 * per-fret open-chord count is `easeByFret`, the four ways of drawing a chord are
 * `CHORD_DISPLAY_TITLE`, the full-size box is `ChordPopup`, and the pace is `SCROLL_SPEEDS`.
 *
 * These used to sit beside `ReaderPhone`, which now leads the hero — so the band they belong
 * to is the copy alone, and they are the whole of it rather than a caption to a picture.
 */
const READER_POINTS: SpotlightPoint[] = [
  {
    icon: <IconTuningFork size={18} />,
    title: 'The key moves, the capo answers',
    text: "Each fret shows how many of the song's chords it leaves open, so the shapes you read are the shapes you already know.",
  },
  {
    icon: <IconChordShape size={18} />,
    title: 'As much of a chord as you need',
    text: 'Diagrams before the song, fingerings on one line, shapes drawn on the syllable, or just the names — and any chord opens full size with a tap.',
  },
  {
    icon: <IconSliders size={18} />,
    title: 'Set the pace, then let go',
    text: 'Auto-scroll follows the speed you set, so the page keeps moving while both hands stay on the instrument.',
  },
]

interface StrumPoint {
  title: string
  text: string
}

/** The three closing claims under the Strum Together stage — no icon, unlike the two
 *  spotlights above it: three phones already mid-demo are the illustration. */
const STRUM_TOGETHER_POINTS: StrumPoint[] = [
  {
    title: 'One leader, no confusion',
    text: "Whoever's playing controls the song — line, section, chord — for everyone.",
  },
  {
    title: 'Every screen, in sync',
    text: 'Each person reads clearly, on their own device, always on the same line.',
  },
  {
    title: 'Just a link away',
    text: 'No sign-up, no setup. Share a link, and anyone can join in seconds.',
  },
]

interface FaqItem {
  q: string
  a: string
}

interface FaqGroup {
  title: string
  items: FaqItem[]
}

/**
 * The one hedge about whether the limits below are real, said once and read by the single FAQ
 * answer that carries it ("Is Strumfolio free to use?") — see that answer's own comment on why
 * it is not repeated five times. Reads `plansEnforced()` rather than assuming it is always
 * off, for the reason `resolve.ts`'s own comment on `plansEnforced` states directly: this and
 * `/pricing` must never disagree about whether the limits are real.
 *
 * The enforced branch used to say "they are not on sale yet" unconditionally — true the day
 * this was written, false once the plans went on sale and `/pricing` started showing working
 * "Choose Standard/Plus/Premium" buttons. `/pricing`'s own comment on why it dropped this exact
 * sentence (`NO_CHECKOUT`, no longer in that file) is the bug reappearing here, on the one page
 * it warns must "flip together" — so this reads `paddleCheckoutEnabled()` too, inside the
 * enforced branch, rather than assuming checkout is always off the way the rest of this sentence
 * still can while limits are not even enforced.
 */
const PLAN_HOLD = plansEnforced()
  ? paddleCheckoutEnabled()
    ? "The paid plans are live — pick one on the pricing page whenever you're ready. Already over a " +
      'limit? Nothing of yours is deleted — you can only delete until you are back under it, the ' +
      'same as if a paid plan lapses.'
    : 'They are not on sale yet, but the limits themselves are already live: your account is held to ' +
      'what is listed above starting today. Already over one? Nothing of yours is deleted — you can ' +
      'only delete until you are back under it, the same as if a paid plan lapses.'
  : 'They are not on sale yet, and no account is being held to those limits until they open — if ' +
    'you already have more than that, nothing changes for you today. If a paid plan lapses, nothing ' +
    'is deleted.'

/**
 * The « once they open» hedge, or nothing at all — appended by the one feature card below that
 * still names a gated feature: the printed booklet.
 *
 * **Two cards until Strum Together stopped being gated.** Free leads a session with one follower
 * now (`PLANS.free.mayLead`), so that card names no plan at all and appends nothing; the booklet
 * is the last card on this page whose sentence depends on whether the limits are real. Kept as a
 * shared constant rather than folded into that one card's string, because the reason it exists is
 * a rule about this whole page rather than about the booklet: a second gated feature described
 * here later must read the flag through this and not hard-code the hedge the way both cards
 * originally did.
 *
 * Both cards used to carry those three words as static text, and they stopped being true the day
 * `SONGBOOK_PLANS` and `SONGBOOK_MOCK_CHECKOUT` went on in production. That left this page
 * hedging about whether the limits were real while `/pricing` beside it stated the same limits as
 * plain facts — precisely the disagreement `resolve.ts`'s comment on `plansEnforced` names as the
 * failure to avoid, and it warns these two pages must flip together. `PLAN_HOLD` above was
 * already reading the flags for the FAQ answer; those sentences were the half that was not.
 *
 * Keyed on `plansEnforced()` and deliberately **not** on `paddleCheckoutEnabled()`: what makes
 * «part of the paid plans» true is that a free account is actually held out of the feature, which
 * is enforcement and not whether anything is on sale. With the flag off, `UNGATED` grants the
 * booklet (`refused.booklet` is null there), so a free account really does print, and the hedge
 * has to stay regardless of the checkout.
 *
 * An empty string rather than two full sentences per card: the surrounding prose is what the card
 * is actually about, and duplicating it per branch is how two copies come to drift.
 */
const PLANS_OPEN_HEDGE = plansEnforced() ? '' : ' once they open'

const FAQ: FaqGroup[] = [
  {
    title: 'Bringing in your collection',
    items: [
      {
        q: 'Do I need to create my songs from scratch, or can I import what I already have?',
        a: "Strumfolio isn't a library you browse — there's no catalogue to search. You bring your own songs, imported from what you already have. So you don't start from a blank page, a new account arrives with one example songbook of public-domain songs already in it — an ordinary songbook you can edit, rename or delete like any other.",
      },
      {
        q: 'What file formats can I import and export?',
        /*
         * "Strumfolio uses ChordPro, the standard format for lyrics and chords" was the whole
         * answer here, and it read as a *requirement*: bring ChordPro files. What the importer
         * actually accepts is `ACCEPTED` (`AddSongScreen.tsx`) — the dialects, OnSong, MusicXML,
         * a SongbookPro backup, a zip of any of those — plus any text at all, since a paste of
         * "chords above the lyrics" is converted. Someone with a folder of exports from another
         * app was being told, in effect, to convert it first.
         *
         * **"Fifteen" is the one count on this page typed by hand**, and it has to stay in step
         * with `ACCEPTED` — which is a plain `const` in a client component, not exported, so
         * there is nothing to import and read the way `count(PLANS…)` reads a limit. A format
         * added there without a visit here makes this sentence quietly wrong. It said thirteen
         * until PDF and Word were built.
         *
         * Those two are named now, and naming them changes nothing about the rule this answer
         * was written under: absences stay unnamed on a landing page, and what is said is said
         * on the positive. What did change is that a person holding a folder of PDFs is no
         * longer being told, by omission, to convert it first.
         */
        a: 'ChordPro is what Strumfolio reads and writes — and around it, the dialects other apps use, OnSong, MusicXML, a SongbookPro backup, PDF, Word, and a zip holding any of those: fifteen file types in all, plus any text you can paste. Chords written above the words are converted for you, always behind a preview you can correct before anything is saved, since that conversion is a guess and not always the right one. Export hands you standard ChordPro back — one song, or the whole collection as a zip.',
      },
      {
        q: 'Is there a limit to how many songs or songbooks I can create?',
        /*
         * The counts are stated in the present tense on purpose: whether that is actually so is
         * `PLAN_HOLD`'s question to answer, not this one's — the qualifier is not repeated in
         * each of the five answers and features that name a plan, since five copies of one
         * caveat is a page that reads as a disclaimer. It is said once, in "Is Strumfolio free to
         * use?", which is the answer every existing reader opens, and pointed to from here.
         */
        a: `The free plan holds ${count(PLANS.free.songbooks, 'songbook')} and ${count(PLANS.free.songs, 'song')}. Standard holds ${count(PLANS.standard.songbooks, 'songbook')} and ${count(PLANS.standard.songs, 'song')}, counted across the whole account rather than per songbook; Plus and above have no limit on either. The pricing page lists all four side by side.`,
      },
    ],
  },
  {
    title: 'Key, capo and chords',
    items: [
      {
        q: 'How does the smart capo suggestion work?',
        a: 'It checks every possible fret position and finds the one that lets you play the most open chords. That means you get the easiest shapes for your hands, not just a fret that happens to match the right sound.',
      },
      {
        q: 'Does it show chord shapes for both guitar and ukulele?',
        /*
         * This answer has been corrected twice, in opposite directions, and both corrections were
         * right when made. It first claimed "guitar on every plan, ukulele on the paid ones" while
         * `saveGlobalPrefs` could only refuse to *store* the choice — a gate harder than the one
         * that existed. It then said both instruments were free and only the memory of the choice
         * was paid, which was exactly true of that code. `ReadingPanel` now refuses the tap
         * itself, so the original sentence is the accurate one again.
         *
         * Kept in step with /pricing's chord-shapes row on purpose: two pages describing one gate
         * must describe the same gate, and this pair is the one that has drifted before.
         *
         * "In a song" is load-bearing now that `/tools/guitar-chords` and `/tools/ukulele-chords`
         * publish both libraries to anybody with no account at all: what the plans gate is the
         * ukulele *inside a song you are reading*, never the chart. Don't let this answer drift
         * into sounding like the public charts are gated, and don't let it advertise them either
         * — that is the tools pages' own job.
         */
        a: 'Yes — tap any chord in a song and see exactly where to place your fingers. Guitar is on every plan, including the free one; the ukulele comes with the paid plans.',
      },
      {
        q: 'If I switch to Do-Re-Mi, does that change my songs?',
        /*
         * The notation question, asked from the one angle the "Chords in your own alphabet"
         * feature card above does **not** cover. The card names the four alphabets and explains
         * the Nashville claim; repeating either here would be two copies of one claim on a single
         * page, which is how the pair comes to drift. What the card leaves open is whether
         * choosing an alphabet is a change to the *content* — the thing a reader with a
         * collection they care about actually hesitates over.
         *
         * Every clause is checked, and the last one is why this answer exists at all:
         * - output-only, reader not song — `lib/music/CLAUDE.md`, and `readRoots` parses Italian
         *   and international only, so German `[B]` never enters a file.
         * - an export is unaffected — `lib/import/export.ts` writes the stored ChordPro source
         *   and knows nothing about a notation.
         * - **following a session is the exception**: `sessionWithDevice` reads `user_prefs`
         *   through the *leader's* account (`lib/strumTogether/session.ts`) and `pollBroadcast`
         *   hands a follower that notation with the key. So "chosen once, for every song you
         *   read" — the card's own closing words — has exactly one gap in it, and this is it.
         */
        a: "No — the alphabet is how a sheet is drawn for you, not something stored inside it. Your files keep standard chord names, so an export reads the same for anybody you send it to, and the choice sits on your account rather than on one song. The one place you read somebody else's choice is while following a Strum Together session: there the alphabet arrives from whoever is leading, along with the key.",
      },
    ],
  },
  {
    title: 'Editing your songs',
    items: [
      {
        q: 'Do I need to learn ChordPro to edit my songs?',
        a: 'No. The visual editor shows the song exactly as it reads — words on the line, chords above them — and writes standard ChordPro for you underneath. If you like working with brackets, the Source view is one tap away, and the two can never disagree.',
      },
      {
        q: 'How precisely can I place a chord?',
        a: "Tap above a line and the chord lands on the syllable under your finger; hold and drag to nudge it letter by letter. Chords can also sit past the last word — for a turnaround or an outro — and a tap between two chords slips a new one exactly there. While you name it, the song's own chords are one tap away as suggestions.",
      },
    ],
  },
  {
    title: 'Offline and devices',
    items: [
      {
        q: 'Do I need to install an app, or does it work in the browser?',
        a: 'Neither an app store nor an install step is required — just open Strumfolio on your phone like any regular app, straight from the browser. If you want it to have its own icon, the menu has an Add to home screen entry: one tap on Android, and on an iPhone it shows the two taps Safari needs.',
      },
      {
        q: 'What happens if I lose internet connection while playing?',
        a: 'Nothing changes. Once your repertoire is saved, it stays fully available on your device — no signal required, on stage or anywhere else.',
      },
      {
        q: 'Does my collection sync across my devices?',
        /*
         * This absorbed "Do edits show up right away when I play?", which used to sit two groups
         * up under "Editing your songs". The two were one question — when a change arrives, and
         * where — split across two groups, and each was silent on the other's half: this one
         * never mentioned the device you edited on, that one never mentioned the rest of them.
         */
        a: 'Yes, and with nothing to back up or transfer by hand. An edit is on the reading screen of the device you made it on the moment you save it, and every other device you own picks it up as soon as it is online.',
      },
    ],
  },
  {
    title: 'Strum Together',
    items: [
      {
        q: 'How many people can join a Strum Together session?',
        /*
         * "As many as you like" was false on every plan, premium included: `PLANS.premium.devices`
         * is 100, a real technical ceiling. The leader's own device is deliberately not counted —
         * see `PlanLimits.devices` — which is what makes free's and standard's 1 a duo rather
         * than a solo.
         *
         * **Free is named first and by number now**, which is the fix that mattered here: the
         * list used to begin at Standard, and a reader on the free plan could only conclude the
         * feature was not theirs — the same silence that made the four public pages denying the
         * metronome wrong. Free and Standard carry the same 1, so they are named together rather
         * than as two lines saying the same number, which would read as a distinction.
         *
         * /pricing's own devices row defers to this answer for the literal 100 rather than
         * printing "Unlimited" — see its comment. Softening the number here silently un-fixes
         * that page too.
         */
        a: `Every plan can lead one, free included, and how many follow is what changes: Free and Standard add ${count(PLANS.free.devices, 'other device')}, Plus ${PLANS.plus.devices}, Premium and Lifetime ${PLANS.premium.devices}. The device you play from is never counted, so Free is you and one other screen. Anyone can follow with no account at all — the limit is on how many follow at once, never on who.`,
      },
      {
        q: 'Does everyone need an account to join a session?',
        a: 'No sign-up and no setup required. Anyone with the link can join instantly and start singing along within seconds.',
      },
      {
        q: 'Does Strum Together work without an internet connection?',
        a: 'No. Since every device needs to stay in sync in real time, Strum Together requires an active internet connection to work.',
      },
    ],
  },
  {
    title: 'Printing a booklet',
    items: [
      {
        q: 'Does the printed booklet use my own key and capo, or the song as written?',
        a: "The song as written, by default — a booklet is meant to be printed and handed to other people, so it's typeset in each song's own key, not whatever transposition or capo you personally have set for reading, which wouldn't mean anything on somebody else's copy. You can choose your own key and capo instead, one download at a time, for a personal copy — every song printed that way says so on its own page.",
      },
      {
        q: 'Can I print more than one songbook at a time?',
        a: "One PDF per songbook — pick which one from the Export screen and download it. If you keep separate songbooks for separate sets or bands, each one becomes its own booklet, complete with its own cover and index.",
      },
    ],
  },
  /*
   * Plans and money, in three answers — the group this page went without while /pricing carried
   * the whole subject and the Terms carried the detail.
   *
   * **Nothing here names a mechanism**, and that is the decision rather than an omission: no
   * payment processor, no card, no receipt. While `SONGBOOK_MOCK_CHECKOUT` is on, nobody is
   * charged and no receipt exists (see `lib/plans/CLAUDE.md`), so "Paddle is the seller on your
   * receipt" — true in the Terms, which describe the contract rather than today's build — would
   * be the one false sentence on this page. Every claim below instead describes what happens to
   * the *reader*, which the real checkout will not change when it replaces the mock: what
   * renews, what cancelling does to a period already paid for, what fourteen days buy.
   *
   * Sourced from Terms §7 and §8 and deliberately shorter than they are. If those change, these
   * two answers are the second place to look, and a disagreement between them is a bug in this
   * file — the Terms are the document that governs.
   */
  {
    title: 'Plans and billing',
    items: [
      {
        q: 'Is Strumfolio free to use?',
        /*
         * It must not open with "Yes": a bare yes is now half true — see `PLAN_HOLD`.
         *
         * Moved here from "General", where it was the page's last-but-one answer, because it is
         * the sole home of `PLAN_HOLD` and now opens the group a reader with a question about
         * money actually goes to. Nothing textual pointed at it from anywhere, so the move is
         * safe — but the caveat below still has to reach the four other answers that name a
         * plan, which is exactly why it stays a single copy and does not follow the reader.
         */
        a: `There is a free plan, and it does not run out: ${count(PLANS.free.songbooks, 'songbook')}, ${count(PLANS.free.songs, 'song')}, a Strum Together session with ${count(PLANS.free.devices, 'other device')} following, and everything needed to read and play them — no card, and no trial counting down. The paid plans lift those limits and add the printed booklet and the ukulele; the pricing page has all four. ${PLAN_HOLD}`,
      },
      {
        q: 'How does a paid plan renew, and how do I stop it?',
        a: 'Standard, Plus and Premium are subscriptions — monthly or yearly, as you choose — and each period renews into another of the same length until you stop it; Lifetime is a single payment with no renewal ever due. Cancelling is a control on the Billing page inside the app, and it stops the next renewal rather than the plan you hold: you keep that until the end of the period you have paid for, and the account then returns to the free plan, where everything you put in stays readable and exportable. An upgrade takes effect immediately, while a downgrade or a cancellation waits for the end of the period already paid for — and you can undo a scheduled change any time before it lands.',
      },
      {
        q: 'What if I change my mind after paying?',
        /*
         * "Write to us" with no address, because it cannot have one: `FaqItem.a` is a `string`
         * rendered as `{item.a}`, so no answer on this page can hold a link or a mailto, and the
         * footer here carries no contact address either. `CONTACT` is a file-local `const` in the
         * Terms page rather than an export of `lib/brand.ts`, so naming it here would put a
         * second copy of an email address in a second file. Pointing at the document that has it
         * — and that also has the withdrawal sentence to copy — costs the reader one hop and
         * costs this page no duplication.
         */
        a: 'Fourteen days from a purchase to withdraw from it and get the whole amount back, without giving a reason and with no deduction for the days you used it — the same fourteen days wherever you live, and for Lifetime too. Write to us from the address on your account and say so; there is no form to fill in, and the Terms page carries both the address and a sentence you can copy. And if a renewal goes through that you did not mean to keep, tell us within fourteen days of the charge and we refund it, ending the plan at once.',
      },
    ],
  },
  {
    title: 'General',
    items: [
      {
        q: 'Can I invite someone else to collaborate on my songbook?',
        /* Was a group of its own, "Accounts and access", holding this one answer. A heading over a
           single question is an accident of growth rather than a section, and it read as one with
           something missing; here it sits beside the two other answers about whose account is
           whose. */
        a: "No — there's no shared songbook to invite anyone into. Anyone can create their own account — with an email and password, or with Google — and gets their own collection, kept separate from everyone else's.",
      },
      {
        q: 'Is my collection private, or can others see it?',
        a: "Your collection is private by default, visible only to you — nobody else has access to an account that isn't theirs.",
      },
      {
        q: 'If I stop using Strumfolio, can I take my songs with me?',
        /*
         * Two facts that existed only behind the sign-in wall: `Backup` on the Export screen, and
         * `deleteMyAccount` (`UserMenu.tsx`), which signs the reader out and ends at /login on its
         * own rather than opening a ticket for somebody to action. `/help` §6 has the first and
         * `/help` is not in `PUBLIC_ROUTES`, so before this answer no public page said either.
         *
         * The Terms' own "Keep your own backups" asks the reader to do this regularly; there is no
         * point asking on a landing page, so this answers the question that gets asked instead —
         * whether it is possible at all, and whether leaving is a favour anyone has to grant.
         */
        a: 'Yes, in one download: Backup gives you the whole repertoire as a zip of standard ChordPro files — plain text you can read yourself and hand to another app. Nothing here is kept in a format only Strumfolio understands, and closing the account for good is a button in your own settings rather than a request you have to send us.',
      },
    ],
  },
]

/**
 * Eleven, not an exhaustive list. Each is something a visitor can picture doing on
 * stage, in one sentence — the rest is for whoever is already inside to discover.
 */
const FEATURES: Feature[] = [
  {
    icon: <IconImport size={26} />,
    title: 'Bring your own songs',
    text: "No catalogue to browse. Import what you already have — and start with an example songbook of public-domain songs already in place, so there's something to play from minute one. Edit it your way, export it whenever you like.",
  },
  {
    icon: <IconOnStage size={26} />,
    title: 'Always with you, even offline',
    text: "Open it on your phone like any app. Once your repertoire is saved, it's there for good — anywhere you go, no signal required.",
  },
  {
    icon: <IconBooks size={26} />,
    /* "As many songbooks as you want" and "create them freely" are flatly false on the free
     * plan, which holds exactly one. The new title says what a songbook is *for* instead of how
     * many there may be, which is the part that does not depend on a plan. */
    title: 'A songbook for every set',
    text: "Keep sets, bands and occasions apart, each one split into its own sections — always the song you're after, never an endless list. How many songbooks you can keep depends on your plan.",
  },
  {
    icon: <IconBroadcast size={26} />,
    title: 'Strum together',
    /* "line by line, chord by chord" was carried over from the old wording and is not what the
     * protocol does: `pollBroadcast` sends the song and the transposition, and a follower's
     * viewport is reset to the top on a song change and never touched again. "In the same key" is
     * exactly what it does send. /pricing's guest-link band says it the same way.
     *
     * The closing clause used to be «Starting a session is part of the paid plans; following one
     * never is», with `PLANS_OPEN_HEDGE` spliced into it. Both halves are wrong now — every plan
     * starts one — so the sentence names the free plan's own number instead, which is the fact a
     * visitor reading this card is actually deciding on. It reads `PLANS.free.devices` rather
     * than spelling the number, so this card cannot outlive the cap the way the old sentence
     * outlived the gate. */
    text:
      'Share a link. Every device follows the same song, in the same key — near or far, with nothing to ' +
      `install and no account for anyone following. Every plan starts one, the free plan included, with ` +
      `${count(PLANS.free.devices, 'screen')} following; the paid plans bring more of the room in.`,
  },
  {
    icon: <IconTuningFork size={26} />,
    title: 'Key and capo, made smart',
    text: 'Transpose with a tap, sing in your key. Then let the smart capo suggestion do the math: it finds the fret with the most open chords, so you play the easiest shapes — not just the right sound.',
  },
  {
    icon: <IconChordShape size={26} />,
    title: 'Every chord, one tap away',
    /* What is gated is storing the instrument, not drawing it — see the FAQ answer above and
     * `saveGlobalPrefs`, which writes the row back with `guitar` and returns `not-in-plan`. */
    text: 'Stuck on a chord? Tap it and see the shape, ready to play — guitar on every plan, ukulele on the paid ones.',
  },
  {
    icon: <IconNotation size={26} />,
    title: 'Chords in your own alphabet',
    /* No plan clause on this card, and that is checked rather than assumed: the notation is
     * a reader's own preference and `saveGlobalPrefs` (`lib/prefs/actions.ts`) gates the
     * instrument alone — the notation is written back for every plan, free included. It also
     * has no row on /pricing, so there is nothing there for this to agree or disagree with.
     *
     * "However far you transpose it" is the Nashville claim specifically, and it is the one
     * worth making: a sheet written in degrees of the key is the same sheet at every shift
     * (`key.test.ts` pins exactly that). Read as a promise about the other three alphabets it
     * would be false — hence the em dash, which keeps it attached to the numbers. */
    text:
      'Do-Re-Mi, C-D-E, the German convention with H for B, or Nashville numbers — each chord ' +
      'written as the degree it plays in the key, so the sheet reads the same however far you ' +
      'transpose it. Chosen once, for every song you read.',
  },
  {
    icon: <IconSliders size={26} />,
    title: 'Zoom and scroll',
    text: 'Bigger text, auto-scroll at your pace — readable in any condition, on any phone or tablet. Your hands stay on the instrument.',
  },
  {
    icon: <IconComment size={26} />,
    title: 'Your notes, on the word',
    /* `IconComment` rather than a new glyph: it is already what an anchored note is drawn as
     * inside the app (`CommentsToggle`, `CommentsRail`), so one shape keeps one meaning.
     *
     * Ungated, like the notation card above and for a firmer reason — `lib/comments/actions.ts`
     * states out loud that it runs no plan check and no role check, since a note about how one
     * reader reads is not a modification of anything shared. "With no signal" is that file's
     * read cache and outbox, not an aspiration. */
    text:
      'Pin a private reminder to the exact syllable, or to the chord standing over it — a ' +
      'fingering, a cue, the line you always get wrong. Yours alone, and there with no signal.',
  },
  {
    icon: <IconPrint size={26} />,
    title: 'Print a real booklet',
    /* "Part of the paid plans" full stop was the only sentence in this list that told a reader
     * they *cannot* do something the deployed build lets them do: `loadBooklet` reads
     * `refused.booklet`, which is `null` in `UNGATED`, so a free account prints a booklet with
     * the plans unenforced. The other plan claims on this page understate what an account may
     * do, which is the safe direction; this one denied it outright, and a reader who believes it
     * never opens the booklet screen.
     *
     * Hence `PLANS_OPEN_HEDGE` rather than either wording hard-coded: the hedge was then pinned
     * on unconditionally, which made the sentence wrong in the other direction the day
     * enforcement went on and the plans really did open. One flag read, and the sentence is true
     * in both builds instead of in whichever one it was last edited for. */
    text:
      'Turn any songbook into a typeset PDF — chords above the words, one song a page, a cover ' +
      `and an index — ready to print and hand out. Part of the paid plans${PLANS_OPEN_HEDGE}.`,
  },
  {
    icon: <IconUsers size={26} />,
    title: 'Your own space',
    text: "Sign up with your email or with Google and get your own account and your own songbooks — nothing shared, nothing to manage on anyone else's behalf. From the moment you're in, it's yours alone.",
  },
]

/**
 * The public home: what an anonymous visitor and a crawler get at `/`.
 *
 * **It used to be `/login`, sign-in form and all.** For most of this app's life `/` required a
 * session and redirected there, so the one page a stranger could reach was the one existing
 * readers signed in on every day — and it was built for the second of those two audiences
 * first, with the sign-in card right under the name «because the people here every day are not
 * visitors». That arrangement served the daily reader well and cost the site every visitor who
 * met a password field before a sentence about what the thing does. The card is on `/login` now
 * and this page has one job: say what Strumfolio is, and offer the two ways in. A returning
 * reader reaches the form from «Sign in» in the bar, which is one tap more than they used to
 * need, and that is the trade — knowingly made.
 *
 * The order is an argument rather than a list. The hero says the payoff and shows the reading
 * screen, because the product is a page of words and chords and no sentence beats looking at
 * one. Then the editor band, which is the claim no competitor in this category can match — the
 * sheet itself is the editor — then the reading controls, then Strum Together, which is the one
 * thing on the page two people do at once, then the screens it runs on, then the feature grid
 * for whoever is still reading, then the questions.
 *
 * Rendered by `layout.tsx` beside this file rather than by `page.tsx`, and it draws its own
 * `PublicHeader`: see that layout for why the decision about who is asking is made there, and
 * why this component never sees a signed-in reader — at `/`, at least. It is also rendered by
 * `app/home/page.tsx`, which serves this same page at `/home` to anybody, session or not, so
 * the marketing page can be read without signing out of the app to see it.
 *
 * **That second caller is why `StandaloneRedirect` is no longer in here.** It used to be the
 * first thing this component returned; it belongs to `/` — the argument is entirely about
 * `manifest.ts`' `start_url` — so it sits in that layout's landing branch now. Left here it
 * would have followed this page to `/home` and sent the installed app to `/login` from the one
 * URL whose whole purpose is to show the landing page unconditionally.
 */
export async function Landing() {
  /*
   * The live offer, advertised on the front door.
   *
   * This is where a campaign reaches somebody who has not decided anything yet, and the reason
   * the overlay exists at all rather than living on `/pricing` where the prices already speak
   * for themselves. It sat on `/login` while that page *was* the front door — «this page is the
   * only public one in the app», its own comment said, which is exactly the premise the
   * restructure removed — and it moved here with the rest of the pitch.
   *
   * **It is `activeCoupon` now, not `advertisableCampaign`, and that is the whole change.** This
   * page used to advertise any live campaign to every visitor, which is why the overlay appeared
   * on a bare `/` with nothing in the URL. A coupon is shown only to somebody who arrived with
   * its link — and, for the thirty days the cookie lasts, to that same browser afterwards, which
   * is a session that *did* arrive with it rather than an exception to the rule.
   *
   * The cookie is all this can read: `searchParams` never reaches a layout, and this page is
   * drawn by one. `LandingOffer` below is the other half — it reads the parameter on the client,
   * has it resolved and stored, and asks for the render that this line then answers.
   *
   * **And the cookie is not the whole memory**, since 2026-09-11: it lasts thirty days at most,
   * which is an attribution window and not a judgement about the offer, so `CouponMemory` keeps
   * the code in `localStorage` and writes the cookie again when this page finds none. What it is
   * handed is `restorableCode` below — the campaign in force, when a link could bring it back.
   *
   * `activeCoupon` never throws and answers `null` for any failure — see its own comment. That
   * matters more here than anywhere: a coupon table that cannot be read must not be able to
   * close the front door.
   */
  const jar = await cookies()
  const cookieCode = jar.get(COUPON_COOKIE)?.value ?? null
  const offer = await activeCoupon({ cookie: cookieCode })
  const offerCollapsed = jar.get(OFFER_COLLAPSED_COOKIE)?.value === '1'
  const offerWords = offer === null ? null : offerCopy(offer.discountPercent, offer.discountMonths)

  return (
    <>
      {/*
        * No mark in the bar: the hero badge a few pixels below prints the same lockup, and the
        * same drawing twice on one screen reads as a mistake. 70rem to match `.landing-width`,
        * which every band under it shares. Both actions, since this is the one page whose whole
        * purpose is to offer them.
        */}
      <PublicHeader
        width="70rem"
        brand={false}
        links={[
          { href: '/pricing', label: 'Pricing' },
          { href: '/login', label: 'Sign in' },
        ]}
        cta={{ href: '/register', label: 'Start free' }}
      />

      <main className="relative flex min-h-[100dvh] flex-col items-center px-5 py-10 sm:px-8 sm:py-16 lg:px-12 xl:px-20">
        {/*
          * The hero, full-bleed: `self-stretch` rather than `w-full`, because a width of
          * 100% is measured inside `<main>`'s padding and a negative margin only shifts
          * a box that definite — the band stopped a gutter short of both edges. Stretched,
          * it is the padding box that the negative margins widen, at every breakpoint
          * `<main>`'s own padding changes, and the wash and the grain reach the viewport
          * edge. The inner wrapper then puts the gutter back for the badge, the headline,
          * the actions and the cards — at the width every block below it shares.
          *
          * `lg:pr-0`/`xl:pr-0` were here while the right-hand column was a photograph running
          * off the edge of the window. The redrawn hero has cards there instead, and they end
          * where the page column ends, so the padding is symmetric again — see
          * `.landing-hero-grid`.
          */}
        <section className="landing-hero -mx-5 -mt-10 self-stretch px-5 pb-10 pt-10 sm:-mx-8 sm:-mt-16 sm:px-8 sm:pb-14 sm:pt-14 lg:-mx-12 lg:px-12 lg:pb-[5.25rem] lg:pt-[5.25rem] xl:-mx-20 xl:px-20">
          <div className="landing-hero-decor" aria-hidden />
          <div className="landing-hero-grain" aria-hidden />

          {/* `landing-width` like every band below it, which it was not while the picture bled
              right. `Home.dc.html` draws its content from 80px to 1197px on a 1280 canvas — 1117
              of the 1120 that is 70rem — so the drawing and the page column are the same thing
              and the hero no longer needs a geometry of its own. */}
          <div className="landing-width landing-hero-grid">
            <div className="landing-hero-text">
              {/* Both render; CSS shows one — see the same comment in TopBar.tsx. */}
              <span className="hero-badge">
                {/* eslint-disable-next-line @next/next/no-img-element -- theme-swapped SVG lockup, see TopBar.tsx */}
                <img src="/brand/lockup-horizontal-black.svg" alt={APP_NAME} className="lockup-light" />
                {/* eslint-disable-next-line @next/next/no-img-element -- theme-swapped SVG lockup, see TopBar.tsx */}
                <img src="/brand/lockup-horizontal-white.svg" alt={APP_NAME} className="lockup-dark" />
              </span>

              {/*
                * Two short beats rather than the one clause `APP_PAYOFF` holds for the title
                * bar and the manifest: this is the one line on the screen that is heard, not
                * read for information, and it earns its own wording rather than borrowing theirs.
                */}
              <h1 className="landing-hero-title">
                Your favourite songs.
                <br />
                <span className="text-accent">Ready to play.</span>
              </h1>

              <p className="landing-hero-lede">{HERO_SUBHEAD}</p>

              {/*
                * The two ways in, where the sign-in card used to stand. A row of three pills
                * sat under them for a while, then between the headline and the button before
                * that; both are gone with the cards that now say the same things properly.
                *
                * **«Start free», the same words as the bar** — it read «Get started free» here
                * on the reasoning that the loud control could phrase itself, which is how one
                * action came to have two names on one screen. It is still drawn loud: the
                * mock's 64px/21px against the bar's 36px/14px, and its own class rather than
                * `.btn.btn-primary` plus utilities, the rule the `/accounts` block states — a
                * 64px capsule is a different control from a 44px `.btn`, not a variant of it.
                * Louder, not differently worded.
                *
                * The second is a sign-in, not an anchor. It read «See how it works» and pointed
                * at the editor band, on the reasoning that a visitor should be able to see the
                * thing before being asked for an address, with «Sign in» kept to the bar alone
                * so the hero carried no sign-in weight at all. The mock puts «Already have an
                * account? Sign in» here instead and that is what ships: the daily reader is the
                * one person on this page who knows exactly what they came for, and the demo is
                * three screenfuls of picture below whether or not a link says so.
                */}
              <div className="landing-hero-actions">
                <Link href="/register" className="landing-hero-cta">
                  Start free
                </Link>

                <span className="landing-hero-aside">
                  Already have an account?{' '}
                  <Link href="/login" className="landing-hero-signin">
                    Sign in
                  </Link>
                </span>
              </div>
            </div>

            {/*
              * The fourth answer this column has had, and the first that is words.
              *
              * A password field stood here while `/` redirected to `/login`; then `ReaderPhone`,
              * on the reasoning that a reading app should show a song being read; then the
              * three-device photograph cropped to a band, which is what the previous
              * `Home.dc.html` drew. The redrawn one puts three cards here and sends the
              * photograph down to «Every screen you own is ready to play.», which is the only
              * place it appears in the mock now — that band already existed and is unchanged,
              * so the picture is moved rather than dropped.
              *
              * The reason the trade is worth making: a headline and a photograph both argue at
              * once and neither says what the thing does. Three sentences beside the headline
              * answer the visitor's actual first question — what happens after I sign up — and
              * the capsule under them answers the second one before the pricing page has to.
              */}
            <div className="hero-cards">
              {HERO_CARDS.map((card) => (
                <div key={card.title} className="hero-card">
                  <span className="hero-card-icon">{card.icon}</span>
                  <span>
                    <span className="hero-card-title">{card.title}</span>
                    <span className="hero-card-text">{card.text}</span>
                  </span>
                </div>
              ))}

              {/*
                * What the free plan holds, read from `PLANS` rather than typed — the rule the
                * `count` helper above exists for, and the reason the mock's own «1 songbook, 30
                * songs» is not copied across as words even though it agrees with the table today.
                *
                * No `plansEnforced()` hedge, unlike the FAQ answer below: this says what the free
                * plan *is*, which /pricing states as plain fact under either flag, where
                * `PLAN_HOLD` answers the different question of whether the limits are being
                * enforced yet. Said once, in the one answer that is about it — see that constant.
                */}
              <span className="hero-free">
                <IconCheck size={15} />
                Free plan: {count(PLANS.free.songbooks, 'songbook')}, {count(PLANS.free.songs, 'song')}, no card
              </span>
            </div>
          </div>
        </section>

        {/*
          * The visual editor, ahead of everything else this page has to say: it is the
          * thing no other app in this category does — the sheet itself is the editor —
          * and instead of describing it, the demo beside the copy IS it, built with the
          * editor's own ghost-anchor technique so it can never drift from the product
          * (see `EditorDemo`). The demo leads on a wide screen and follows the words on
          * a phone; the three points beside it are shipped behaviour, not roadmap.
          *
          * No `id` any more. It briefly had `id="editing"`, as the target of a «See how it
          * works» anchor in the hero, and `Home.dc.html` replaced that anchor with a sign-in
          * link. An id nothing points at is a promise to the next reader that something does.
          */}
        <section className="landing-width mt-11 lg:mt-20">
          <div className="editor-tour-grid">
            <div>
              <span className="landing-kicker">Editing, made visual</span>
              <h2 className="landing-section-title mt-2.5">Edit the song, not the code.</h2>
              <p className="mt-2.5 max-w-[30rem] text-pretty text-sm leading-[1.5] text-muted">
                Words on the line, chords above them — the same layout you read from on
                stage. Simple to use, no syntax to remember.
              </p>

              <div className="editor-points">
                {EDITOR_POINTS.map((point) => (
                  <div key={point.title} className="editor-point">
                    <span className="editor-point-icon">{point.icon}</span>
                    <div>
                      <h3 className="editor-point-title">{point.title}</h3>
                      <p className="editor-point-text">{point.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="editor-tour-demo">
              <EditorPhone />
            </div>
          </div>
        </section>

        {/*
          * The reading screen, mirrored against the editor band above it: there the phone
          * leads and the words follow, here the words lead and the phone follows, so two
          * bands of the same shape do not read as one long column.
          *
          * It comes second of the pair on purpose. The editor answers "how does my song get in
          * here"; this answers "what happens when I play it" — and the second question is only
          * worth asking once the first has been.
          *
          * `ReaderPhone` spent a few hours in the hero, while that column was looking for
          * something to be after the sign-in card left it. `Home.dc.html` puts the three-device
          * shot up there and keeps a phone down here, which is also the better division of
          * labour: the hero says «every screen you own», this band says what one screen does.
          */}
        <section className="landing-width mt-11 lg:mt-20">
          <div className="reader-tour-grid">
            <div>
              <span className="landing-kicker">Reading, on stage</span>
              <h2 className="landing-section-title mt-2.5">Your key, your capo, mid-song.</h2>
              <p className="mt-2.5 max-w-[30rem] text-pretty text-sm leading-[1.5] text-muted">
                Transpose with a tap and the whole sheet reletters with you — chords,
                diagrams, fingerings, all in the new key.
              </p>

              <div className="editor-points">
                {READER_POINTS.map((point) => (
                  <div key={point.title} className="editor-point">
                    <span className="editor-point-icon">{point.icon}</span>
                    <div>
                      <h3 className="editor-point-title">{point.title}</h3>
                      <p className="editor-point-text">{point.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <ReaderPhone />
            </div>
          </div>
        </section>

        {/*
          * Strum Together, raised above the feature tour below rather than folded into
          * it: it is the one thing on this page two people are doing at once. It reads
          * second of the two spotlights now — the editor band above leads, being the
          * claim no competitor can match — but on the same warm, bordered panel `.promo`
          * closes an article with, not the fill this band used to carry alone. See
          * `.strum-tour`'s own comment in globals.css for why the tokens moved.
          *
          * More top margin than a plain section-to-section gap, matching the section
          * below it: this keeps both bands close together, since the second is
          * what makes "every screen" a claim a visitor can see rather than take on faith.
          */}
        <section className="landing-width mt-14 lg:mt-20">
          <div className="strum-tour">
            <div className="strum-tour-head">
              <span className="landing-kicker">Strum Together</span>
              <h2 className="strum-tour-title">One phone leads. Everyone else just plays.</h2>
              <p className="strum-tour-text">
                Share a link or a QR code. Whoever opens it follows the same song, in the same
                key, scrolling on its own.
              </p>
            </div>

            <StrumTogetherStage />

            <div className="strum-tour-points">
              {STRUM_TOGETHER_POINTS.map((point) => (
                <div key={point.title}>
                  <h3 className="strum-tour-point-title">{point.title}</h3>
                  <p className="strum-tour-point-text">{point.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/*
          * Cross-device, right below Strum Together: the mockup is what makes "every
          * screen" a claim a visitor can see rather than take on faith, and it is the one
          * section on this page that leans on an image rather than an icon and a sentence.
          */}
        <section className="landing-width mt-14 lg:mt-14">
          <div className="device-tour-grid">
            <div>
              <span className="landing-kicker">No install, anywhere</span>
              <h2 className="landing-section-title mt-2.5">Every screen you own is ready to play.</h2>
              <p className="mt-2.5 text-sm leading-[1.5] text-muted">
                Organise your songbooks at the desk on Windows or Mac, then open the same library on
                whatever&apos;s propped up in front of you — Android or iPad — and keep reading and
                playing if there is no signal.
              </p>
            </div>

            <Image
              src="/brand/device-mockup.webp"
              alt="Strumfolio open on a laptop, tablet and phone"
              width={2400}
              height={1668}
              sizes="(min-width: 1024px) 55vw, 90vw"
              className="h-auto w-full"
            />
          </div>
        </section>

        <section className="landing-width mt-11 lg:mt-20">
          <div className="text-center">
            <h2 className="landing-section-title">Built for playing, not scrolling.</h2>
            <p className="mx-auto mt-2 max-w-[26rem] text-sm leading-[1.45] text-muted lg:mt-2.5 lg:max-w-[30rem] lg:text-[15px] lg:leading-[1.5]">
              Every control is built for a thumb, not a mouse — for a hand already holding
              an instrument.
            </p>
          </div>

          <div className="feature-grid mt-6 lg:mt-8">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="feature-card">
                <div className="feature-head">
                  <span className="feature-icon">{feature.icon}</span>
                  <h3 className="feature-title">{feature.title}</h3>
                </div>
                <p className="feature-text">{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/*
          * `<details>` per question rather than a client component with a piece of state
          * per row: nothing here needs JavaScript to show a paragraph of text once
          * tapped, and the browser already gives that focus, keyboard support, and a
          * screen reader's own sense of "expanded" for free — the same choice
          * `.editor-data` already makes for the song-data drawer elsewhere in the app.
          */}
        <section className="landing-width mt-11 lg:mt-20">
          <h2 className="landing-section-title border-b border-line-soft pb-[1.625rem]">Frequently asked questions</h2>

          {/* 34px between groups, the mock's own — see `.group-label` for the label above each. */}
          <div className="mt-6 space-y-7 lg:mt-8 lg:space-y-[2.125rem]">
            {FAQ.map((group) => (
              <div key={group.title}>
                <span className="group-label">{group.title}</span>

                <div className="faq-grid mt-2.5">
                  {group.items.map((item) => (
                    <details key={item.q} className="card faq-item">
                      <summary>
                        <IconChevronRight size={15} className="faq-arrow" />
                        <span>{item.q}</span>
                      </summary>
                      <p className="faq-answer">{item.a}</p>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/*
          * The last thing the page says, and it stays a sentence rather than becoming a panel.
          *
          * It has to sit out here rather than inside one of the two answers that name the pricing
          * page in words: `FaqItem.a` is typed `string` and rendered as `{item.a}`, so an answer
          * cannot hold a link without widening that type and touching all twenty-two of them.
          *
          * **Its old reason for being quiet is gone and it is still quiet, by decision.** The
          * reason used to be that this was «the page every existing reader signs in on every day,
          * and it is not a sales pitch» — which stopped being true the moment the sign-in form
          * moved to `/login` and this page became pure acquisition. The obvious replacement was
          * `PromoPanel`, which already closes every article and every tool page and would have
          * cost no new copy. Weighed and declined: the product's own voice takes «nothing
          * decorative ships without a stated reason» seriously, and a second promotional panel
          * for a reader who has just read twenty-two answers is decoration. The counterargument
          * — that the home is now the one public page closing with no ask at all — is real, and
          * worth revisiting against what `/leads` records rather than by taste.
          */}
        <p className="mt-9 text-center text-sm text-muted lg:mt-12">
          Every plan side by side, on the{' '}
          <Link href="/pricing" className="text-accent hover:underline">
            pricing page
          </Link>
          .
        </p>

        <Footer />

        {/* Reads `?promo=1` / `?coupon=CODE`, which this page cannot see for itself, and stores
            it so the render above finds it. In `Suspense` because `useSearchParams` requires a
            boundary; it draws nothing, so the fallback is nothing. */}
        <Suspense fallback={null}>
          <LandingOffer carriedCode={cookieCode} />
        </Suspense>

        {/* The other memory: `localStorage`, for the offer that outlives the thirty-day cookie.
            Beside `LandingOffer` rather than inside it — that one is about a URL this page
            cannot see, this one about a visit weeks ago — and in its own `Suspense` for the same
            `useSearchParams` reason. */}
        <Suspense fallback={null}>
          <CouponMemory restorable={restorableCode(offer)} />
        </Suspense>

        {/* Last in the document, fixed to the foot of the viewport by CSS — see `CouponOverlay`
            on why reading order matters for a bar that overlays a page. The CTA goes to the price
            list, which is where somebody who has just been told about an offer wants to land. */}
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
    </>
  )
}
