'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { FeaturePaywallModal } from '@/components/FeaturePaywallModal'
import { usePrefs } from '@/components/PrefsProvider'
import { useRole } from '@/components/RoleProvider'
import { useStrumTogether } from '@/components/StrumTogetherProvider'
import { StrumTogetherPanel } from '@/components/StrumTogetherPanel'
import {
  IconBroadcast,
  IconChevronLeft,
  IconChevronRight,
  IconHare,
  IconLock,
  IconPause,
  IconPlay,
  IconSliders,
  IconTurtle,
  IconUndo,
} from '@/components/icons'
import {
  type CapoOption,
  FRET_PAGE,
  MAX_CAPO,
  formatSemitones,
  fretWindowStart,
  suggestCapo,
} from '@/lib/music/capo'
import { estimateKey } from '@/lib/music/key'
import { C_MAJOR, type Key, transposeKey } from '@/lib/music/notes'
import { INSTRUMENTS, INSTRUMENT_LABEL, type Instrument } from '@/lib/music/shapes'
import { PAYWALL_FEATURES } from '@/lib/plans/paywall'
import { PLANS } from '@/lib/plans/types'
import { type ChordDisplay, SCROLL_SPEEDS, ZOOM_STEPS, clampSemitones } from '@/lib/prefs/types'
import { broadcastPlay, broadcastTranspose } from '@/lib/strumTogether/session'
import { useAutoScroll } from '@/lib/useAutoScroll'

/** Where this song sits in the sequence a reader can step through with the bar's own
 *  prev/next capsule — `null` when there is none, a guest following a broadcast being
 *  the one case that applies to today: `FollowSession` mounts `ControlBar` directly, with
 *  no `steps` prop, rather than passing one with nothing in it. */
export interface NavSteps {
  previous: string | null
  next: string | null
  position: number
  total: number
}

/** Which floating panel is open above the bar, if any — at most one at a time, so
 *  opening a second always closes whichever the reader had open already. */
type Panel = 'settings' | 'speed' | 'sing' | null

/**
 * The reading controls, floating over the bottom of the song.
 *
 * Redesigned around the same one-row idea the previous version put in words —
 * "the ones a hand reaches for with a guitar in the other" — but that set has grown by
 * two: Strum Together now has a quick toggle here rather than living only in the header
 * menu, and stepping to the next song has moved down from the header into a capsule of
 * its own beside this one. On a phone there is no room to also keep the scroll-speed
 * slider spread out full width once those two are added, so it collapses to a single
 * icon there — see `.speed-compact`'s own comment — which is what frees enough width
 * for the two capsules to read as one bar rather than two, at that size.
 *
 * Everything set once before the song starts — capo, text size, how a chord is shown —
 * still lives in the settings panel behind its own button, unchanged in spirit from
 * before: a control tapped mid-song stays out here, one set once stays behind the
 * button.
 */
