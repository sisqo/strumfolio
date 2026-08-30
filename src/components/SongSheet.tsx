'use client'

import { Fragment, useMemo, useState } from 'react'

import { ChordDiagram } from '@/components/ChordDiagram'
import { ChordPopup } from '@/components/ChordPopup'
import { usePrefs } from '@/components/PrefsProvider'
import type { CommentsMode } from '@/components/CommentsProvider'
import { type AnchorMap, type PartAnchor, notesAt } from '@/lib/comments/anchorMap'
import type { CardPoint, CommentAnchor, SongComment } from '@/lib/comments/types'
import { type Line, type ParsedSong, chordTokens } from '@/lib/chordpro'
import { type Chord, type Notation, formatChord, parseChord, transposeChord } from '@/lib/music/chord'
import { readKey, readShift } from '@/lib/music/capo'
import { estimateKey } from '@/lib/music/key'
import { type Key, C_MAJOR } from '@/lib/music/notes'
import { type Instrument, shapeFor } from '@/lib/music/shapes'
import { type ChordDisplay, ZOOM_STEPS } from '@/lib/prefs/types'

const BLANK = ' '

/**
 * Everything the sheet needs to draw notes on itself, or `undefined` for the three screens
 * that must not.
 *
 * An optional prop rather than a context read, because `SongSheet` has four call sites and
 * only one of them may show notes. `FollowSession` renders this same component for a Strum
 * Together guest, and «only you see these» is a promise that breaks the moment a guest's
 * screen picks the leader's notes up from a context it happens to sit inside. Passing them
 * in makes the three silent call sites silent by construction.
 */
export interface SheetNotes {
  /** Built on the server from the source — see `lib/comments/anchorMap.ts`. */
  anchors: AnchorMap
  /** In reading order: the badge numbers are positions in this list. */
  comments: SongComment[]
  mode: CommentsMode
  /** A badge was tapped: every note sharing that point, since one card stacks them. */
  onOpen: (ids: string[], at: CardPoint) => void
  /** A word or a chord was tapped while `adding` was armed. */
  onPlace: (anchor: CommentAnchor, at: CardPoint) => void
}

/**
 * Where on the screen the card should appear, in viewport coordinates.
 *
 * Carried from the tap rather than looked up later: by the time the card renders, the
 * element that was tapped is one of hundreds on the page and nothing else identifies it.
 */
export function pointOf(element: HTMLElement): CardPoint {
  const box = element.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.bottom }
}

/**
 * Renders the sheet: chords above the syllable they belong to.
 *
 * The markup is what makes wrapping safe. Each word is one inline-block that
 * never breaks internally, and a real space sits between words — JSX drops
 * whitespace between elements on separate lines, so the space has to be written
 * explicitly or the words run together and the line stops wrapping at all.
 *
 * A chord is a button, so tapping it shows its shape. The button carries exactly
 * the box the span carried: no padding of its own, no border, and the font
 * inherited rather than the one browsers give buttons — anything else would move
 * where the lines wrap.
 *
 * In a song with chords, every line keeps the chord row above it whether it has
 * chords or not, so the spacing between lines is even.
 */
