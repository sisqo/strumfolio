import { Fragment } from 'react'

import { ChordDiagram } from '@/components/ChordDiagram'
import {
  IconBroadcast,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconHare,
  IconMenu,
  IconPause,
  IconPlay,
  IconSliders,
} from '@/components/icons'
import { PhoneFrame } from '@/components/PhoneFrame'
import { easeByFret, suggestCapo } from '@/lib/music/capo'
import { parseChord } from '@/lib/music/chord'
import { CHORD_DISPLAY_HINT, CHORD_DISPLAY_TITLE } from '@/lib/prefs/types'
import { chordNoteNames, fingeringText, shapeFor, shapesFor } from '@/lib/music/shapes'

/**
 * The reading screen, alive, in a phone — the second of `/login`'s two moving pictures
 * and the counterpart to `EditorPhone`: that one is the song being written, this one is
 * the song being played.
 *
 * One twenty-second loop, five moves, in the order a musician actually makes them:
 * the key goes up two and every chord on the sheet reletters; the capo menu opens and
 * fret 2 is chosen, which puts the shapes back where the hands already knew them; the
 * Chords menu switches from names to diagrams and the shape panel opens above the
 * words; a chord is tapped and its box comes up full size; and the page starts
 * scrolling on its own. Everything the loop says is a shipped behaviour.
 *
 * **Every number in here is computed, not typed.** The dots under each fret come from
 * `easeByFret` and the sentence under them from `suggestCapo` — the same two calls the
 * real menu makes — the diagrams from `shapeFor`, the notes under the chord box from
 * `chordNoteNames`, and the menu's four rows from `CHORD_DISPLAY_TITLE`. The design
 * board draws its own dots and claims four of four open at fret 2; the truth for this
 * song is three (F is a barre), and the truth is what renders. A demo that states a
 * number the app would state differently is a screenshot with extra steps.
 *
 * **It is drawn with the reading screen's own classes** — `.song-chips`, `.chip-menu`,
 * `.fret-row`, `.chord-strip`, `.song-sheet`, `.chord-card` — so it looks like the app
 * because it *is* the app's CSS, in both themes, and cannot drift when the app moves.
 * The bar at the foot is the one exception, and `.rd-bar` in globals.css says why.
 *
 * Nothing here is focusable and nothing is interactive: it is one `role="img"` with one
 * label. Under `prefers-reduced-motion` the animations stop on their authored resting
 * state — the screen as it opens, key 0, no capo, names only — and everything that
 * exists only mid-gesture (menus, the chord box, the taps, the shape panel) carries
 * `demo-transient` and is simply absent.
 */

/** The song the whole page quotes — `lib/songbooks/sample.ts`, the one written to be shown. */
const SONG_CHORDS = ['C', 'G', 'Am', 'F']

/** Where the loop leaves the key, and the fret that answers it: +2 up, capo on 2, which
 *  is exactly the shift that hands the written shapes back. */
const SEMITONES = 2
const CAPO = 2

/**
 * Two lines of the song per entry: `[C|D]` is one chord in the written key and the same
 * chord in the key the loop transposes to, cross-faded in place. Written like the
 * ChordPro it comes from rather than as nested spans — `wordsOf` below expands it into
 * the same word/part markup `SongSheet` builds, which is what keeps a chord welded to
 * its syllable at every width.
 */
const VERSE = [
  '[C|D]I used to juggle tabs, a hundred open tabs',
  '[G|A]Banner ads and popups, [Am|Bm]losing where I was',
  "[F|G]Now it's in my pocket, [C|D]works without a signal",
  "[G|A]Offline on a mountain, [Am|Bm]still it's [F|G]all here",
]

const CHORUS = [
  '[C|D]Strumfolio, take it anywhere',
  "[G|A]No wifi, no worries, I don't care",
  '[Am|Bm]Every song I love, one tap away',
  '[F|G]Transpose it, [C|D]play it, [G|A]my [Am|Bm]way',
]

interface DemoWord {
  /** The chord over this word in the written key, or `null` where no chord falls. */
  written: string | null
  /** The same chord two semitones up — what the sheet reads between 14% and 44%. */
  raised: string | null
  text: string
}