export function ControlBar({
  songSlug,
  chords = [],
  semitonesLocked = false,
  broadcastEnabled = true,
  steps = null,
  stepsLocked = false,
  onStepTo,
}: {
  /**
   * Which song this bar belongs to — needed only to tell Strum Together which song
   * just started or was retuned. The ordinary reading flow never looks at it itself;
   * it exists so `broadcastPlay` and `broadcastTranspose` below have something to say
   * that is true even when nobody is broadcasting, in which case they say it to nobody.
   */
  songSlug: string
  /**
   * Every chord token of the song, for the capo suggestion and for guessing the key
   * it's written in. Empty is a fine answer — both then have nothing to say.
   */
  chords?: string[]
  /**
   * True only for the guest side's reuse of this same bar: a guest is following
   * someone else's key, not choosing their own, so the buttons that would change it
   * are disabled rather than hidden — the Key row still has to say what key this is.
   * Always false here, on the reader's own copy of the bar, where the key is theirs
   * to move.
   */
  semitonesLocked?: boolean
  /**
   * False only for Strum Together's guest view. `broadcastPlay`/`broadcastTranspose`
   * would otherwise fire under whichever real account happens to be signed into the
   * browser showing the link — not the guest reading it, since a guest has none — and
   * silently retarget that account's own broadcast. A guest's own copy of this bar
   * must never be able to call them, session or not; that is a categorical property of
   * where the bar is mounted, not something to detect from whether a session exists.
   * The same flag also hides the Strum Together toggle itself, for the same reason: a
   * guest must never be offered a way to start a broadcast of their own.
   */
  broadcastEnabled?: boolean
  /** This song's place in the songbook it was opened from, for the prev/next capsule.
   *  `null` when there is none to show — a guest's reading page with no songbook open,
   *  or a song with no songbook of its own. */
  steps?: NavSteps | null
  /**
   * True only while a follower is actually following a broadcast: the position still
   * shows ("3/12"), so a guest can see where the leader is in the songbook, but
   * stepping away from it is not theirs to do while the broadcast is still choosing
   * for them — the same reasoning `semitonesLocked` already applies to the key, kept
   * as a second flag rather than folded into it because a guest may suspend following
   * (`Unfollow`) without that touching the key lock at all. Always false on the
   * reader's own copy of this bar.
   */
  stepsLocked?: boolean
  /**
   * How to reach the song `steps` names, when a real navigation is not what that
   * means — a follower's own page, which shows a song by swapping state rather than
   * routing. Omitted on the reader's own copy of this bar, where `Step` falls back to
   * a plain `Link` to `/songs/‹slug›`.
   */
  onStepTo?: (slug: string) => void
}) {
  const {
    global,
    song,
    pending,
    setZoomStep,
    setChordDisplay,
    setInstrument,
    setSemitones,
    setScrollSpeed,
    setCapo,
  } = usePrefs()
  const { running, toggle } = useAutoScroll(song.scrollSpeed)
  const [panel, setPanel] = useState<Panel>(null)
  const { broadcast } = useStrumTogether()

  /*
   * Gated on `broadcastEnabled` as well as on there being a broadcast at all: on the
   * guest side the provider answers `null` anyway (a follower has no session, so
   * `getMyBroadcast` finds nothing), but that is a fact about who happens to be signed
   * into the browser rather than about this bar, and the same reasoning
   * `broadcastEnabled`'s own comment gives applies — a guest's copy of this bar must
   * never speak for an account that isn't reading it.
   */
  const broadcasting = broadcastEnabled && broadcast !== null && broadcast !== undefined

  const setSemitonesAndBroadcast = (value: number) => {
    const clamped = clampSemitones(value)
    setSemitones(clamped)
    if (broadcastEnabled) void broadcastTranspose(songSlug, clamped).catch(() => {})
  }

  useEffect(() => {
    if (panel === null) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel])

  /*
   * Only while the settings panel is open, because that is the only place either is
   * shown — and because on a ukulele the capo suggestion is searched rather than looked
   * up: about thirteen thousand fingerings per chord, cached after the first time, but
   * the first time is 56 ms of one thread. Paying that when a panel is opened is fine;
   * paying it on every reading page, for something nobody is looking at, is not.
   */
  const suggestion = useMemo(
    () =>
      panel === 'settings' ? suggestCapo(chords, song.semitones, song.capo, global.instrument) : null,
    [panel, chords, song.semitones, song.capo, global.instrument],
  )
  const written = useMemo(
    () => (panel === 'settings' ? (estimateKey(chords) ?? C_MAJOR) : null),
    [panel, chords],
  )

  const lastSpeed = SCROLL_SPEEDS.length - 1

  return (
    <nav className="control-bar" aria-label="Reading controls">
      {/*
        * Catches the tap that means "never mind", and mutes the song while the panel is
        * over it. Inside the bar, so it does not count as the gesture that hands the scroll
        * back to the reader (`useAutoScroll`) — a tap on the overlay dismisses a panel, it
        * does not mean «I am scrolling now».
        *
        * The veil is `.menu-overlay`'s own now, at every width and for every panel — the
        * phone redesign gave it to this one panel with a class of its own, which made the
        * reading panel the only thing in the app that put its background aside. See that
        * rule for why the two themes push in opposite directions.
        */}
      {panel !== null && <div className="menu-overlay" onClick={() => setPanel(null)} aria-hidden />}

      <div className={steps === null ? 'control-strip' : 'control-strip has-nav'}>
        {/*
         * Both panels below are siblings of `.control-dock`/`.control-nav` here, not
         * children of the button that opens them: `.control-strip` is what still spans
         * the bar's true edges once `.control-nav` is sharing the row with the dock,
         * and a panel anchored to the dock's own (now narrower) edge went partly off
         * the screen on a phone the moment there was somewhere for it to shrink from.
         */}
        {panel === 'settings' && (
          <ReadingPanel
            semitones={song.semitones}
            semitonesLocked={semitonesLocked}
            capo={song.capo}
            suggestion={suggestion}
            written={written}
            chordDisplay={global.chordDisplay}
            instrument={global.instrument}
            zoomStep={global.zoomStep}
            broadcasting={broadcasting}
            setSemitones={setSemitonesAndBroadcast}
            setCapo={setCapo}
            setChordDisplay={setChordDisplay}
            setInstrument={setInstrument}
            setZoomStep={setZoomStep}
          />
        )}

        {broadcastEnabled && panel === 'sing' && (
          <div className="strum-panel">
            <StrumTogetherPanel onClose={() => setPanel(null)} />
          </div>
        )}

        <div className="control-dock">
          {broadcastEnabled && <StrumToggle open={panel === 'sing'} onToggle={() => setPanel((current) => (current === 'sing' ? null : 'sing'))} />}

          <button
            type="button"
            className="control-button control-play"
            onClick={() => {
              /*
               * Only on the press that starts the scroll, never the one that stops it:
               * pausing is a private, local thing to do while reading, and must not
               * change what anyone else's screen is showing. `broadcastPlay` no-ops on
               * its own when this reader has no broadcast running, so nothing here
               * checks for one first.
               */
              if (!running && broadcastEnabled) void broadcastPlay(songSlug, song.semitones).catch(() => {})
              toggle()
            }}
            aria-pressed={running}
            aria-label={running ? 'Stop scrolling' : 'Start scrolling'}
          >
            {running ? <IconPause size={16} /> : <IconPlay size={16} />}
          </button>

          {/* The full slider, shown from the width the two capsules can no longer
              share the row at — see `.speed-full`'s own rule. */}
          <div className="speed speed-full">
            <IconTurtle size={24} />
            <input
              type="range"
              className="speed-range"
              min={0}
              max={lastSpeed}
              step={1}
              value={song.scrollSpeed}
              onChange={(event) => setScrollSpeed(Number(event.target.value))}
              style={{ '--fill': `${(song.scrollSpeed / lastSpeed) * 100}%` } as React.CSSProperties}
              aria-label="Scroll speed"
              aria-valuetext={`${song.scrollSpeed + 1} of ${SCROLL_SPEEDS.length}`}
            />
            <IconHare size={24} />
          </div>

          {/*
            * Speed and the panel button, wrapped together — one cell of the phone's grid,
            * and nothing at all here, where `.control-tools` is `display: contents` and
            * these two are direct children of the dock exactly as they were.
            */}
          <div className="control-tools">
            {/* The collapsed version, below that width: an icon that opens the same
                slider standing on end above it. */}
            <div className="speed-compact">
              <button
                type="button"
                className="control-button"
                onClick={() => setPanel((current) => (current === 'speed' ? null : 'speed'))}
                aria-expanded={panel === 'speed'}
                aria-label="Scroll speed"
              >
                <IconHare size={19} />

                {/*
                  * Which speed it is set to, on a phone, where the slider is behind this
                  * button rather than beside it. The same 1-based number the slider's own
                  * `aria-valuetext` reads out, so the two never disagree — and `aria-hidden`
                  * because that label already says it in full.
                  */}
                <span className="speed-step" aria-hidden>
                  {song.scrollSpeed + 1}
                </span>
              </button>

              {panel === 'speed' && (
                <div className="speed-popover">
                  <IconHare size={16} />
                  <span className="speed-vertical-wrap">
                    <input
                      type="range"
                      className="speed-range zoom-range speed-range-vertical"
                      min={0}
                      max={lastSpeed}
                      step={1}
                      value={song.scrollSpeed}
                      onChange={(event) => setScrollSpeed(Number(event.target.value))}
                      style={{ '--fill': `${(song.scrollSpeed / lastSpeed) * 100}%` } as React.CSSProperties}
                      aria-label="Scroll speed"
                      aria-valuetext={`${song.scrollSpeed + 1} of ${SCROLL_SPEEDS.length}`}
                    />
                  </span>
                  <IconTurtle size={16} />
                </div>
              )}
            </div>

            <button
              type="button"
              className={
                panel === 'settings' ? 'control-button control-open is-on' : 'control-button control-open'
              }
              onClick={() => setPanel((current) => (current === 'settings' ? null : 'settings'))}
              aria-expanded={panel === 'settings'}
              /*
               * The unsaved change is named here rather than on the dot. A live region
               * nested inside a button is not something a reader reaching this control
               * would be told about — the button's own name is — so the dot is left as
               * the visual half and the words join the label.
               */
              aria-label={
                (panel === 'settings' ? 'Close chords and text' : 'Chords and text') +
                (pending > 0 ? ', unsaved change' : '')
              }
            >
              <IconSliders size={20} />

              {/* A queued change is visible, so nothing is ever lost in silence. */}
              {pending > 0 && <span className="pending-dot" title="Unsaved" aria-hidden />}
            </button>
          </div>
        </div>

        {steps !== null && <PrevNext steps={steps} locked={stepsLocked} onStepTo={onStepTo} />}
      </div>
    </nav>
  )
}