export function SongSheet({ song, notes }: { song: ParsedSong; notes?: SheetNotes }) {
  const { global, song: songPrefs } = usePrefs()
  const [shown, setShown] = useState<Chord | null>(null)

  /*
   * The key the song is written in, read off its own chords.
   *
   * Nothing stores this and nothing shows it. It exists for one decision: moved chords
   * have to be spelled either sharp or flat, and the key they land in is what settles
   * that — so a song in Bb transposed up gets `Ab`, not `G#`. Memoised on the song
   * rather than on the shift, because the written key does not move when the reader does.
   */
  const written = useMemo(() => estimateKey(chordTokens(song)) ?? C_MAJOR, [song])

  /*
   * The key whose letters go on the page, which is not always the key that sounds.
   *
   * Transposing moves both; a capo moves only this one, downwards, because the shapes
   * you finger behind a capo are lower than what comes out of the instrument — see
   * `lib/music/capo.ts`, where the two shifts are named and tested.
   */
  const shift = readShift(songPrefs.semitones, songPrefs.capo)
  const currentKey = useMemo(
    () => readKey(written, songPrefs.semitones, songPrefs.capo),
    [written, songPrefs.semitones, songPrefs.capo],
  )

  /**
   * Whether to leave room for chords above every line, decided for the whole song
   * rather than line by line.
   *
   * Per line, the lines without chords closed up against the ones above them and
   * the spacing came out ragged. Per song, every line in a song that has chords
   * sits on the same rhythm — and a song with no chords at all stays compact
   * instead of carrying an empty row above each line for nothing.
   */
  const roomForChords = useMemo(
    () =>
      song.sections.some((section) =>
        section.lines.some((line) => line.kind === 'lyrics' && line.hasChords),
      ),
    [song],
  )

  /*
   * The sheet renders lines section by section; the anchor map is a flat list of the
   * lyrics lines in source order. This counter is what joins them, and it has to be
   * incremented for every lyrics line whether or not anything is anchored in it.
   */
  let lyricLine = -1

  const showNotes = notes !== undefined && notes.mode !== 'hidden'
  const orphans = showNotes ? notes.comments.filter((comment) => comment.anchor === null) : []

  return (
    <>
      <div
        className={showNotes && notes.mode === 'adding' ? 'song-sheet is-adding' : 'song-sheet'}
        style={{ fontSize: `${ZOOM_STEPS[global.zoomStep]}px` }}
      >
        {song.sections.map((section, sectionIndex) => (
          <section key={sectionIndex} className={`sheet-section is-${section.kind}`}>
            {section.lines.map((line, lineIndex) => {
              if (line.kind === 'lyrics') lyricLine += 1
              return (
                <SheetLine
                  key={lineIndex}
                  line={line}
                  shift={shift}
                  notation={global.notation}
                  chordDisplay={global.chordDisplay}
                  instrument={global.instrument}
                  capo={songPrefs.capo}
                  currentKey={currentKey}
                  roomForChords={roomForChords}
                  onPick={setShown}
                  notes={showNotes ? notes : undefined}
                  anchors={showNotes ? notes.anchors[lyricLine] : undefined}
                />
              )
            })}
          </section>
        ))}

        {/*
          * Orphans, parked at the foot of the sheet.
          *
          * Not «at the end of the section it used to be in», which the plan asked for and
          * which turns out to be unanswerable: an orphan is exactly a note whose block
          * index was dropped, so the section it came from is not a fact this data still
          * holds. Parking them together under their own heading is the honest version —
          * it says the position is gone instead of inventing one a badge would then lie
          * about, and they stay reachable by the same tap as every other note, which is
          * the whole reason the parked badge exists on a phone with no rail.
          */}
        {orphans.length > 0 && (
          <p className="sheet-orphans">
            <span className="sheet-orphans-label">
              {orphans.length === 1 ? 'A note no longer sits on the words' : `${orphans.length} notes no longer sit on the words`}
            </span>
            {orphans.map((comment) => (
              <CommentBadge
                key={comment.id}
                number={notes!.comments.indexOf(comment) + 1}
                label={comment.anchorLabel}
                orphan
                onOpen={(at) => notes!.onOpen([comment.id], at)}
              />
            ))}
          </p>
        )}
      </div>

      {shown !== null && (
        <ChordPopup
          chord={shown}
          notation={global.notation}
          instrument={global.instrument}
          capo={songPrefs.capo}
          onClose={() => setShown(null)}
        />
      )}
    </>
  )
}

