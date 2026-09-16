/**
 * What has shipped, release by release — the data behind `/changelog`.
 *
 * **One release a week, declared on a Saturday.** 1.0 landed on Saturday 22 August 2026 and the
 * weeks have been counted from it since, so every version here falls on a Saturday with no
 * arithmetic and no anchor anybody had to invent. A week that produced nothing a reader would
 * notice **publishes nothing**: the number skips, which is the honest record and is far better
 * than an entry padded out with work that changed no screen.
 *
 * This replaces the rule the file opened with until 2026-09-16 — «macro releases only… far less
 * often than the repository changes» — which had produced exactly one entry in three weeks while
 * the app grew a metronome, a public home page, anchored notes, favourites, two notations and
 * file import. The doctrine was not wrong about *what* belongs here; it was wrong about how
 * often that happens.
 *
 * Four rules decide what may be written, and each exists because breaking it has a cost:
 *
 * 1. **A highlight is something a reader would notice.** Never a refactor, a migration, a rename
 *    or a document. `git log` holds those and holds them better.
 * 2. **A fix is written as the outcome, never as the confession.** «Signing out ends the session
 *    straight away» — not «signing out used to leave you signed in». The `fixed` label already
 *    says it was broken; the sentence says what the app does today, which is the only part a
 *    reader can act on.
 * 3. **Nothing here may describe buying, upgrading, cancelling or redeeming a coupon as
 *    something a reader can do**, for as long as `/pricing` answers «Coming soon» rather than
 *    selling. Checked against the deployed site, not against this branch: a great deal of real
 *    work on payments is therefore absent from the entries below, and absent on purpose.
 * 4. **A highlight describes the app as it is now, not as the week left it.** A reader reads
 *    every line here as a statement about today, whatever date sits above it — which is what the
 *    1.0 correction below is about, and what a three-week backfill trips over twice if nobody is
 *    watching. Check the current code or the live page before writing a line, never the commit
 *    that introduced the thing.
 *
 * **1.1 to 1.3 were reconstructed on 2026-09-16** from the repository's history, not published
 * week by week as they happened. The dates are true — that is genuinely when each change reached
 * production — so nothing is hedged in what a reader sees; the qualification belongs here, in the
 * comment, and nowhere else. This is not the same act as editing a release that was already
 * published, which the 1.0 note below treats as the exception it is.
 *
 * **The numbering starts fresh at 1.0 and is public.** The project kept an internal version
 * scale of its own — v1 through v4.7, thirty-odd entries in the `PLAN` docs deleted on
 * 2026-09-06 — and it is deliberately *not* reused here. Two reasons: that scale had real
 * holes in it (a `/pricing`/`/login` redesign, a schema cascade fix and everything after
 * v3.9 landed straight in the code, labeled only in scattered comments or not at all), and
 * half of it describes an app with a single reader and no accounts, which nobody using
 * Strumfolio today has ever seen. Publishing
 * a numbering with holes in it, half of it about a product that was never on sale, would be a
 * worse record than starting one that is true from here on. `package.json`'s `0.1.0` is not
 * that number either and never has been — nothing reads it.
 *
 * Newest first, which is the order the page renders and the order `changelog.test.ts` pins.
 */

/**
 * What kind of change a highlight is, printed as a small label in front of it.
 *
 * Three and not four. A `changed` label was drafted for the one line that is neither an
 * addition nor an improvement — the ukulele moving behind the paywall on 27 August — and both
 * were dropped together: 1.0's own highlight had already been rewritten to today's arrangement,
 * so a 1.1 entry announcing the change would have sat a few centimetres under a 22 August entry
 * that already states it, which is the one pair of lines a reader sees at once.
 */
export type ChangeKind = 'new' | 'better' | 'fixed'

/** The word each kind prints. Here rather than in the page, so a fourth cannot half-exist. */
export const KIND_LABEL: Record<ChangeKind, string> = {
  new: 'New',
  better: 'Better',
  fixed: 'Fixed',
}

export interface Highlight {
  kind: ChangeKind
  /** One sentence, in what a reader would actually notice. */
  text: string
}

export interface Release {
  /** The public version. One minor per week — see this file's header. */
  version: string
  /** ISO `YYYY-MM-DD`, always a Saturday. Rendered as a full date by `releaseDate`. */
  date: string
  /** What the release was about, in one line. */
  title: string
  /**
   * What changed. The order here is the order on screen — deliberately not re-sorted by kind,
   * so the most interesting thing in a week can lead it whatever kind it happens to be.
   */
  highlights: Highlight[]
}