/**
 * Steps to the previous or next song in the songbook, and where this one sits among
 * them — moved down from the header so it sits with the rest of what a hand reaches
 * for mid-song rather than at the top of the page, out of reach on a stand.
 *
 * `steps.previous`/`.next` are slugs, not hrefs: what stepping to one *means* differs
 * by who is reading. A signed-in reader gets a real navigation, `/songs/‹slug›`, built
 * here rather than by every caller, since this is the one place that already knows the
 * route a song reads at. A follower has no such page — `FollowSession` shows a song by
 * swapping state in place — so it hands in `onStepTo` instead, and a slug is handed
 * back rather than a page changing under it.
 *
 * `locked` renders both arrows the same inert way `slug === null` already does, whether
 * or not there is actually somewhere to step to — while still leaving a follower able to
 * see where the leader is in the songbook. That last part used to be this capsule's own
 * count, and on a phone it no longer is: the count is hidden below `sm`, where the mock
 * gives this row to two labelled buttons instead. So both screens that render a bar now
 * carry the position in their header — `SongReader` always did («Prima parte · 3 of 12»),
 * and `FollowedSong` gained it when the count left the bar rather than after somebody
 * noticed it missing.
 */
function PrevNext({
  steps,
  locked,
  onStepTo,
}: {
  steps: NavSteps
  locked: boolean
  onStepTo?: (slug: string) => void
}) {
  return (
    <div className="control-nav">
      <Step
        slug={steps.previous}
        label="Previous song"
        direction="previous"
        locked={locked}
        onStepTo={onStepTo}
      />
      <span className="control-nav-count">
        {steps.position}/{steps.total}
      </span>
      <Step slug={steps.next} label="Next song" direction="next" locked={locked} onStepTo={onStepTo} />
    </div>
  )
}