function SheetLine({
  line,
  shift,
  notation,
  chordDisplay,
  instrument,
  capo,
  currentKey,
  roomForChords,
  onPick,
  notes,
  anchors,
}: {
  line: Line
  /** Transposition and capo together: how far the written chords move to reach the page. */
  shift: number
  notation: Notation
  chordDisplay: ChordDisplay
  instrument: Instrument
  /** The fret the capo is on, for the shape's own capo bar — the shape unchanged, see `ChordDiagram`. */
  capo: number
  currentKey: Key
  roomForChords: boolean
  onPick: (chord: Chord) => void
  notes?: SheetNotes
  /** This line's slice of the anchor map: word, then part. */
  anchors?: PartAnchor[][]
}) {
  if (line.kind === 'comment') {
    return <p className="sheet-comment">{line.text}</p>
  }

  /*
   * Verbatim, in the app's own monospace — the same font the ChordPro editor
   * measures words in (`layout.tsx`'s own comment on `--font-mono`), not a
   * chord-notation matter: transposing moves a chord's name, not where a finger
   * sits on a fret, so a tab ignores `shift`/`notation`/`currentKey` entirely.
   */
  if (line.kind === 'tab') {
    return <pre className="sheet-tab">{line.rows.join('\n')}</pre>
  }

  return (
    <p className="sheet-line">
      {line.words.map((word, wordIndex) => (
        <Fragment key={wordIndex}>
          {/* The one break opportunity in the line: between words, never inside. */}
          {wordIndex > 0 && ' '}
          <span className="sheet-word">
            {word.parts.map((part, partIndex) => {
              const anchor = anchors?.[wordIndex]?.[partIndex]
              const lyric =
                notes !== undefined && anchor !== undefined ? notesAt(notes.comments, anchor, 'lyric') : null
              const chordNote =
                notes !== undefined && anchor !== undefined ? notesAt(notes.comments, anchor, 'chord') : null

              /*
               * Both kinds of badge ride **inside** `.sheet-lyric`, never beside it.
               *
               * `.sheet-lyric` is `display: block` inside an inline-block `.sheet-part`, so a
               * badge rendered as its sibling becomes a third row of that box and lands under
               * the word instead of after it — which is exactly how the first version broke
               * the sheet.
               *
               * A note about a *chord* rides there too, rather than in the chord slot above:
               * `.sheet-chord` is already a `<button>`, and a button inside a button is not
               * markup a browser will honour. The chord still says the note is about it, by
               * carrying the dotted underline, and the card's own header names it.
               */
              const badges =
                notes === undefined ? null : (
                  <>
                    {lyric !== null && lyric.ids.length > 0 && (
                      <CommentBadge
                        number={lyric.number}
                        label={part.text}
                        stacked={lyric.ids.length}
                        interactive={notes.mode !== 'adding'}
                        onOpen={(at) => notes.onOpen(lyric.ids, at)}
                      />
                    )}
                    {chordNote !== null && chordNote.ids.length > 0 && (
                      <CommentBadge
                        number={chordNote.number}
                        label={part.chord ?? ''}
                        stacked={chordNote.ids.length}
                        interactive={notes.mode !== 'adding'}
                        onOpen={(at) => notes.onOpen(chordNote.ids, at)}
                      />
                    )}
                  </>
                )

              return (
                <span key={partIndex} className="sheet-part">
                  {roomForChords && (
                    <SheetChord
                      raw={part.chord}
                      shift={shift}
                      notation={notation}
                      chordDisplay={chordDisplay}
                      instrument={instrument}
                      capo={capo}
                      currentKey={currentKey}
                      onPick={onPick}
                      note={
                        notes === undefined || anchor === undefined
                          ? undefined
                          : {
                              mode: notes.mode,
                              marked: (chordNote?.ids.length ?? 0) > 0,
                              onPlace: (at: CardPoint) =>
                                notes.onPlace({ ...anchor, target: 'chord' }, at),
                            }
                      }
                    />
                  )}
                  {notes !== undefined && anchor !== undefined && notes.mode === 'adding' ? (
                    <button
                      type="button"
                      className="sheet-lyric sheet-lyric-target"
                      onClick={(event) =>
                        notes.onPlace({ ...anchor, target: 'lyric' }, pointOf(event.currentTarget))
                      }
                      aria-label={`Add a note on ${part.text}`}
                    >
                      {part.text === '' ? BLANK : part.text}
                      {badges}
                    </button>
                  ) : (
                    <span className={lyric !== null && lyric.ids.length > 0 ? 'sheet-lyric is-noted' : 'sheet-lyric'}>
                      {part.text === '' ? BLANK : part.text}
                      {badges}
                    </span>
                  )}
                </span>
              )
            })}
          </span>
        </Fragment>
      ))}
    </p>
  )
}

/**
 * The mark that says a note is here: a small numbered circle, blue rather than the chord
 * accent so a note can never be misread as part of the music.
 *
 * It sits inline, right after the text it belongs to, which is how both reader boards draw
 * it — and which means it **takes horizontal space and can change where the line wraps**.
 * `Comment Mode`'s own prose promised the opposite (a mark on the chord row's baseline,
 * pushing nothing sideways); the boards are the more concrete artifact and win, but the
 * cost is real and is the strongest argument for the `hidden` state, which gives back
 * exactly the line as it was written.
 */