export const RELEASES: Release[] = [
  {
    version: '1.3',
    date: '2026-09-12',
    title: 'A front door, a metronome, and a quieter reading screen',
    highlights: [
      { kind: 'new', text: 'strumfolio.com now says what the app is before asking anybody for a password.' },
      {
        kind: 'new',
        text: 'A metronome in the reading bar, with its tempo on the same control — keeping time no longer means a second app open beside the song.',
      },
      {
        kind: 'new',
        text: 'Import PDF and Word files. A document holding several songs is split into one song each, and a scanned page says so instead of arriving empty.',
      },
      {
        kind: 'new',
        text: 'The free plan leads a Strum Together session, with one screen following along.',
      },
      {
        kind: 'new',
        text: 'Two chord references anyone can open without an account, guitar and ukulele, with every shape and its alternatives.',
      },
      { kind: 'new', text: 'Add the app to your home screen, from the menu.' },
      {
        kind: 'better',
        text: 'Notes open over the sheet instead of pushing it sideways, and once you hide them they stay hidden from one song to the next.',
      },
      { kind: 'better', text: 'Faint text on the reading screen is readable now, in both themes.' },
      {
        kind: 'fixed',
        text: 'Auto-scroll plays on a song that fits one screen, plays again after a song has run to the end, and works above 100% browser zoom. The screen stays awake throughout.',
      },
      {
        kind: 'fixed',
        text: 'Signing out ends the session straight away, on every device and inside the installed app.',
      },
      {
        kind: 'fixed',
        text: 'Italian-style major sevenths — do7+, la7+ — give the note the song actually asks for.',
      },
      { kind: 'fixed', text: 'A shaky signal no longer reloads the page from under you mid-song.' },
    ],
  },
  {
    version: '1.2',
    date: '2026-09-05',
    title: 'Your own marks on the song',
    highlights: [
      {
        kind: 'new',
        text: 'Anchored notes: pin a private reminder to the exact syllable, or to the chord standing over it. Yours alone, and writable with no signal.',
      },
      {
        kind: 'new',
        text: 'Favourites — a star beside the title, and a switch that shows only the songs carrying one.',
      },
      {
        kind: 'new',
        text: 'Alternative chord shapes: tap a chord, flip through every playable fingering, and the one you pick is kept for that song.',
      },
      {
        kind: 'new',
        text: 'Two more notations to read in — the German convention with H for B, and Nashville numbers, where each chord is written as the degree it plays in the key.',
      },
      {
        kind: 'new',
        text: 'Key, capo and chord display move onto the song itself, as chips under the title, with a choice of sharps or flats and four ways to draw a chord.',
      },
      {
        kind: 'new',
        text: 'Import reads far more: ZIP archives, OpenSong and SongbookPro backups, folders turned into sections, and the dialect each app writes.',
      },
      { kind: 'new', text: 'Print the booklet in your key and with your capo, not only as written.' },
      {
        kind: 'new',
        text: 'Every new account arrives with an example songbook of public-domain traditionals already in it, so there is something to play from the first minute.',
      },
      {
        kind: 'new',
        text: 'A public blog, and four small tools that do their whole job in the browser — no account, nothing uploaded.',
      },
      {
        kind: 'better',
        text: 'Booklet pages fill like a newspaper: no pages holding only a title, no half-empty columns, and index numbers that match the sheet the song is on.',
      },
      {
        kind: 'fixed',
        text: 'Dragging a song to reorder it follows your finger, past the bottom of the screen and while the page scrolls.',
      },
    ],
  },
  {
    version: '1.1',
    date: '2026-08-29',
    title: 'Bring songs in, and put the chords where you want them',
    highlights: [
      {
        kind: 'new',
        text: 'Bring in a file at all — a new add-song screen with three ways in: write it, paste it, or import it.',
      },
      {
        kind: 'new',
        text: 'The visual editor: tap the strip to drop a chord on the syllable under your finger, hold it to slide it a letter at a time, and undo anything.',
      },
      {
        kind: 'new',
        text: 'Jump to any song in your account by title, artist or tag, without losing the one you are reading.',
      },
      { kind: 'new', text: 'The printable booklet gets a screen of its own.' },
      {
        kind: 'better',
        text: 'Scrolling by hand pauses auto-scroll instead of ending it, and it picks up again once the page settles — going back a line no longer means hunting for the play button with a guitar in your hands.',
      },
      { kind: 'better', text: 'A Strum Together follower reads the chords in the leader’s own notation.' },
      { kind: 'better', text: 'Saving a song lands you back on the songbook, with it in the list.' },
      {
        kind: 'fixed',
        text: 'Chord diagrams draw a barre only where the hand really makes one, and two ukulele diminished shapes sit within the third fret where they belong.',
      },
      { kind: 'fixed', text: 'Capo frets above the fifth are reachable.' },
      { kind: 'fixed', text: 'Signing in with an email and a password brings the whole app up at once.' },
      {
        kind: 'fixed',
        text: 'Chords on neighbouring syllables stack into their own lanes in the editor instead of overlapping into something unreadable.',
      },
    ],
  },
  {
    version: '1.0',
    date: '2026-08-22',
    title: 'The first published release',
    highlights: [
      {
        kind: 'new',
        text: 'Read your own lyrics and chords on stage: pinch to zoom, hands-free auto-scroll, and text that stays legible at arm’s length.',
      },
      {
        kind: 'new',
        text: 'Transpose into the key you actually sing in, and set a capo — the chords are rewritten for the shapes you are really playing.',
      },
      {
        kind: 'new',
        text: 'Works with no signal. Once a song has been opened it stays readable offline, which is what a rehearsal room in a basement needs.',
      },
      {
        kind: 'new',
        text: 'Organise a repertoire into songbooks, and a songbook into sections, in the order you play them.',
      },
      {
        kind: 'new',
        text: 'Bring what you already have in, and take it back out again: ChordPro in, ChordPro out, nothing held hostage.',
      },
      /*
       * **Corrected after the fact rather than left as history**, which is the one entry here
       * that has been, so it is worth saying why. It read «for guitar or for ukulele — and from
       * Standard up, the choice follows you to your other devices», which was true of 1.0: the
       * ukulele was free to pick and what the paid plans bought was the choice sticking. The
       * ukulele is a paid feature now, and a reader does not read a highlight as a note about
       * August — they read it as what the app does. A stale sentence about a *gate* is the kind
       * that costs somebody a decision about paying, and it contradicted /pricing, which is the
       * page they would check next.
       *
       * The rule this bends, and its limit: entries describe releases, and a release that has
       * shipped is not normally edited. What earns the exception is that the claim is about what
       * a plan includes today; nothing else in this list is, and nothing else has been touched.
       * Note that it is also why 1.1 says nothing about the ukulele becoming paid, though that
       * is exactly what happened in 1.1's week: this line already tells a reader the arrangement
       * they are under, and announcing it a second time under a later date would read as two
       * different answers to one question.
       */
      {
        kind: 'new',
        text: 'Tap a chord to see the fingering, ready to play — guitar on every plan, and the ukulele from Standard up.',
      },
      {
        kind: 'new',
        text: 'Strum Together: everyone opens a link on their own phone and reads the same song in your key, following your line.',
      },
      {
        kind: 'new',
        text: 'A printed booklet as a PDF, ready for the music stand: cover, index, one song a page.',
      },
      {
        kind: 'new',
        text: 'Sign in with Google or with an email and a password, and pick the plan that fits — starting with a free one that has no end date.',
      },
    ],
  },
]