function Step({
  slug,
  label,
  direction,
  locked,
  onStepTo,
}: {
  slug: string | null
  label: string
  direction: 'previous' | 'next'
  locked: boolean
  onStepTo?: (slug: string) => void
}) {
  /*
   * The chevron on its own from `sm` up, and the chevron with its name on a phone,
   * where this is a button filling half the bar's top row rather than one of three
   * things in a capsule (`.control-step`). Written on the leading side for Previous
   * and the trailing side for Next, so each arrow points away from the label the way
   * the mock draws them; `.control-step-label` hides the words on a wider screen.
   */
  const face =
    direction === 'previous' ? (
      <>
        <IconChevronLeft size={22} />
        <span className="control-step-label">Previous</span>
      </>
    ) : (
      <>
        <span className="control-step-label">Next</span>
        <IconChevronRight size={22} />
      </>
    )

  const classes = `control-button control-step is-${direction}`

  // Nowhere to go, said to nobody: an arrow that holds its place needs no name.
  if (slug === null) {
    return (
      <span className={`${classes} is-off`} aria-hidden>
        {face}
      </span>
    )
  }

  /*
   * There genuinely is a song in this direction, but a follower may not step to it
   * while the broadcast is still choosing for them — unlike the `null` case above,
   * this is worth a name: the position in the header ("3 of 12") says where the leader
   * is, and a reason for why the arrows beside it do nothing is the difference between
   * that reading as broken and reading as expected.
   */
  if (locked) {
    return (
      <span
        className={`${classes} is-off`}
        title="Following the leader"
        aria-label={`${label}, following the leader`}
      >
        {face}
      </span>
    )
  }

  if (onStepTo !== undefined) {
    return (
      <button type="button" className={classes} title={label} aria-label={label} onClick={() => onStepTo(slug)}>
        {face}
      </button>
    )
  }

  return (
    <Link href={`/songs/${slug}`} className={classes} title={label} aria-label={label}>
      {face}
    </Link>
  )
}