function CommentBadge({
  number,
  label,
  stacked = 1,
  orphan = false,
  interactive = true,
  onOpen,
}: {
  number: number
  label: string
  /** How many notes share this point; they open as one stacked card, not several. */
  stacked?: number
  orphan?: boolean
  /**
   * `false` while `adding` is armed, where the word itself is the button and a button
   * inside a button is not markup a browser will honour. The mark still shows its number
   * there; reading it is what the `visible` state is for.
   */
  interactive?: boolean
  onOpen: (at: CardPoint) => void
}) {
  const what = orphan
    ? `note ${number}, no longer on the words`
    : stacked > 1
      ? `${stacked} notes on ${label}`
      : `note on ${label}`

  const className = orphan ? 'comment-badge is-orphan' : 'comment-badge'

  if (!interactive) {
    return (
      <span className={className} aria-label={what}>
        {number}
      </span>
    )
  }

  return (
    <button
      type="button"
      className={className}
      onClick={(event) => {
        // Stops the word underneath from also answering, so tapping a mark reads the note
        // rather than acting on the word it sits in.
        event.stopPropagation()
        onOpen(pointOf(event.currentTarget))
      }}
      aria-label={what}
    >
      {number}
    </button>
  )
}

/**
 * One chord slot above a syllable.
 *
 * Three cases share one box: nothing to show, a token that is not really a chord
 * — `[x2]`, `[assolo]` — and a chord. Only the last is a button; the others stay
 * inert text so nothing unhelpful ends up in the tab order.
 */
function SheetChord({
  raw,
  shift,
  notation,
  chordDisplay,
  instrument,
  capo,
  currentKey,
  onPick,
  note,
}: {
  raw: string | null
  shift: number
  notation: Notation
  chordDisplay: ChordDisplay
  instrument: Instrument
  capo: number
  currentKey: Key
  onPick: (chord: Chord) => void
  /**
   * What this slot does about notes. While `adding` is armed the tap places one instead of
   * opening the fingering — the chord slot is the only control on the sheet that already
   * had a job, and arming the mode has to take it over rather than compete with it.
   */
  note?: { mode: CommentsMode; marked: boolean; onPlace: (at: CardPoint) => void }
}) {
  const arming = note?.mode === 'adding'

  if (raw === null) {
    // Nothing to note and nothing to play: an empty slot stays inert even while arming,
    // or every line in the song would sprout a target above syllables with no chord.
    return (
      <span className="sheet-chord" aria-hidden>
        {BLANK}
      </span>
    )
  }

  const marked = note?.marked === true

  const parsed = parseChord(raw)
  if (parsed === null) {
    return arming ? (
      <button type="button" className="sheet-chord sheet-chord-target" onClick={(event) => note.onPlace(pointOf(event.currentTarget))} aria-label={`Add a note on ${raw}`}>
        {raw}
      </button>
    ) : (
      <span className={marked ? 'sheet-chord is-noted' : 'sheet-chord'}>{raw}</span>
    )
  }

  const chord = transposeChord(parsed, shift, currentKey)
  const label = formatChord(chord, notation)

  /*
   * Falls back to the name whenever there is no shape to draw — an exotic suffix
   * outside the table (`shapeFor`'s own comment) — rather than tapping leading
   * nowhere: the button still opens `ChordPopup`, which says as much on its own.
   */
  const shape = chordDisplay === 'shape' ? shapeFor(chord, instrument) : null

  return (
    <button
      type="button"
      className={
        arming ? 'sheet-chord sheet-chord-target' : marked ? 'sheet-chord is-noted' : 'sheet-chord'
      }
      onClick={arming ? (event) => note.onPlace(pointOf(event.currentTarget)) : () => onPick(chord)}
      aria-label={
        arming
          ? `Add a note on ${label}`
          : shape !== null
            ? `${label}, tap for the fingering`
            : `${label}, show the shape`
      }
    >
      {shape !== null ? (
        <>
          <span className="sheet-chord-name">{label}</span>
          <ChordDiagram shape={shape} capo={capo} className="sheet-chord-shape" />
        </>
      ) : (
        label
      )}
    </button>
  )
}