/**
 * What the footer prints, both derived from the newest release rather than kept as their own
 * constants — which is the point: the version in the corner of every page and the top entry on
 * `/changelog` are the same fact, and two hand-maintained copies of one fact drift. Shipping a
 * release is editing `RELEASES`, and the footer follows.
 *
 * Guarded against an empty `RELEASES` even though `changelog.test.ts` asserts it never is:
 * `Footer` renders on every page in the app, so an exception thrown reading `[0]` would not be
 * a blank footer, it would be a blank site.
 */
const LATEST: Release | undefined = RELEASES[0]

export const CURRENT_VERSION = LATEST?.version ?? '—'

/**
 * The year for the copyright line: the newest release's, not `new Date()`'s.
 *
 * `new Date()` in a server component is evaluated when the page is *built*, so on a statically
 * prerendered footer it freezes at the build year and then quietly lies every January until
 * something happens to trigger a redeploy — the same build-time trap `/pricing`'s own
 * `LIFETIME_OPEN` documents. The newest release's year needs no clock at all, and it is the
 * year copyright convention actually asks for: when the work was last published.
 */
export const COPYRIGHT_YEAR = LATEST?.date.slice(0, 4) ?? ''

/**
 * The fragment a release is linked by: `'1.2'` → `'v1-2'`.
 *
 * The dot is replaced rather than kept. `id="v1.2"` is legal HTML and `href="#v1.2"` even works,
 * but `#v1.2` read as a CSS selector is `#v1` plus a class `.2` — so `querySelector` and any
 * later `:target` rule would break, silently and a long way from here.
 */
export function releaseAnchor(version: string): string {
  return `v${version.replace(/\./g, '-')}`
}

/**
 * `'2026-09-12'` → `'12 September 2026'`.
 *
 * Parsed by hand rather than through `new Date(...).toLocaleDateString()`, and the reason got
 * *stronger* when this started printing days instead of months: a bare `YYYY-MM-DD` is read as
 * UTC midnight, so anywhere behind Greenwich `new Date('2026-09-12')` is the evening of the
 * 11th — every date renders a day early, not just the awkward ones, and a release note dated
 * differently on two readers' screens is a bug nobody would think to look for. Splitting the
 * string cannot drift.
 *
 * The day is printed at all — it was a bare month until 2026-09-16 — because the releases are
 * weekly now: three of them inside one September would otherwise read «September 2026» three
 * times over and be impossible to tell apart.
 *
 * An unrecognisable date returns the input untouched. Nothing here is worth throwing over: a
 * malformed entry should print oddly, not take the whole page down.
 */
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function releaseDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (match === null) return date

  const month = MONTHS[Number(match[2]) - 1]
  if (month === undefined) return date

  /* `Number` rather than the captured string, so the 2nd is "2 September" and not "02". */
  return `${Number(match[3])} ${month} ${match[1]}`
}