/** The Strum Together toggle: a quiet icon while nothing is running, a filled pill
 *  naming the follower count once something is. Tapping either opens the same
 *  `StrumTogetherPanel` the hamburger menu's own entry does. */
function StrumToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { broadcast, audience } = useStrumTogether()
  const live = broadcast !== null && broadcast !== undefined

  if (!live) {
    return (
      <button
        type="button"
        className="control-button control-strum"
        onClick={onToggle}
        aria-expanded={open}
        aria-label="Strum Together"
      >
        <IconBroadcast size={19} />
      </button>
    )
  }

  return (
    <button
      type="button"
      className="control-strum is-live"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={
        audience === null
          ? 'Strum Together is on'
          : `Strum Together is on, ${audience.following} following`
      }
    >
      <IconBroadcast size={19} />
      {audience !== null && <span className="control-strum-count">{audience.following}</span>}
    </button>
  )
}

/** The bare signed number the Key badge shows: `formatSemitones` without the word. */
function semitoneBadge(semitones: number): string {
  if (semitones === 0) return '0'
  return semitones > 0 ? `+${semitones}` : `−${Math.abs(semitones)}`
}

/**
 * What the song is read in, rather than how it is read: the key it has been moved
 * to, whether a capo is doing part of that work, whether a chord shows as its name
 * or its shape, and how big the words are.
 *
 * Notation — the alphabet the chords are named in — used to be listed here too,
 * between Capo and Show. It has moved to Settings, next to the instrument and the
 * theme, where the other choices a reader carries across every song already live.
 *
 * Redesigned: every row here now reads as a label line (the name, a badge for
 * whatever it is set to, and — for Key — the key that comes out of it) followed by its
 * own full-width control, rather than a label squeezed to one side of it. Capo picks a
 * fret directly now instead of stepping to it one fret at a time, which is what freed
 * the row to grow past `MAX_CAPO` frets without ever needing a way to reach the ones a
 * fixed few buttons could not show. The "Chords"/"Text" group headings went with that
 * change — see the note on the first row for why.
 */
