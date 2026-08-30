'use client'

import { useEffect, useMemo, useState } from 'react'

import { usePrefs } from '@/components/PrefsProvider'
import { useStrumTogether } from '@/components/StrumTogetherProvider'
import { IconChevronDown, IconChevronLeft, IconChevronRight } from '@/components/icons'
import { FRET_PAGE, MAX_CAPO, formatSemitones, fretWindowStart, suggestCapo } from '@/lib/music/capo'
import {
  CHORD_DISPLAYS,
  CHORD_DISPLAY_HINT,
  CHORD_DISPLAY_LABEL,
  type ChordDisplay,
  clampSemitones,
} from '@/lib/prefs/types'
import { broadcastTranspose } from '@/lib/strumTogether/session'

/** Which chip's menu is open, if any — at most one, so opening a second closes the first. */
type Menu = 'capo' | 'chords' | null

/**
 * Everything about *this reading of this song*, on the song itself: the key, the capo,
 * which way accidentals are written, and how much of a chord the sheet draws.
 *
 * They used to live in the reading panel behind the bar's own button, on the rule that a
 * control set once before the song starts stays behind a button and one tapped mid-song
 * stays out. The rule was sound and the sorting was wrong: all four of these *say
 * something* as well as set something — what key you are in, whether there is a capo on
 * — and a control whose value is worth reading cannot spend its life shut. Behind the
 * button the answer was invisible, which is why a separate line under the title had to
 * exist to repeat capo and transposition back in words. That line is gone with this row;
 * the chips are the note.
 *
 * What stays in the panel is what is genuinely set and forgotten: the instrument and the
 * text size.
 *
 * They wrap rather than scroll. At 402px the first three fit one line and Chords drops to
 * the second, which is what the board draws; on a tablet all four sit on one.
 */
