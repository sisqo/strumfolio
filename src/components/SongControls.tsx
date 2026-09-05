'use client'

import { useEffect, useMemo, useState } from 'react'

import { ChordDiagram } from '@/components/ChordDiagram'
import { usePrefs } from '@/components/PrefsProvider'
import { useStrumTogether } from '@/components/StrumTogetherProvider'
import { IconCheck, IconChevronDown, IconChevronLeft, IconChevronRight } from '@/components/icons'
import {
  type CapoOption,
  FRET_PAGE,
  type FretEase,
  MAX_CAPO,
  clampFretWindow,
  distinctChordCount,
  easeByFret,
  formatSemitones,
  fretWindowStart,
  readShift,
  suggestCapo,
} from '@/lib/music/capo'
import { type Accidentals, type Spelling, formatChord, parseChord, readChord } from '@/lib/music/chord'
import { spellingFor } from '@/lib/music/key'
import { type ChordShape, type Instrument, fingeringText, shapeFor } from '@/lib/music/shapes'
import {
  CHORD_DISPLAYS,
  CHORD_DISPLAY_HINT,
  CHORD_DISPLAY_LABEL,
  CHORD_DISPLAY_TITLE,
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
  /*
   * One dot per chord, per fret — the menu's own visual, not a summary of it. Gated the
   * same way `suggestion` is and for the same reason; the two share the identical
   * underlying computation (`easeByFret`'s own comment), so asking for both costs no
   * more than asking for one.
   */
  const ease = useMemo(
    () => (menu === 'capo' ? easeByFret(chords, song.semitones, global.instrument) : null),
    [menu, chords, song.semitones, global.instrument],
  )

  /*
   * The Chords menu's own preview: how many distinct chords the song has, and up to
   * three of them — moved and spelled exactly as the sheet shows them right now — for
   * its rows to draw from. Gated on the menu being open for the same reason `ease` is:
   * a diagram needs `shapeFor`, which searches on a ukulele.
   */
  const chordsPreview = useMemo(() => {
    if (menu !== 'chords') return null
    const shift = readShift(song.semitones, song.capo)
    return {
      total: distinctChordCount(chords),
      items: previewChords(
        chords,
        shift,
        global.accidentals,
        spellingFor(global.notation, () => chords, shift),
        global.instrument,
        3,
      ),
    }
  }, [menu, chords, song.semitones, song.capo, global.accidentals, global.notation, global.instrument])

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
          Key{' '}
          <span className={song.semitones === 0 ? 'song-chip-badge' : 'song-chip-badge is-set'}>
            {semitoneBadge(song.semitones)}
          </span>
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
        <span className={song.capo === 0 ? 'song-chip-badge' : 'song-chip-badge is-solid'}>
          {song.capo}
        </span>
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

      {menu === 'capo' && ease !== null && (
        <CapoMenu
          capo={song.capo}
          suggestion={suggestion}
          ease={ease}
          setCapo={setCapo}
          onDone={() => setMenu(null)}
        />
      )}

      {menu === 'chords' && chordsPreview !== null && (
        <ChordDisplayMenu
          chordDisplay={global.chordDisplay}
          total={chordsPreview.total}
          preview={chordsPreview.items}
          capo={song.capo}
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
 * Six frets and an arrow, the fixed shape `FRET_PAGE` was sized for, and for the same
 * reason as before: seven cells across this width come out wide enough to hit with a
 * guitar in the other hand, where all eight in one row would not. The arrow pages the
 * run along and turns into a `‹` once there is nothing further to reveal, so the row is
 * always seven cells and never changes width — `fretWindowStart` opens the row on the
 * fret the capo is on, and from there the arrows only ever move it by a page.
 *
 * Each cell now draws a row of dots under its number, one per chord in the song, filled
 * for however many are easy to hold at that fret — the same fact `suggestCapo` already
 * computes to make its one suggestion, just shown for every fret at once rather than
 * kept to itself. The chosen fret gets a ring rather than a fill, and the *suggested*
 * fret — when it differs from the chosen one and is on the visible page — gets the one
 * tinted cell in the row; nothing else here takes a second colour.
 */
function CapoMenu({
  capo,
  suggestion,
  ease,
  setCapo,
  onDone,
}: {
  capo: number
  suggestion: CapoOption | null
  ease: FretEase
  setCapo: (fret: number) => void
  onDone: () => void
}) {
  /*
   * Where the visible run of frets starts — the answer itself, kept in state, not a page
   * request for `fretWindowStart` to rule on again.
   *
   * `fretWindowStart`'s whole point is that the fret the capo is on always wins, whatever
   * page was asked for: right for the moment a menu opens (one opened with the capo on
   * fret 7 must show fret 7), wrong for every page after. Every song starts with the capo
   * on 0, so a rule re-run on each render pulled each page the reader asked for straight
   * back to the nut — the forward arrow rendered and did nothing, and no fret past 5 could
   * be picked. Freezing the capo in a second state, the first attempt at this, changed
   * nothing: a frozen 0 fights the paging exactly as a live one does. So the rule runs
   * once, here in the initialiser, and the arrows move the window by a page through
   * `clampFretWindow`, which knows the edges and nothing about the capo. A fret picked from
   * the page on screen needs no containment to begin with — the reader can only click a
   * button that is already there.
   */
  const [fretStart, setFretStart] = useState(() => fretWindowStart(0, capo))
  const canPageBack = fretStart > 0
  const canPageForward = fretStart + FRET_PAGE <= MAX_CAPO

  return (
    <div className="chip-menu">
      <div className="chip-menu-head">
        <span className="control-name-label">Capo</span>
        <span className="chip-menu-head-hint">dots = open positions</span>
      </div>

      <div className="fret-row" role="group" aria-label="Capo fret">
        {canPageBack && (
          <button
            type="button"
            className="fret-button is-page"
            onClick={() => setFretStart(clampFretWindow(fretStart - FRET_PAGE))}
            aria-label="Show lower frets"
            title="Lower frets"
          >
            <IconChevronLeft size={16} />
          </button>
        )}

        {Array.from({ length: Math.min(FRET_PAGE, MAX_CAPO + 1 - fretStart) }, (_, index) => {
          const fret = fretStart + index
          const easy = ease.easyByFret[fret]
          const isSuggested = suggestion !== null && suggestion.fret === fret

          const classes = ['fret-button']
          if (fret === capo) classes.push('is-on')
          else if (isSuggested) classes.push('is-suggested')

          return (
            <button
              key={fret}
              type="button"
              className={classes.join(' ')}
              onClick={() => setCapo(fret)}
              aria-pressed={fret === capo}
              aria-label={
                (fret === 0 ? 'No capo' : `Capo on fret ${fret}`) +
                (ease.total > 0 ? `, ${easy} of ${ease.total} chords open` : '')
              }
            >
              <span className="fret-button-number">{fret}</span>
              {ease.total > 0 && (
                <span className="fret-dots" aria-hidden>
                  {Array.from({ length: ease.total }, (_, dot) => (
                    <span
                      key={dot}
                      className={dot < easy ? 'fret-dot is-filled' : 'fret-dot'}
                    />
                  ))}
                </span>
              )}
            </button>
          )
        })}

        {canPageForward && (
          <button
            type="button"
            className="fret-button is-page"
            onClick={() => setFretStart(clampFretWindow(fretStart + FRET_PAGE))}
            aria-label="Show higher frets"
            title="Higher frets"
          >
            <IconChevronRight size={16} />
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
            At <strong>fret {suggestion.fret}</strong>, {suggestion.easy} of {suggestion.total}{' '}
            chords are open
          </span>
          <button
            type="button"
            className="capo-suggestion-action"
            onClick={() => {
              setCapo(suggestion.fret)
              onDone()
            }}
          >
            Move
          </button>
        </div>
      )}
    </div>
  )
}

/** One chord ready to sit in a menu row: the letters a reader would see right now, and
 *  the shape a hand would make for it — `null` when there is none in the table, which
 *  `previewChords` below already filters out before this type is ever built. */
interface ChordPreviewItem {
  label: string
  shape: ChordShape
}

/**
 * Up to `max` of the song's own chords, in reading order, moved and spelled exactly as
 * the sheet shows them right now — what the Chords menu's own rows draw from, so a
 * reader previews each mode against *their* song rather than a stock example.
 *
 * Skips a chord with no shape in the table (an exotic suffix — `shapeFor`'s own
 * comment): a preview exists to show what a mode draws, and one that cannot be drawn
 * has nothing to contribute here, even though it still gets a name and a slot on the
 * real sheet.
 */
function previewChords(
  tokens: string[],
  shift: number,
  accidentals: Accidentals,
  spelling: Spelling,
  instrument: Instrument,
  max: number,
): ChordPreviewItem[] {
  const seen = new Set<string>()
  const found: ChordPreviewItem[] = []

  for (const token of tokens) {
    if (found.length >= max) break

    const parsed = parseChord(token)
    if (parsed === null) continue

    const chord = readChord(parsed, shift, accidentals)
    const label = formatChord(chord, spelling)
    if (seen.has(label)) continue
    seen.add(label)

    const shape = shapeFor(chord, instrument)
    if (shape === null) continue

    found.push({ label, shape })
  }

  return found
}

/**
 * The sentence under a row's own title. `diagrams` and `fingerings` say it with the
 * song's own chords when there are any to show; everything else, and a song with
 * nothing previewable, falls back to `CHORD_DISPLAY_HINT`'s generic sentence.
 */
function chordsMenuSubtitle(entry: ChordDisplay, total: number, preview: ChordPreviewItem[]): string {
  if (entry === 'diagrams' && total > 0) {
    return `All ${total} shape${total === 1 ? '' : 's'}, in a panel above the lyrics`
  }

  if (entry === 'fingerings' && preview[0] !== undefined) {
    return `One line per chord: ${preview[0].label} ${fingeringText(preview[0].shape.frets)}`
  }

  return CHORD_DISPLAY_HINT[entry]
}

/**
 * What a row draws to its own right: the same three (or fewer) chords every row
 * shares, in whichever shape that mode actually puts on the sheet — diagrams, a
 * fingering, or bare names — followed by one or two bare bars standing for the lyric
 * lines the real sheet still has under it.
 */
function ChordsMenuPreview({
  entry,
  preview,
  capo,
}: {
  entry: ChordDisplay
  preview: ChordPreviewItem[]
  capo: number
}) {
  if (entry === 'diagrams') {
    return (
      <span className="chords-menu-preview">
        <span className="chords-menu-diagrams">
          {preview.map((chord) => (
            <ChordDiagram
              key={chord.label}
              shape={chord.shape}
              capo={capo}
              className="chords-menu-diagram"
            />
          ))}
        </span>
        <span className="chords-menu-bar" style={{ width: '2.5rem' }} />
      </span>
    )
  }

  if (entry === 'fingerings') {
    const first = preview[0]
    return (
      <span className="chords-menu-preview">
        {first !== undefined && (
          <span className="chords-menu-fingering">
            {first.label} {fingeringText(first.shape.frets)}
          </span>
        )}
        <span className="chords-menu-bar" style={{ width: '2.5rem' }} />
        <span className="chords-menu-bar" style={{ width: '1.875rem' }} />
      </span>
    )
  }

  if (entry === 'shape') {
    return (
      <span className="chords-menu-preview">
        <span className="chords-menu-diagrams is-spread">
          {preview.slice(0, 2).map((chord) => (
            <ChordDiagram
              key={chord.label}
              shape={chord.shape}
              capo={capo}
              className="chords-menu-diagram is-small"
            />
          ))}
        </span>
        <span className="chords-menu-bar" style={{ width: '2.5rem' }} />
      </span>
    )
  }

  return (
    <span className="chords-menu-preview">
      <span className="chords-menu-names">
        {preview.map((chord) => (
          <span key={chord.label}>{chord.label}</span>
        ))}
      </span>
      <span className="chords-menu-bar" style={{ width: '2.5rem' }} />
      <span className="chords-menu-bar" style={{ width: '1.75rem' }} />
    </span>
  )
}

/**
 * How much of a chord the sheet draws — four rows, each showing what it does against
 * the song actually open rather than telling it in words alone: a stock example would
 * say the same thing for every song, and the point of this menu is that the choice can
 * be made by looking.
 *
 * The names here are the reader's rather than the stored values': `shape` has been in
 * the database since there were only two of these, and what a reader sees is
 * «Diagrams in the lyrics», which is what it does.
 */
function ChordDisplayMenu({
  chordDisplay,
  total,
  preview,
  capo,
  onPick,
}: {
  chordDisplay: ChordDisplay
  /** Distinct chords in the song — "6 in this song", and what a diagrams row's own
   *  sentence counts. */
  total: number
  /** Up to three of them, ready for a row's own preview — see `previewChords`. */
  preview: ChordPreviewItem[]
  /** For a diagram preview's own capo bar — the shape unchanged, see `ChordDiagram`. */
  capo: number
  onPick: (value: ChordDisplay) => void
}) {
  return (
    <div className="chip-menu">
      <div className="chip-menu-head">
        <span className="control-name-label">Chords</span>
        <span className="chip-menu-head-hint">{total} in this song</span>
      </div>

      {CHORD_DISPLAYS.map((entry) => (
        <button
          key={entry}
          type="button"
          className={entry === chordDisplay ? 'chip-menu-item is-on' : 'chip-menu-item'}
          onClick={() => onPick(entry)}
          aria-pressed={entry === chordDisplay}
        >
          <span className="chip-menu-title">
            <span className="chip-menu-name">{CHORD_DISPLAY_TITLE[entry]}</span>
            <span className="chip-menu-hint">{chordsMenuSubtitle(entry, total, preview)}</span>
          </span>
          <ChordsMenuPreview entry={entry} preview={preview} capo={capo} />
          {entry === chordDisplay && <IconCheck size={14} className="chip-menu-check" />}
        </button>
      ))}
    </div>
  )
}
