'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { PlanUpgradeModal, type PlanNotice } from '@/components/PlanUpgradeModal'
import { usePrefs } from '@/components/PrefsProvider'
import { useSingAlong } from '@/components/SingAlongProvider'
import {
  IconBroadcast,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconHare,
  IconLink,
  IconPause,
  IconPlay,
  IconSliders,
  IconTurtle,
  IconUndo,
} from '@/components/icons'
import { type CapoOption, MAX_CAPO, suggestCapo } from '@/lib/music/capo'
import { estimateKey } from '@/lib/music/key'
import { C_MAJOR, type Key, transposeKey } from '@/lib/music/notes'
import { type ChordDisplay, SCROLL_SPEEDS, ZOOM_STEPS, clampSemitones } from '@/lib/prefs/types'
import { audienceSentence } from '@/lib/plans/types'
import { followUrl } from '@/lib/singAlong/link'
import { broadcastPlay, broadcastTranspose } from '@/lib/singAlong/session'
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
 * two: Sing Together now has a quick toggle here rather than living only in the header
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
}: {
  /**
   * Which song this bar belongs to — needed only to tell Sing Together which song
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
   * False only for Sing Together's guest view. `broadcastPlay`/`broadcastTranspose`
   * would otherwise fire under whichever real account happens to be signed into the
   * browser showing the link — not the guest reading it, since a guest has none — and
   * silently retarget that account's own broadcast. A guest's own copy of this bar
   * must never be able to call them, session or not; that is a categorical property of
   * where the bar is mounted, not something to detect from whether a session exists.
   * The same flag also hides the Sing Together toggle itself, for the same reason: a
   * guest must never be offered a way to start a broadcast of their own.
   */
  broadcastEnabled?: boolean
  /** This song's place in the songbook it was opened from, for the prev/next capsule.
   *  `null` when there is none to show — a guest's reading page, or a song with no
   *  songbook of its own. */
  steps?: NavSteps | null
}) {
  const {
    global,
    song,
    pending,
    setZoomStep,
    setChordDisplay,
    setSemitones,
    setScrollSpeed,
    setCapo,
  } = usePrefs()
  const { running, toggle } = useAutoScroll(song.scrollSpeed)
  const [panel, setPanel] = useState<Panel>(null)

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
      {/* Catches the tap that means "never mind". Inside the bar, so it does not
          count as the manual gesture that pauses the scroll. */}
      {panel !== null && <div className="menu-overlay" onClick={() => setPanel(null)} aria-hidden />}

      <div className={steps === null ? 'control-strip' : 'control-strip has-nav'}>
        <div className="control-dock">
          {panel === 'settings' && (
            <ReadingPanel
              semitones={song.semitones}
              semitonesLocked={semitonesLocked}
              capo={song.capo}
              suggestion={suggestion}
              written={written}
              chordDisplay={global.chordDisplay}
              zoomStep={global.zoomStep}
              setSemitones={setSemitonesAndBroadcast}
              setCapo={setCapo}
              setChordDisplay={setChordDisplay}
              setZoomStep={setZoomStep}
            />
          )}

          {broadcastEnabled && panel === 'sing' && (
            <SingPanel close={() => setPanel(null)} />
          )}

          {broadcastEnabled && <SingToggle open={panel === 'sing'} onToggle={() => setPanel((current) => (current === 'sing' ? null : 'sing'))} />}

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
            className="control-button control-open"
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

        {steps !== null && <PrevNext steps={steps} />}
      </div>
    </nav>
  )
}

/** Steps to the previous or next song in the songbook, and where this one sits among
 *  them — moved down from the header so it sits with the rest of what a hand
 *  reaches for mid-song rather than at the top of the page, out of reach on a stand. */
function PrevNext({ steps }: { steps: NavSteps }) {
  return (
    <div className="control-nav">
      <Step href={steps.previous} label="Previous song" direction="previous" />
      <span className="control-nav-count">
        {steps.position}/{steps.total}
      </span>
      <Step href={steps.next} label="Next song" direction="next" />
    </div>
  )
}

function Step({
  href,
  label,
  direction,
}: {
  href: string | null
  label: string
  direction: 'previous' | 'next'
}) {
  const icon = direction === 'previous' ? <IconChevronLeft size={22} /> : <IconChevronRight size={22} />

  if (href === null) {
    return (
      <span className="control-button is-off" aria-hidden>
        {icon}
      </span>
    )
  }

  return (
    <Link href={href} className="control-button" title={label} aria-label={label}>
      {icon}
    </Link>
  )
}