function ReadingPanel({
  semitones,
  semitonesLocked,
  capo,
  suggestion,
  written,
  chordDisplay,
  instrument,
  zoomStep,
  broadcasting,
  setSemitones,
  setCapo,
  setChordDisplay,
  setInstrument,
  setZoomStep,
}: {
  semitones: number
  /** True for the guest side's reuse of this panel; always false in the ordinary flow. */
  semitonesLocked: boolean
  capo: number
  suggestion: CapoOption | null
  /** The song's own key, estimated from its chords — `null` only while the panel is
   *  closed, when nothing needs it. */
  written: Key | null
  chordDisplay: ChordDisplay
  instrument: Instrument
  zoomStep: number
  /** True only while this reader has a live broadcast of their own, so the Key row can
   *  say that moving it moves every following screen too. Never true on the guest side,
   *  where a follower has no broadcast to lead. */
  broadcasting: boolean
  setSemitones: (value: number) => void
  setCapo: (value: number) => void
  setChordDisplay: (value: ChordDisplay) => void
  setInstrument: (value: Instrument) => void
  setZoomStep: (value: number) => void
}) {
  const reading = written !== null ? transposeKey(written, semitones) : null
  const lastZoom = ZOOM_STEPS.length - 1

  /*
   * Which page of frets the reader last paged to — a *request*, not the answer:
   * `fretWindowStart` gets the last word, because the fret the capo is on has to be on
   * screen whatever page was asked for. Holding the request rather than the resolved
   * value is what lets the capo pull the window without that pull becoming the new
   * request and sticking after the capo moves away again.
   */
  const [fretPage, setFretPage] = useState(0)
  const fretStart = fretWindowStart(fretPage, capo)
  const pagesForward = fretStart + FRET_PAGE <= MAX_CAPO
  const canPage = pagesForward || fretStart > 0

  /*
   * The ukulele's own gate — this is the half that refuses the *tap*. What the panel draws
   * as on is already clamped upstream by `PrefsProvider`, which is what answers for a row
   * that was written while the ukulele was still included; see `PlanLimits.ukulele` for the
   * three halves and why none of them is sufficient alone.
   *
   * Read off `plan` rather than asked of the server, because this panel opens while a
   * musician is on stage and a round trip per tap is not something to put in that path. It
   * fails open in the two cases where `plan` is null and both are right: the answer has not
   * arrived yet, and enforcement is switched off entirely (`RoleContextValue.plan`'s own
   * comment). A guest following a broadcast lands on the second — they have no account here,
   * so there is no plan to refuse them with and nobody to sell a plan to.
   */
  const { plan } = useRole()
  const ukuleleRefused = plan !== null && !PLANS[plan].ukulele
  const [paywallOpen, setPaywallOpen] = useState(false)

  return (
    <div className="control-panel">
      {/*
        * No "Chords"/"Text" group headings any more. Each row already names itself —
        * Key, Capo, Chords as, Text size — and with only four of them the headings
        * were labelling groups of one and two.
        */}
      <div className="control-row">
        <span className="control-name-label">Key</span>
        <span className="value-badge" title={formatSemitones(semitones)}>
          {semitoneBadge(semitones)}
        </span>
        {reading !== null && <span className="control-hint-text">reading in {reading.name}</span>}
      </div>

      <div className="value-buttons mt-2.5">
        <button
          type="button"
          className="value-button"
          onClick={() => setSemitones(semitones - 1)}
          disabled={semitonesLocked}
          aria-label="Lower by a semitone"
        >
          −1
        </button>

        <button
          type="button"
          className="value-button is-accent"
          onClick={() => setSemitones(0)}
          disabled={semitonesLocked || semitones === 0}
          aria-label="Return to the written key"
          title={semitonesLocked || semitones === 0 ? undefined : 'Return to the written key'}
        >
          <IconUndo size={14} />
          reset
        </button>

        <button
          type="button"
          className="value-button"
          onClick={() => setSemitones(semitones + 1)}
          disabled={semitonesLocked}
          aria-label="Raise by a semitone"
        >
          +1
        </button>
      </div>

      {/*
        * The one consequence of these three buttons that is not visible on this
        * screen: while a broadcast is live, moving the key here moves it on every
        * screen following it. Said only then — with nobody following, there is
        * nothing extra happening to warn anyone about.
        */}
      {broadcasting && (
        <p className="broadcast-hint">
          <span className="broadcast-hint-dot" aria-hidden />
          The followers&apos; screens change key with you.
        </p>
      )}

      {/*
        * Said only for the guest side's reuse of this panel — never here, since
        * `semitonesLocked` is always false in the ordinary reading flow. The row
        * above still shows the key; what a guest cannot do is move it.
        */}
      {semitonesLocked && (
        <div className="control-hint">
          <span>Following the leader&apos;s key.</span>
        </div>
      )}

      <div className="control-row mt-[1.125rem]">
        <span className="control-name-label">Capo</span>
        <span className="value-badge">{capo === 0 ? 'none' : `fret ${capo}`}</span>
      </div>

      {/*
        * Six frets and an arrow, rather than every fret squeezed into one row. Seven
        * cells across the panel's 19rem of inner width come out 40px wide; all eight
        * frets in one row would be 34px, narrow enough that the wrong fret is the one
        * a thumb finds with a guitar in the other hand. The arrow pages the run along
        * and turns into a `‹` once there is nothing further to reveal, so the row is
        * always exactly seven cells and never changes width — see `fretWindowStart` for
        * the one rule here, that the fret the capo is on is always among the six.
        */}
      <div className="fret-row mt-2.5" role="group" aria-label="Capo fret">
        {Array.from({ length: Math.min(FRET_PAGE, MAX_CAPO + 1 - fretStart) }, (_, index) => {
          const fret = fretStart + index
          const classes = ['fret-button']
          if (fret === 0) classes.push('is-none')
          if (fret === capo) classes.push('is-on')

          return (
            <button
              key={fret}
              type="button"
              className={classes.join(' ')}
              onClick={() => setCapo(fret)}
              aria-pressed={fret === capo}
              aria-label={fret === 0 ? 'No capo' : `Capo on fret ${fret}`}
            >
              {fret}
            </button>
          )
        })}

        {canPage && (
          <button
            type="button"
            className="fret-button is-page"
            onClick={() => setFretPage(pagesForward ? fretStart + FRET_PAGE : fretStart - FRET_PAGE)}
            aria-label={pagesForward ? 'Show higher frets' : 'Show lower frets'}
            title={pagesForward ? 'Higher frets' : 'Lower frets'}
          >
            {pagesForward ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
          </button>
        )}
      </div>

      {/*
        * What a capo would do for the hands, when it would do something.
        *
        * A sentence and a button rather than an automatic move: the capo is the one
        * thing here that changes what the hands do, and the reader is the one holding
        * them. It disappears as soon as it has nothing left to offer — but the slot
        * around it does not, so stepping through capo positions never shifts the two
        * rows below; see `.capo-hint-slot`'s own comment in globals.css.
        */}
      <div className="capo-hint-slot">
        {suggestion !== null && (
          <div className="capo-suggestion">
            <span className="capo-suggestion-text">
              Easier at <strong>fret {suggestion.fret}</strong> — {suggestion.easy} of{' '}
              {suggestion.total} chords open
            </span>
            <button
              type="button"
              className="capo-suggestion-action"
              onClick={() => setCapo(suggestion.fret)}
            >
              Move capo
            </button>
          </div>
        )}
      </div>

      <div className="control-divider" />

      {/*
        * Two controls side by side, and the pairing is the point rather than a way to save a
        * row: Shape is what puts a diagram on the sheet at all, and Instrument is which
        * instrument that diagram is for. Asked here, next to each other, because the second
        * question only means anything once the first has been answered — it used to sit in the
        * account menu's Settings with the notation and the theme, on the reasoning that a
        * reader owns one instrument and answers for it once. True, and it is still answered
        * once (this writes the same account-wide preference, not a per-song one); what was
        * wrong is that it was answered two panels away from the only place its effect is
        * visible.
        *
        * `.control-pair` wraps rather than squeezing — see its own rule in globals.css: on the
        * narrowest phones the panel is not wide enough for two segments and they stack, which
        * is better than "Ukulele" spilling out of its button.
        */}
      <div className="control-pair">
        <div>
          <span className="control-name-label">Chords as</span>

          {/* `w-full` + `flex-1`, the same idiom `ThemePicker`/`NotationPicker` already use
              for a segment that fills its container rather than hugging its labels. */}
          <span className="segment mt-2 w-full" role="group" aria-label="Chord display">
            <button
              type="button"
              className={chordDisplay === 'name' ? 'segment-button is-on flex-1' : 'segment-button flex-1'}
              onClick={() => setChordDisplay('name')}
              aria-pressed={chordDisplay === 'name'}
            >
              Name
            </button>
            <button
              type="button"
              className={chordDisplay === 'shape' ? 'segment-button is-on flex-1' : 'segment-button flex-1'}
              onClick={() => setChordDisplay('shape')}
              aria-pressed={chordDisplay === 'shape'}
            >
              Shape
            </button>
          </span>
        </div>

        <div>
          <span className="control-name-label">Instrument</span>

          <span className="segment mt-2 w-full" role="group" aria-label="Instrument for chord shapes">
            {INSTRUMENTS.map((entry) => {
              /*
               * Refused, not hidden and not disabled. A disabled button says "not for you" and
               * stops there; this one still takes the tap and answers it with the dialog that
               * names the feature and offers `/pricing` — the same shape every other
               * plan-refusal in the app takes, and the only one that tells a reader what the
               * ukulele would cost them.
               */
              const refused = entry !== 'guitar' && ukuleleRefused

              return (
                <button
                  key={entry}
                  type="button"
                  className={entry === instrument ? 'segment-button is-on flex-1' : 'segment-button flex-1'}
                  aria-pressed={entry === instrument}
                  onClick={() => (refused ? setPaywallOpen(true) : setInstrument(entry))}
                >
                  <span className="inline-flex items-center gap-1">
                    {INSTRUMENT_LABEL[entry]}
                    {refused && <IconLock size={11} />}
                  </span>
                </button>
              )
            })}
          </span>
        </div>
      </div>

      {paywallOpen && (
        <FeaturePaywallModal
          feature={PAYWALL_FEATURES.ukulele.label}
          plan={PAYWALL_FEATURES.ukulele.minPlan}
          onDismiss={() => setPaywallOpen(false)}
        />
      )}

      {/* No second divider: the pair above and "Text size" are one step apart, not two
          groups, so the space between them does the separating. */}
      <div className="mt-4 flex items-baseline justify-between">
        <span className="control-name-label">Text size</span>
        <span className="control-hint-text">{ZOOM_STEPS[zoomStep]} px</span>
      </div>

      <span className="zoom-row mt-2.5">
        <span className="zoom-label" aria-hidden>
          A
        </span>
        <input
          type="range"
          className="speed-range zoom-range"
          min={0}
          max={lastZoom}
          step={1}
          value={zoomStep}
          onChange={(event) => setZoomStep(Number(event.target.value))}
          style={{ '--fill': `${(zoomStep / lastZoom) * 100}%` } as React.CSSProperties}
          aria-label="Text size"
          aria-valuetext={`${ZOOM_STEPS[zoomStep]} px`}
        />
        <span className="zoom-label is-large" aria-hidden>
          A
        </span>
      </span>
    </div>
  )
}