export function SongControls({
  songSlug,
  chords,
  semitonesLocked = false,
  broadcastEnabled = true,
}: {
  /** Which song this is, so a key change can tell the followers which song moved. */
  songSlug: string
  /**
   * Every chord token of the song, for the capo suggestion. Empty is a fine answer — it
   * then has nothing to suggest.
   */
  chords: string[]
  /**
   * True only on Strum Together's guest screen: a follower reads the leader's key rather
   * than choosing their own, so the two steppers are disabled and the chip says why.
   * The chip still shows the value — what a guest cannot do is move it.
   */
  semitonesLocked?: boolean
  /**
   * False only on that same guest screen. `broadcastTranspose` would otherwise fire under
   * whichever real account happens to be signed into the browser showing the link and
   * silently retarget that account's own broadcast — see `ControlBar`'s own prop of this
   * name, which this mirrors for exactly the same reason.
   */
  broadcastEnabled?: boolean
}) {
  const { global, song, setSemitones, setCapo, setAccidentals, setChordDisplay } = usePrefs()
  const [menu, setMenu] = useState<Menu>(null)
  const { broadcast } = useStrumTogether()

  const broadcasting = broadcastEnabled && broadcast !== null && broadcast !== undefined

  /*
   * Clamped here rather than only inside `setSemitones`, and the difference is what the
   * followers see: the local value would be clamped either way, but an unclamped number
   * sent to `broadcastTranspose` would put every following screen a whole octave from
   * this one — `clampSemitones` wraps at the octave, so +7 becomes −5 locally and stays
   * +7 on the wire.
   */
  const move = (value: number) => {
    const clamped = clampSemitones(value)
    setSemitones(clamped)
    if (broadcastEnabled) void broadcastTranspose(songSlug, clamped).catch(() => {})
  }

  useEffect(() => {
    if (menu === null) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  /*
   * Only while the capo menu is open, and the gate is not a micro-optimisation: on a
   * ukulele a suggestion is *searched* rather than looked up — about thirteen thousand
   * fingerings per chord, cached after the first time, but the first time is 56 ms of one
   * thread. Paying that when a menu is opened is fine; paying it on every reading page
   * load, for something nobody has asked to see, is not. This row renders with the song
   * itself now rather than with a panel, so without the gate that cost would land on
   * every song a reader opens.
   */
  const suggestion = useMemo(
    () =>
      menu === 'capo' ? suggestCapo(chords, song.semitones, song.capo, global.instrument) : null,
    [menu, chords, song.semitones, song.capo, global.instrument],
  )

  return (
    <div className="song-chips">
      <span className="song-chip is-group">
        <button
          type="button"
          className="song-chip-step"
          onClick={() => move(song.semitones - 1)}
          disabled={semitonesLocked}
          title="Transpose down"
          aria-label="Lower by a semitone"
        >
          −
        </button>

        {/*
          * The value, and the way back to the written key in the same press — the panel
          * spent a third of a row on a «reset» button, and here the number that says how
          * far from home you are is the obvious thing to press to go home. Its name keeps
          * the words that are visible in it, so what is read out and what is drawn are
          * the same control.
          */}
        <button
          type="button"
          className="song-chip-value"
          onClick={() => move(0)}
          disabled={semitonesLocked || song.semitones === 0}
          title={
            semitonesLocked || song.semitones === 0
              ? formatSemitones(song.semitones)
              : 'Return to the written key'
          }
          aria-label={
            song.semitones === 0
              ? `Key, ${formatSemitones(song.semitones)}`
              : `Key ${semitoneBadge(song.semitones)}, return to the written key`
          }
        >
          Key <span className="song-chip-badge">{semitoneBadge(song.semitones)}</span>
        </button>

        <button
          type="button"
          className="song-chip-step"
          onClick={() => move(song.semitones + 1)}
          disabled={semitonesLocked}
          title="Transpose up"
          aria-label="Raise by a semitone"
        >
          +
        </button>
      </span>

      <button
        type="button"
        className={menu === 'capo' ? 'song-chip is-menu is-open' : 'song-chip is-menu'}
        onClick={() => setMenu((current) => (current === 'capo' ? null : 'capo'))}
        aria-expanded={menu === 'capo'}
        title="Choose the capo fret"
      >
        Capo
        <span className="song-chip-badge is-solid">{song.capo}</span>
        <IconChevronDown size={11} />
      </button>

      {/*
        * Sharps or flats, and nothing in between. What the key the song landed in would
        * have decided is still the app's answer everywhere nobody has said otherwise —
        * this is the saying, and there is no third segment for «let the key decide»
        * because the pair is what the board draws and a state with neither lit is a
        * control that looks broken.
        */}
      <span className="song-chip is-group" role="group" aria-label="How accidentals are written">
        <button
          type="button"
          className={
            global.accidentals === 'sharp' ? 'song-chip-toggle is-on' : 'song-chip-toggle'
          }
          onClick={() => setAccidentals('sharp')}
          aria-pressed={global.accidentals === 'sharp'}
          title="Write accidentals as sharps"
          aria-label="Sharps"
        >
          ♯
        </button>
        <button
          type="button"
          className={global.accidentals === 'flat' ? 'song-chip-toggle is-on' : 'song-chip-toggle'}
          onClick={() => setAccidentals('flat')}
          aria-pressed={global.accidentals === 'flat'}
          title="Write accidentals as flats"
          aria-label="Flats"
        >
          ♭
        </button>
      </span>

      <button
        type="button"
        className={menu === 'chords' ? 'song-chip is-menu is-open' : 'song-chip is-menu'}
        onClick={() => setMenu((current) => (current === 'chords' ? null : 'chords'))}
        aria-expanded={menu === 'chords'}
        title="How chords are shown"
      >
        Chords
        <span className="song-chip-word">{CHORD_DISPLAY_LABEL[global.chordDisplay]}</span>
        <IconChevronDown size={11} />
      </button>

      {/*
        * The one consequence of the two steppers that is not visible on this screen:
        * while a broadcast is live, moving the key moves it on every screen following it.
        * Said only then — with nobody following there is nothing extra happening to warn
        * anyone about.
        */}
      {broadcasting && (
        <p className="broadcast-hint song-chips-note">
          <span className="broadcast-hint-dot" aria-hidden />
          The followers&apos; screens change key with you.
        </p>
      )}

      {/* Said only on the guest screen; `semitonesLocked` is always false in the ordinary
          reading flow. The chip above still shows the key — what a guest cannot do is move it. */}
      {semitonesLocked && <p className="song-chips-note">Following the leader&apos;s key.</p>}

      {/*
        * Both menus hang off the row and not off the chip that opened them. A menu
        * anchored to the Chords chip — which sits well into the line, and on the second
        * line at 402px — runs off the right edge of a phone; anchored here it can only
        * ever be as wide as the words above it. The same reasoning `.control-panel`
        * already follows for the reading panel, learned the same way.
        */}
      {menu !== null && <div className="menu-overlay" onClick={() => setMenu(null)} aria-hidden />}

      {menu === 'capo' && (
        <CapoMenu
          capo={song.capo}
          suggestion={suggestion}
          setCapo={setCapo}
          onDone={() => setMenu(null)}
        />
      )}

      {menu === 'chords' && (
        <ChordDisplayMenu
          chordDisplay={global.chordDisplay}
          onPick={(value) => {
            setChordDisplay(value)
            setMenu(null)
          }}
        />
      )}
    </div>
  )
}

/** The bare signed number the Key badge shows: `formatSemitones` without the word. */
function semitoneBadge(semitones: number): string {
  if (semitones === 0) return '0'
  return semitones > 0 ? `+${semitones}` : `−${Math.abs(semitones)}`
}

/**
 * Which fret the capo is on, picked directly rather than stepped to.
 *
 * Six frets and an arrow, exactly as the reading panel drew them, and for the same
 * reason: seven cells across this width come out wide enough to hit with a guitar in
 * the other hand, where all eight in one row would not. The arrow pages the run along
 * and turns into a `‹` once there is nothing further to reveal, so the row is always
 * seven cells and never changes width — `fretWindowStart` keeps the fret the capo is
 * on among the six whatever page was asked for.
 */
function CapoMenu({
  capo,
  suggestion,
  setCapo,
  onDone,
}: {
  capo: number
  suggestion: ReturnType<typeof suggestCapo>
  setCapo: (fret: number) => void
  onDone: () => void
}) {
  /*
   * Which page of frets the reader last paged to — a *request*, not the answer:
   * `fretWindowStart` gets the last word, because the fret the capo is on has to be on
   * screen whatever page was asked for.
   */
  const [fretPage, setFretPage] = useState(0)
  const fretStart = fretWindowStart(fretPage, capo)
  const pagesForward = fretStart + FRET_PAGE <= MAX_CAPO
  const canPage = pagesForward || fretStart > 0

  return (
    <div className="chip-menu">
      <div className="fret-row" role="group" aria-label="Capo fret">
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
              onClick={() => {
                setCapo(fret)
                onDone()
              }}
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
        * What a capo would do for the hands, when it would do something. A sentence and a
        * button rather than an automatic move: the capo is the one thing here that changes
        * what the hands do, and the reader is the one holding them.
        *
        * It needs no reserved slot of its own here, unlike in the panel it came from: that
        * panel hung above its button, so a suggestion appearing pushed every row up and the
        * whole thing lurched underfoot. This menu hangs below the chip and grows downwards,
        * where nothing above it moves.
        */}
      {suggestion !== null && (
        <div className="capo-suggestion mt-2.5">
          <span className="capo-suggestion-text">
            Easier at <strong>fret {suggestion.fret}</strong> — {suggestion.easy} of{' '}
            {suggestion.total} chords open
          </span>
          <button
            type="button"
            className="capo-suggestion-action"
            onClick={() => {
              setCapo(suggestion.fret)
              onDone()
            }}
          >
            Move capo
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * How much of a chord the sheet draws — four answers, each with the one line that says
 * what it costs. The names are the reader's rather than the stored values': `shape` has
 * been in the database since there were only two of these, and what a reader sees is
 * «diagrams inline», which is what it does.
 */
function ChordDisplayMenu({
  chordDisplay,
  onPick,
}: {
  chordDisplay: ChordDisplay
  onPick: (value: ChordDisplay) => void
}) {
  return (
    <div className="chip-menu" role="group" aria-label="How chords are shown">
      {CHORD_DISPLAYS.map((entry) => (
        <button
          key={entry}
          type="button"
          className={entry === chordDisplay ? 'chip-menu-item is-on' : 'chip-menu-item'}
          onClick={() => onPick(entry)}
          aria-pressed={entry === chordDisplay}
        >
          <span className="chip-menu-name">{CHORD_DISPLAY_LABEL[entry]}</span>
          <span className="chip-menu-hint">{CHORD_DISPLAY_HINT[entry]}</span>
        </button>
      ))}
    </div>
  )
}