/** The Sing Together toggle: a quiet icon while nothing is running, a filled pill
 *  naming the follower count once something is. Tapping either opens `SingPanel`. */
function SingToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { broadcast, audience } = useSingAlong()
  const live = broadcast !== null && broadcast !== undefined

  if (!live) {
    return (
      <button
        type="button"
        className="control-button control-sing"
        onClick={onToggle}
        aria-expanded={open}
        aria-label="Sing Together"
      >
        <IconBroadcast size={19} />
      </button>
    )
  }

  return (
    <button
      type="button"
      className="control-sing is-live"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={
        audience === null
          ? 'Sing Together is on'
          : `Sing Together is on, ${audience.following} following`
      }
    >
      <IconBroadcast size={19} />
      {audience !== null && <span className="control-sing-count">{audience.following}</span>}
    </button>
  )
}

/**
 * The condensed Sing Together screen, anchored above the bar's own toggle.
 *
 * A smaller version of the menu's own Sing Together view, not a second copy of it: no
 * QR here (drawing one is not a cost worth paying for a panel this size, or twice for
 * one broadcast), no numbered steps — a leader who has reached for this button mid-song
 * already knows what starting one does. What survives is the one thing this location
 * earns over the menu's: it opens without leaving the song.
 */
function SingPanel({ close }: { close: () => void }) {
  const { broadcast, askFailed, audience, busy, checkBroadcast, start, stop } = useSingAlong()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [planNotice, setPlanNotice] = useState<PlanNotice | null>(null)

  const doStart = async () => {
    setError(null)
    const result = await start()
    if (result.ok) return

    if (result.reason === 'plan-required') {
      setPlanNotice({ reason: 'plan-required', feature: 'Sing Together' })
      close()
    } else if (result.reason === 'no-session') {
      setError('Session expired. Reload the page and sign in again.')
    } else {
      setError("Couldn't start. Try again.")
    }
  }

  const doStop = async () => {
    setError(null)
    const result = await stop()
    if (!result.ok) setError("Couldn't stop. Try again.")
  }

  const copyLink = async () => {
    if (broadcast == null) return
    try {
      await navigator.clipboard.writeText(followUrl(broadcast.token))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* Clipboard access can be refused; the link is still there as selectable text. */
    }
  }

  return (
    <div className="sing-panel">
      {broadcast === undefined && <p className="text-sm text-muted">One moment…</p>}

      {broadcast === null && askFailed && (
        <>
          <p className="notice notice-error" role="alert">
            Couldn&apos;t check whether you already have one running.
          </p>
          <button type="button" className="btn btn-sm mt-2 w-full" onClick={checkBroadcast}>
            Try again
          </button>
        </>
      )}

      {broadcast === null && !askFailed && (
        <>
          <p className="text-sm text-muted">
            Share a link and whoever opens it follows this song, live, in your key — no
            account needed on their side.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm mt-3 w-full"
            onClick={() => void doStart()}
            disabled={busy}
          >
            <IconBroadcast size={15} />
            Start broadcasting
          </button>
        </>
      )}

      {broadcast !== null && broadcast !== undefined && (
        <>
          <p className="select-all break-all text-xs text-muted">{followUrl(broadcast.token)}</p>
          {audience !== null && (
            <p className="mt-1.5 text-xs text-muted">{audienceSentence(audience.following, audience.devices)}</p>
          )}
          <div className="mt-2.5 flex gap-1.5">
            <button type="button" className="btn btn-sm flex-1" onClick={() => void copyLink()}>
              {copied ? <IconCheck size={14} /> : <IconLink size={14} />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button type="button" className="btn btn-ink btn-sm flex-1" onClick={() => void doStop()} disabled={busy}>
              Stop
            </button>
          </div>
        </>
      )}

      {error !== null && (
        <p className="notice notice-error mt-2" role="alert">
          {error}
        </p>
      )}

      {planNotice !== null && <PlanUpgradeModal notice={planNotice} onClose={() => setPlanNotice(null)} />}
    </div>
  )
}

/**
 * How far the song has been moved from the key it was written in, in full — used as
 * the badge's accessible name, since the badge itself shows only the bare signed number.
 */
function formatSemitones(semitones: number): string {
  if (semitones === 0) return '0 semitones'
  const sign = semitones > 0 ? '+' : '−'
  const size = Math.abs(semitones)
  return `${sign}${size} ${size === 1 ? 'semitone' : 'semitones'}`
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
 * Grouped by what they act on — the chords, then the text — because "chord
 * display" and "size" are both settings of the same sheet and nothing else on the
 * screen says which part of it each one changes.
 *
 * Redesigned: every row here now reads as a label line (the name, a badge for
 * whatever it is set to, and — for Key — the key that comes out of it) followed by its
 * own full-width control, rather than a label squeezed to one side of it. Capo picks a
 * fret directly now instead of stepping to it one fret at a time, which is what freed
 * the row to grow past `MAX_CAPO` frets without ever needing a way to reach the ones a
 * fixed few buttons could not show.
 */
function ReadingPanel({
  semitones,
  semitonesLocked,
  capo,
  suggestion,
  written,
  chordDisplay,
  zoomStep,
  setSemitones,
  setCapo,
  setChordDisplay,
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
  zoomStep: number
  setSemitones: (value: number) => void
  setCapo: (value: number) => void
  setChordDisplay: (value: ChordDisplay) => void
  setZoomStep: (value: number) => void
}) {
  const reading = written !== null ? transposeKey(written, semitones) : null
  const lastZoom = ZOOM_STEPS.length - 1

  return (
    <div className="control-panel">
      <span className="group-label">Chords</span>

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
        * Said only for the guest side's reuse of this panel — never here, since
        * `semitonesLocked` is always false in the ordinary reading flow. The row
        * above still shows the key; what a guest cannot do is move it.
        */}
      {semitonesLocked && (
        <div className="control-hint">
          <span>Following the leader&apos;s key.</span>
        </div>
      )}

      <div className="control-row mt-4">
        <span className="control-name-label">Capo</span>
        <span className="value-badge">{capo === 0 ? 'none' : `fret ${capo}`}</span>
      </div>

      <div className="fret-row mt-2.5" role="group" aria-label="Capo fret">
        {Array.from({ length: MAX_CAPO + 1 }, (_, fret) => (
          <button
            key={fret}
            type="button"
            className={fret === capo ? 'fret-button is-on' : 'fret-button'}
            onClick={() => setCapo(fret)}
            aria-pressed={fret === capo}
            aria-label={fret === 0 ? 'No capo' : `Capo on fret ${fret}`}
          >
            {fret}
          </button>
        ))}
      </div>

      {/*
        * What a capo would do for the hands, when it would do something.
        *
        * A sentence and a button rather than an automatic move: the capo is the one
        * thing here that changes what the hands do, and the reader is the one holding
        * them. It disappears as soon as it has nothing left to offer — but the slot
        * around it does not, so stepping through capo positions never shifts Show
        * and Text below; see `.capo-hint-slot`'s own comment in globals.css.
        */}
      <div className="capo-hint-slot">
        {suggestion !== null && (
          <div className="control-hint">
            <span>
              Easier at <strong>fret {suggestion.fret}</strong> — {suggestion.easy} of{' '}
              {suggestion.total} chords open
            </span>
            <button type="button" className="btn btn-sm" onClick={() => setCapo(suggestion.fret)}>
              Move capo
            </button>
          </div>
        )}
      </div>

      <div className="control-divider" />

      <span className="control-name-label">Chords as</span>

      <span className="segment mt-2.5" role="group" aria-label="Chord display">
        <button
          type="button"
          className={chordDisplay === 'name' ? 'segment-button is-on' : 'segment-button'}
          onClick={() => setChordDisplay('name')}
          aria-pressed={chordDisplay === 'name'}
        >
          Name
        </button>
        <button
          type="button"
          className={chordDisplay === 'shape' ? 'segment-button is-on' : 'segment-button'}
          onClick={() => setChordDisplay('shape')}
          aria-pressed={chordDisplay === 'shape'}
        >
          Shape
        </button>
      </span>

      <div className="control-divider" />

      <span className="group-label">Text</span>

      <div className="control-row">
        <span className="control-name-label">Size</span>
        <span className="flex-1" />
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