/** One line of the shorthand above, expanded into the words `SheetLine` would draw. */
function wordsOf(line: string): DemoWord[] {
  const words: DemoWord[] = []
  let pending: { written: string; raised: string } | null = null

  for (const piece of line.split(/(\[[^\]]+\])/)) {
    if (piece === '') continue

    const chord = /^\[([^|\]]+)\|([^\]]+)\]$/.exec(piece)
    if (chord !== null) {
      pending = { written: chord[1], raised: chord[2] }
      continue
    }

    for (const text of piece.split(' ')) {
      if (text === '') continue
      words.push({ written: pending?.written ?? null, raised: pending?.raised ?? null, text })
      pending = null
    }
  }

  return words
}

/** The ring a finger leaves where it lands. `cue` names the moment in the loop; the
 *  timing lives in the matching `rd-tap-*` keyframes, so a tap keeps no clock of its own. */
function Tap({ cue, large = false }: { cue: string; large?: boolean }) {
  return (
    <span className="rd-tap demo-transient" aria-hidden>
      <span className={`rd-tap-ring rd-tap-${cue}${large ? ' is-large' : ''}`} />
    </span>
  )
}

/** A chord above a syllable, in both keys at once: one fades out as the other fades in,
 *  so the sheet reletters in place rather than reflowing. */
function ChordPair({ word }: { word: DemoWord }) {
  if (word.written === null) {
    // The empty slot every chordless syllable still carries, so the words keep one
    // baseline whether or not there is a chord above them — `SheetChord`'s own null case.
    return (
      <span className="sheet-chord" aria-hidden>
        {' '}
      </span>
    )
  }

  return (
    <span className="sheet-chord rd-chord" aria-hidden>
      <span className="rd-name-a">{word.written}</span>
      <span className="rd-name-b">{word.raised}</span>
    </span>
  )
}

function SheetLine({ line, pressed = false }: { line: string; pressed?: boolean }) {
  return (
    <p className="sheet-line">
      {wordsOf(line).map((word, index) => (
        <Fragment key={index}>
          {/* The one break opportunity in the line: between words, never inside. */}
          {index > 0 && ' '}
          <span className={pressed && index === 0 ? 'sheet-word rd-pressed' : 'sheet-word'}>
            <span className="sheet-part">
              <ChordPair word={word} />
              <span className="sheet-lyric">{word.text}</span>
            </span>
            {pressed && index === 0 && <Tap cue="chord" />}
          </span>
        </Fragment>
      ))}
    </p>
  )
}

export function ReaderPhone() {
  /*
   * What the real menu computes, computed the same way. `easeByFret` is asked about the
   * song as the loop leaves it — raised two semitones, no capo yet — because that is the
   * state the menu opens in, and `suggestCapo` answers from the same array.
   */
  const ease = easeByFret(SONG_CHORDS, SEMITONES, 'guitar')
  const suggestion = suggestCapo(SONG_CHORDS, SEMITONES, 0, 'guitar')

  /* Capo 2 against a key two semitones up is a net shift of zero, so the chords drawn
   * here are the written ones — which is the whole point the band beside it is making. */
  const chords = SONG_CHORDS.map((name) => {
    const chord = parseChord(name)!
    return { name, shape: shapeFor(chord, 'guitar')!, chord }
  })

  const preview = chords.slice(0, 3)
  const opened = chords[0]
  const openedShapes = shapesFor(opened.chord, 'guitar')

  return (
    <PhoneFrame>
      <div
        className="reader-demo"
        role="img"
        aria-label="The reading screen: the key is raised two semitones and every chord on the sheet reletters, a capo on the second fret hands the familiar shapes back, the chords switch from names to diagrams above the words, one chord opens full size, and the page begins scrolling on its own."
      >
        {/*
          * The head, compressed: on a real phone the song's name, its place in the
          * songbook and the app's own bar are three separate rows, and 720px of screen
          * with a bar at the foot has room for one. The chips under it are the reading
          * screen's own, class for class.
          */}
        <div className="rd-head">
          <div className="rd-head-row">
            <span className="icon-button">
              <IconChevronLeft size={20} />
            </span>

            <span className="rd-head-title">
              <span className="rd-head-name">Never Lose The Chord</span>
              <span className="rd-head-place">The Strumfolio Sessions · 1 of 9</span>
            </span>

            <span className="icon-button">
              <IconMenu size={18} />
            </span>
          </div>

          <div className="song-chips">
            <span className="song-chip is-group">
              <span className="song-chip-step">−</span>

              <span className="song-chip-value">
                Key{' '}
                <span className="song-chip-badge rd-key-badge">
                  <span className="rd-key-0">+0</span>
                  <span className="rd-key-2">+2</span>
                </span>
              </span>

              <span className="song-chip-step rd-plus">
                +
                <Tap cue="key" />
              </span>
            </span>

            <span className="song-chip is-menu rd-capo-chip">
              Capo
              <span className="song-chip-badge rd-capo-badge">
                <span className="rd-capo-0">0</span>
                <span className="rd-capo-2">{CAPO}</span>
              </span>
              <IconChevronDown size={11} />
              <Tap cue="capo" />
            </span>

            <span className="song-chip is-group">
              <span className="song-chip-toggle is-on">♯</span>
              <span className="song-chip-toggle">♭</span>
            </span>

            <span className="song-chip is-menu rd-chords-chip">
              Chords
              <span className="song-chip-word">
                <span className="rd-word-names">names</span>
                <span className="rd-word-diagrams">diagrams</span>
              </span>
              <IconChevronDown size={11} />
              <Tap cue="chords" />
            </span>

            {/* Both menus hang off the row, not off the chip that opened them — the same
                anchoring `SongControls` uses, and for the same reason: a menu hung off the
                Chords chip runs off the right edge of a phone. */}
            <div className="chip-menu demo-transient rd-capo-menu">
              <div className="chip-menu-head">
                <span className="control-name-label">Capo</span>
                <span className="chip-menu-head-hint">dots = open positions</span>
              </div>

              <div className="fret-row">
                {[0, 1, 2, 3, 4, 5].map((fret) => (
                  <span
                    key={fret}
                    className={
                      fret === 0
                        ? 'fret-button rd-fret-was'
                        : fret === CAPO
                          ? 'fret-button rd-fret-now'
                          : 'fret-button'
                    }
                  >
                    <span className="fret-button-number">{fret}</span>
                    <span className="fret-dots">
                      {Array.from({ length: ease.total }, (_, dot) => (
                        <span
                          key={dot}
                          className={dot < ease.easyByFret[fret] ? 'fret-dot is-filled' : 'fret-dot'}
                        />
                      ))}
                    </span>
                    {fret === CAPO && <Tap cue="fret" />}
                  </span>
                ))}

                {/* Six frets and an arrow: the fixed seven-cell shape `FRET_PAGE` is sized
                    for, so the row never changes width as it pages along. */}
                <span className="fret-button is-page">
                  <IconChevronRight size={16} />
                </span>
              </div>

              {suggestion !== null && (
                <div className="capo-suggestion mt-2.5">
                  <span className="capo-suggestion-text">
                    At <strong>fret {suggestion.fret}</strong>, {suggestion.easy} of{' '}
                    {suggestion.total} chords are open
                  </span>
                  <span className="capo-suggestion-action">Move</span>
                </div>
              )}
            </div>

            <div className="chip-menu demo-transient rd-chords-menu">
              <div className="chip-menu-head">
                <span className="control-name-label">Chords</span>
                <span className="chip-menu-head-hint">{chords.length} in this song</span>
              </div>

              <div className="chip-menu-item rd-mode-diagrams">
                <span className="chip-menu-title">
                  <span className="chip-menu-name rd-mode-name">
                    {CHORD_DISPLAY_TITLE.diagrams}
                  </span>
                  <span className="chip-menu-hint">
                    All {chords.length} shapes, in a panel above the lyrics
                  </span>
                </span>
                <span className="chords-menu-preview">
                  <span className="chords-menu-diagrams">
                    {preview.map((chord) => (
                      <ChordDiagram
                        key={chord.name}
                        shape={chord.shape}
                        capo={CAPO}
                        className="chords-menu-diagram"
                      />
                    ))}
                  </span>
                  <span className="chords-menu-bar" style={{ width: '2.5rem' }} />
                </span>
                <IconCheck size={14} className="chip-menu-check rd-check-diagrams" />
                <Tap cue="cmode" />
              </div>

              <div className="chip-menu-item">
                <span className="chip-menu-title">
                  <span className="chip-menu-name">{CHORD_DISPLAY_TITLE.fingerings}</span>
                  <span className="chip-menu-hint">
                    One line per chord: {preview[0].name} {fingeringText(preview[0].shape.frets)}
                  </span>
                </span>
                <span className="chords-menu-preview">
                  <span className="chords-menu-fingering">
                    {preview[0].name} {fingeringText(preview[0].shape.frets)}
                  </span>
                  <span className="chords-menu-bar" style={{ width: '2.5rem' }} />
                  <span className="chords-menu-bar" style={{ width: '1.875rem' }} />
                </span>
                <IconCheck size={14} className="chip-menu-check rd-check-off" />
              </div>

              <div className="chip-menu-item">
                <span className="chip-menu-title">
                  <span className="chip-menu-name">{CHORD_DISPLAY_TITLE.shape}</span>
                  <span className="chip-menu-hint">{CHORD_DISPLAY_HINT.shape}</span>
                </span>
                <span className="chords-menu-preview">
                  <span className="chords-menu-diagrams is-spread">
                    {preview.slice(0, 2).map((chord) => (
                      <ChordDiagram
                        key={chord.name}
                        shape={chord.shape}
                        capo={CAPO}
                        className="chords-menu-diagram is-small"
                      />
                    ))}
                  </span>
                  <span className="chords-menu-bar" style={{ width: '2.5rem' }} />
                </span>
                <IconCheck size={14} className="chip-menu-check rd-check-off" />
              </div>

              <div className="chip-menu-item rd-mode-names">
                <span className="chip-menu-title">
                  <span className="chip-menu-name rd-mode-name">{CHORD_DISPLAY_TITLE.name}</span>
                  <span className="chip-menu-hint">{CHORD_DISPLAY_HINT.name}</span>
                </span>
                <span className="chords-menu-preview">
                  <span className="chords-menu-names">
                    {preview.map((chord) => (
                      <span key={chord.name}>{chord.name}</span>
                    ))}
                  </span>
                  <span className="chords-menu-bar" style={{ width: '2.5rem' }} />
                  <span className="chords-menu-bar" style={{ width: '1.75rem' }} />
                </span>
                <IconCheck size={14} className="chip-menu-check rd-check-names" />
              </div>
            </div>
          </div>
        </div>

        <div className="rd-body">
          <div className="rd-scroll">
            <div className="chord-strip demo-transient rd-strip">
              {chords.map((chord) => (
                <span key={chord.name} className="chord-strip-item">
                  <ChordDiagram shape={chord.shape} capo={CAPO} className="chord-strip-shape" />
                  <span className="chord-strip-name">{chord.name}</span>
                </span>
              ))}
            </div>

            <div className="song-sheet">
              <section className="sheet-section is-verse">
                {VERSE.map((line) => (
                  <SheetLine key={line} line={line} />
                ))}
              </section>

              <section className="sheet-section is-chorus">
                {CHORUS.map((line, index) => (
                  <SheetLine key={line} line={line} pressed={index === 0} />
                ))}
              </section>
            </div>
          </div>
        </div>

        {/* The bar, and the two things it does that no other control on the screen can:
            step to the next song, and take the scrolling off your hands. */}
        <div className="rd-bar">
          <span className="rd-step is-previous">
            <IconChevronLeft size={22} />
            Previous
          </span>

          <span className="rd-step is-next">
            Next
            <IconChevronRight size={22} />
          </span>

          <span className="rd-strum">
            <IconBroadcast size={23} />
          </span>

          <span className="rd-play">
            <span className="rd-play-icon">
              <IconPlay size={30} />
            </span>
            <span className="rd-pause-icon">
              <IconPause size={30} />
            </span>
            <Tap cue="play" large />
          </span>

          <span className="rd-tools">
            <span className="rd-tool is-speed">
              <IconHare size={24} />
              <span className="rd-speed-step">3</span>
            </span>
            <span className="rd-tool">
              <IconSliders size={24} />
            </span>
          </span>
        </div>

        <div className="rd-scrim demo-transient" />

        <div className="chord-card rd-sheet demo-transient">
          <span className="chord-close">
            <IconClose size={18} />
          </span>

          <p className="chord-name">{opened.name}</p>

          <div className="chord-carousel">
            <div className="chord-carousel-track">
              <div className="chord-carousel-slide">
                <ChordDiagram shape={opened.shape} capo={CAPO} />
                <span className="chord-carousel-caption">Standard</span>
              </div>
            </div>

            <div className="chord-carousel-dots">
              {openedShapes.map((shape, index) => (
                <span
                  key={fingeringText(shape.frets)}
                  className={index === 0 ? 'chord-carousel-dot is-on' : 'chord-carousel-dot'}
                />
              ))}
            </div>
          </div>

          <p className="chord-notes">{chordNoteNames(opened.chord).join(' · ')}</p>
        </div>
      </div>
    </PhoneFrame>
  )
}
