'use client'

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { IconCheck } from '@/components/icons'
import {
  type Block,
  type SectionKind,
  type SongDocument,
  chordVocabulary,
  fromSource,
  sectionsOf,
  toSource,
} from '@/lib/editor/document'
import {
  addChord,
  chordIndexAt,
  insertChordAmong,
  insertLineAfter,
  joinLines,
  moveChord,
  moveChordTo,
  removeLine,
  setChord,
  setLineText,
  setTabRows,
  splitLine,
} from '@/lib/editor/edits'
import { nearestSnap } from '@/lib/editor/syllables'

/**
 * Which letter of a line a point falls on.
 *
 * The chords are *positioned* by the browser, using a hidden copy of the words, and
 * that needs no measuring. Going the other way — from a point back to a letter —
 * has no such trick, so this measures with a canvas set to the input's own font. The
 * same measurement, in a test, agrees with the browser's layout to a tenth of a
 * pixel. A tap snaps the result to a syllable (see `nearestSnap`); a drag reads it
 * raw, a letter at a time.
 */
function letterAt(row: HTMLElement, clientX: number): number | null {
  const input = row.parentElement?.querySelector<HTMLInputElement>('.line-input')
  if (input == null) return null

  const context = document.createElement('canvas').getContext('2d')
  if (context === null) return null

  const style = window.getComputedStyle(input)
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`

  const x = clientX - input.getBoundingClientRect().left
  const text = input.value

  let best = 0
  let smallest = Infinity
  for (let at = 0; at <= text.length; at += 1) {
    const gap = Math.abs(context.measureText(text.slice(0, at)).width - x)
    if (gap < smallest) {
      smallest = gap
      best = at
    }
  }

  return best
}

/**
 * The chord whose chip the point landed on or beside, if any, and by how much
 * it missed.
 *
 * Read off the rendered boxes rather than re-derived from the text: each chip
 * carries its chord's index in `data-chord`, so the loose chips — which sit at
 * no letter at all — are reachable by the same rule. The gap comes back with
 * the index because the two gestures forgive differently: a pull owns the
 * nearest chip from a chip's width away, but a plain tap opens one only when
 * it all but hit it — the space *between* two chords has to stay a place where
 * a new one can be added, or two chords a finger apart wall off every letter
 * between them.
 */
function chipAt(row: HTMLElement, clientX: number): { chord: number; gap: number } | null {
  let best: { chord: number; gap: number } | null = null

  for (const chip of row.querySelectorAll<HTMLElement>('.chord-chip')) {
    const box = chip.getBoundingClientRect()
    const gap = Math.max(box.left - clientX, clientX - box.right, 0)
    if (gap <= 16 && (best === null || gap < best.gap)) {
      best = { chord: Number(chip.dataset.chord), gap }
    }
  }

  return best
}

export interface Caret {
  /** Index of the block the cursor is in. */
  line: number
  /** Index into that line's text. */
  at: number
}

/**
 * Where the caret belongs once a chord on this line is the thing being worked on.
 *
 * The line is the half that matters: every command in the toolbar acts on
 * `caret.line` (see `COMMANDS` in `EditorScreen`), so a chord opened on line four
 * while the caret still says line zero pointed `Delete line` at the wrong line —
 * silently, with the focus border and the disabled `Chord` button both agreeing
 * with the stale answer rather than with the finger. The letter is best-effort: the
 * chord's own seat when it has one, clamped to the text, since a trailing chord
 * sits past the last letter by design.
 */
function caretToChord(block: Block, line: number, chord: number): Caret {
  if (block.kind !== 'lyrics') return { line, at: 0 }
  const at = block.chords[chord]?.at ?? block.text.length
  return { line, at: Math.min(at, block.text.length) }
}

/**
 * The song as it will read, with the words editable in place.
 *
 * The words of each line are a real `<input>`: the caret, the selection and the
 * phone keyboard all behave as they should, which no hand-written text surface
 * manages. The chords live in a row above, each pinned to the letter it belongs to
 * by an invisible copy of the same words in the same font — the browser does the
 * measuring, so nothing drifts when the font loads or the theme changes.
 *
 * The source string stays the only state. Every keystroke is source → document →
 * change → source, which is what keeps this mode and the raw mode telling the same
 * story.
 */
export function GraphicEditor({
  source,
  caret,
  editing,
  onChange,
  onCaret,
  onEditing,
}: {
  source: string
  caret: Caret
  /** The chord open for typing, owned above because the toolbar opens one too. */
  editing: { line: number; chord: number } | null
  onChange: (source: string, kind: string | null) => void
  onCaret: (caret: Caret) => void
  onEditing: (editing: { line: number; chord: number } | null) => void
}) {
  const doc = fromSource(source)
  const sections = sectionsOf(doc.blocks)
  const suggestions = chordVocabulary(doc.blocks).slice(0, 8)
  const wanted = useRef<{ line: number; at: number } | null>(null)

  const apply = (next: SongDocument, kind: string | null = null) => onChange(toSource(next), kind)

  /**
   * Focus follows the structure the edit produced, not the element that was there
   * before it: splitting a line means the caret belongs at the start of the new one.
   */
  useEffect(() => {
    const target = wanted.current
    if (target === null) return
    wanted.current = null

    const input = document.querySelector<HTMLInputElement>(
      `[data-line="${target.line}"] .line-input`,
    )
    if (input === null) return

    input.focus()
    input.setSelectionRange(target.at, target.at)
  }, [source])

  return (
    <div>
      {doc.blocks.map((block, index) => (
        <Fragment key={index}>
          <BlockRow
            block={block}
            index={index}
            section={sections[index]}
            focused={caret.line === index}
            editing={editing !== null && editing.line === index ? editing.chord : null}
            suggestions={suggestions}
            onEditChord={(chord) => {
              // Working on a chord is being on that line, so the caret goes with it —
              // see `caretToChord` for what the five line commands would otherwise do.
              if (chord !== null) onCaret(caretToChord(block, index, chord))
              onEditing(chord === null ? null : { line: index, chord })
            }}
            onChordName={(chord, name) => {
              apply(setChord(doc, index, chord, name))
              onEditing(null)
            }}
            onAddChord={(at) => {
              const block = doc.blocks[index]
              if (block.kind !== 'lyrics') return

              onCaret({ line: index, at })
              // Opened for typing straight away: an empty chord is a chord you are
              // in the middle of naming, and leaving it empty takes it back off.
              onEditing({ line: index, chord: chordIndexAt(block.chords, at) })
              apply(addChord(doc, index, at))
            }}
            onInsertChordAmong={(order) => {
              const block = doc.blocks[index]
              if (block.kind !== 'lyrics') return

              // Past the last word, where this gesture lives: the end of the text is
              // the only letter-position that means anything out there.
              onCaret({ line: index, at: block.text.length })
              // The new chord's index is the order itself (see `insertChordAmong`).
              onEditing({ line: index, chord: order })
              apply(insertChordAmong(doc, index, order))
            }}
            onMoveChord={(chord, delta) => {
              const moved = moveChord(doc, index, chord, delta)
              // Passing another chord changes which one this index means.
              onEditing({ line: index, chord: moved.chord })
              apply(moved.document)
            }}
            onMoveChordTo={(chord, at) => {
              // The drop end of a drag: no chord is open for typing while one is
              // being dragged, so only the document moves.
              apply(moveChordTo(doc, index, chord, at).document)
            }}
            onText={(text, at) => {
              onCaret({ line: index, at })

              // Typing into a still-blank row promotes it to a real lyrics one (see
              // `setLineText`), which is a different branch of this same function —
              // a different shape of DOM at this position, not the same `<input>`
              // React would otherwise keep focus on across an ordinary keystroke. The
              // structural-change effect below is what every other reshaping edit
              // already relies on to land the caret back where typing left it.
              if (block.kind === 'blank') wanted.current = { line: index, at }

              apply(setLineText(doc, index, text), `typing:${index}`)
            }}
            onCaret={(at) => onCaret({ line: index, at })}
            onSplit={(at) => {
              wanted.current = { line: index + 1, at: 0 }
              apply(splitLine(doc, index, at))
            }}
            onJoin={() => {
              const previous = doc.blocks[index - 1]
              if (previous === undefined || previous.kind !== 'lyrics') return

              wanted.current = { line: index - 1, at: previous.text.length }
              apply(joinLines(doc, index))
            }}
            onRemove={() => apply(removeLine(doc, index))}
            onBackspaceOut={() => {
              // A still-blank row has nothing of its own: Backspace on it either
              // continues the line above (there is one to continue) or simply takes
              // the row away (there is not) — never both a join and a delete.
              const previous = doc.blocks[index - 1]
              if (previous !== undefined && previous.kind === 'lyrics') {
                wanted.current = { line: index - 1, at: previous.text.length }
                apply(joinLines(doc, index))
              } else {
                apply(removeLine(doc, index))
              }
            }}
            onTabText={(text) => apply(setTabRows(doc, index, text.split('\n')), `tab:${index}`)}
          />
        </Fragment>
      ))}

      {/*
        * A song always offers one more line at the end, so adding a verse never
        * needs a button: press Enter on the last line, or click here.
        */}
      <button
        type="button"
        className="editor-add-line"
        onClick={() => {
          wanted.current = { line: doc.blocks.length, at: 0 }
          apply(insertLineAfter(doc, doc.blocks.length - 1))
        }}
      >
        + line
      </button>
    </div>
  )
}

function BlockRow({
  block,
  index,
  section,
  focused,
  editing,
  suggestions,
  onEditChord,
  onChordName,
  onAddChord,
  onInsertChordAmong,
  onMoveChord,
  onMoveChordTo,
  onText,
  onCaret,
  onSplit,
  onJoin,
  onRemove,
  onBackspaceOut,
  onTabText,
}: {
  block: Block
  index: number
  section: SectionKind
  focused: boolean
  editing: number | null
  suggestions: string[]
  onEditChord: (chord: number | null) => void
  onChordName: (chord: number, name: string) => void
  onAddChord: (at: number) => void
  onInsertChordAmong: (order: number) => void
  onMoveChord: (chord: number, delta: number) => void
  onMoveChordTo: (chord: number, at: number) => void
  onText: (text: string, at: number) => void
  onCaret: (at: number) => void
  onSplit: (at: number) => void
  onJoin: () => void
  onRemove: () => void
  onBackspaceOut: () => void
  onTabText: (text: string) => void
}) {
  const classes = `editor-line is-${section}${focused ? ' is-focused' : ''}`

  /**
   * A blank line, shown as a placeholder rather than a fixed label: a genuine blank
   * line and a freshly split or appended one are the same byte-for-byte empty string
   * (see `fromSource`), so this has to be the same editable row a lyrics line is —
   * not a different affordance a new line could get stuck showing instead of one to
   * type into. `setLineText` promotes it to a real `lyrics` block the moment there
   * is anything typed; until then it round-trips through the file unchanged.
   */
  if (block.kind === 'blank') {
    return (
      <div className={classes} data-line={index}>
        <div className="line-scroll">
          <div className="line-inner">
            <input
              className="line-input"
              value=""
              placeholder="— break —"
              onChange={(event) => onText(event.target.value, event.target.selectionStart ?? 0)}
              onFocus={() => onCaret(0)}
              onClick={() => onCaret(0)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onSplit(0)
                  return
                }

                // Nothing typed yet, so there is nothing for Backspace to cut: it
                // either continues the line above, exactly as Backspace does at the
                // start of any lyrics line, or — with nothing above to continue —
                // takes the row away, finishing the gesture that emptied a lyrics
                // line down to this in the first place.
                if (event.key === 'Backspace' || event.key === 'Delete') {
                  event.preventDefault()
                  onBackspaceOut()
                }
              }}
              aria-label={`Line ${index + 1}, a break`}
            />
          </div>
        </div>

        <button type="button" className="line-remove" onClick={onRemove} aria-label="Delete this break">
          ×
        </button>
      </div>
    )
  }

  /**
   * The lines that are not words and are not blank either: a chorus/bridge marker, a
   * directive. Neither has text of its own a line-input could hold — a marker is a
   * pair of boundaries, a directive is edited in Source — so, unlike a blank line,
   * there is no promotion to a lyrics row here. Each still carries its own × ; the
   * toolbar can delete the line the cursor is on and always could, but nobody found
   * it there. Backspace (or Delete) does the same once the row is focused.
   */
  if (block.kind === 'boundary' || block.kind === 'directive') {
    const section = block.kind === 'boundary' && block.section === 'chorus' ? 'chorus' : 'bridge'

    return (
      <div className={classes} data-line={index}>
        <button
          type="button"
          className="editor-aside flex-1 text-start"
          onClick={() => onCaret(0)}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' || event.key === 'Delete') {
              event.preventDefault()
              onRemove()
            }

            // Neither a chorus/bridge marker nor a directive has text of its own to
            // split, so `at` is never read for this row's kind — a new blank line
            // simply opens after it, the same as pressing Enter at the end of any
            // other line.
            if (event.key === 'Enter') {
              event.preventDefault()
              onSplit(0)
            }
          }}
        >
          {block.kind === 'boundary' && (
            <span className="badge">
              {block.edge === 'start' ? `${section} start` : `${section} end`}
            </span>
          )}

          {/* Shown rather than hidden: it is in the file, so it is on the screen.
              Its text is edited in Source, where a directive is just a line. */}
          {block.kind === 'directive' && <code className="editor-hint">{block.raw.trim()}</code>}
        </button>

        <button
          type="button"
          className="line-remove"
          onClick={onRemove}
          aria-label={block.kind === 'boundary' ? 'Delete this marker' : 'Delete this directive'}
        >
          ×
        </button>
      </div>
    )
  }

  /**
   * A tab, edited as one block of raw monospace text rather than the per-letter
   * chord-and-word model every `lyrics` line uses — alignment is the entire point
   * of a tab, and nothing here should ever read a dash as a syllable to wrap. Enter
   * inside it is a plain newline, a new row of the same tab, not a split into two
   * blocks: unlike a verse, a tab is not a run of independent lines that happen to
   * sit next to each other.
   */
  if (block.kind === 'tab') {
    return (
      <div className={classes} data-line={index}>
        <div className="line-scroll">
          <div className="line-inner">
            <textarea
              className="tab-input"
              value={block.rows.join('\n')}
              wrap="off"
              spellCheck={false}
              rows={Math.max(block.rows.length, 2)}
              onChange={(event) => onTabText(event.target.value)}
              onFocus={() => onCaret(0)}
              onClick={() => onCaret(0)}
              aria-label={`Tab, line ${index + 1}`}
            />
          </div>
        </div>

        <button type="button" className="line-remove" onClick={onRemove} aria-label="Delete this tab">
          ×
        </button>
      </div>
    )
  }

  if (block.kind === 'comment') {
    return (
      <div className={classes} data-line={index}>
        <div className="line-scroll">
          <div className="line-inner">
            <input
              className="line-input italic"
              style={{ color: 'var(--muted)' }}
              value={block.text}
              placeholder="comment"
              onChange={(event) => onText(event.target.value, event.target.selectionStart ?? 0)}
              onFocus={(event) => onCaret(event.currentTarget.selectionStart ?? 0)}
              onClick={(event) => onCaret(event.currentTarget.selectionStart ?? 0)}
              onKeyUp={(event) => onCaret(event.currentTarget.selectionStart ?? 0)}
              onSelect={(event) => onCaret(event.currentTarget.selectionStart ?? 0)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onSplit(event.currentTarget.selectionStart ?? block.text.length)
                  return
                }

                // Same trigger as the blank/boundary/directive rows' own remove: a
                // comment holds text, but an empty one backspaced from its start has
                // nothing left to join into (`joinLines` refuses a comment on either
                // side), so removing the row is the only place that Backspace can go.
                const input = event.currentTarget
                if (
                  (event.key === 'Backspace' || event.key === 'Delete') &&
                  input.selectionStart === 0 &&
                  input.selectionEnd === 0 &&
                  block.text === ''
                ) {
                  event.preventDefault()
                  onRemove()
                }
              }}
              aria-label={`Comment on line ${index + 1}`}
            />
          </div>
        </div>

        <button type="button" className="line-remove" onClick={onRemove} aria-label="Delete this comment">
          ×
        </button>
      </div>
    )
  }

  return (
    <Fragment>
      <div className={classes} data-line={index}>
        <div className="line-scroll">
          <div className="line-inner">
            <ChordRow
              text={block.text}
              chords={block.chords}
              editing={editing}
              focused={focused}
              onEdit={onEditChord}
              onName={onChordName}
              onAddAt={onAddChord}
              onInsertAmong={onInsertChordAmong}
              onMove={onMoveChord}
              onMoveTo={onMoveChordTo}
            />

            <input
              className="line-input"
              value={block.text}
              placeholder={index === 0 ? 'Write the lyrics…' : undefined}
              onChange={(event) => onText(event.target.value, event.target.selectionStart ?? 0)}
              /*
               * Four ways the caret moves, all reported: taking focus, a click that
               * only moves it, the arrow keys, and a selection. The commands act on
               * the line the caret is in, so missing one of these would point them at
               * the wrong line.
               */
              onFocus={(event) => onCaret(event.currentTarget.selectionStart ?? 0)}
              onClick={(event) => onCaret(event.currentTarget.selectionStart ?? 0)}
              onKeyUp={(event) => onCaret(event.currentTarget.selectionStart ?? 0)}
              onSelect={(event) => onCaret(event.currentTarget.selectionStart ?? 0)}
              onKeyDown={(event) => {
                const input = event.currentTarget
                const at = input.selectionStart ?? 0

                if (event.key === 'Enter') {
                  event.preventDefault()
                  onSplit(at)
                  return
                }

                // At the very start, backspace joins this line to the one above,
                // which is what it does in every editor and what nothing else here
                // would do.
                if (event.key === 'Backspace' && at === 0 && input.selectionEnd === 0) {
                  event.preventDefault()
                  onJoin()
                }
              }}
              aria-label={`Text of line ${index + 1}`}
            />
          </div>
        </div>
      </div>

      {/*
        * The controls of the chord being named, on a full-width bar under the line
        * rather than floating over it: `.line-scroll` clips vertically on purpose
        * (see its comment), so anything worth a thumb has to live outside it — and
        * a bar under the row is also where a thumb already is. The suggestions are
        * the song's own chords (see `chordVocabulary`): the chord being typed is
        * almost always one the song already uses, and one tap beats the symbols
        * keyboard. Everything except Done holds the name field's focus
        * (`preventDefault` on the press), so renaming and nudging never fight.
        */}
      {editing !== null && (
        <div className="chord-bar" role="group" aria-label="Chord controls">
          <button
            type="button"
            className="chord-nudge"
            onMouseDown={(event) => {
              event.preventDefault()
              onMoveChord(editing, -1)
            }}
            aria-label="Move the chord one letter left"
          >
            ‹
          </button>
          <button
            type="button"
            className="chord-nudge"
            onMouseDown={(event) => {
              event.preventDefault()
              onMoveChord(editing, 1)
            }}
            aria-label="Move the chord one letter right"
          >
            ›
          </button>

          <div className="chord-suggest">
            {suggestions.map((name) => (
              <button
                key={name}
                type="button"
                className="chord-suggestion"
                onMouseDown={(event) => {
                  event.preventDefault()
                  onChordName(editing, name)
                }}
              >
                {name}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="chord-nudge chord-bar-remove"
            onMouseDown={(event) => {
              event.preventDefault()
              // An empty name is a removed chord, same rule as typing one.
              onChordName(editing, '')
            }}
            aria-label="Remove this chord"
          >
            ×
          </button>
          {/*
            * No handler of its own on the way down: taking focus is the action. The
            * name field commits on blur, which closes the bar before the click even
            * lands; the click below only mops up if focus was already elsewhere.
            */}
          <button
            type="button"
            className="chord-nudge chord-bar-done"
            onClick={() => onEditChord(null)}
            aria-label="Done with this chord"
          >
            <IconCheck size={16} />
          </button>
        </div>
      )}
    </Fragment>
  )
}

/**
 * A chord as shown in a row: a chip to tap open, or the field it opens into.
 * Shared by every layout below — hung from a letter of the ghost, or hung from
 * a `ChordSeat` — since none of that changes what the chord itself looks like.
 */
function ChordChip({
  chord,
  editing,
  dragging,
  lifted,
  suppress,
  onEdit,
  onName,
  onMove,
}: {
  chord: { index: number; name: string }
  editing: number | null
  dragging: boolean
  lifted: boolean
  suppress: { current: boolean }
  onEdit: (chord: number | null) => void
  onName: (chord: number, name: string) => void
  onMove: (chord: number, delta: number) => void
}) {
  if (editing === chord.index) {
    return (
      <ChordField
        name={chord.name}
        onDone={(name) => onName(chord.index, name)}
        onMove={(delta) => onMove(chord.index, delta)}
      />
    )
  }

  const classes = ['chord-chip']
  if (dragging) classes.push('is-dragging')
  if (lifted) classes.push('is-lifted')

  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-chord={chord.index}
      /*
       * The pointer path runs through the row (tap opens, a horizontal pull drags);
       * this click is the keyboard's way in, plus the guard that keeps a click the
       * browser synthesises after that pointer sequence from opening it twice.
       */
      onClick={(event) => {
        event.stopPropagation()
        if (suppress.current) return
        onEdit(chord.index)
      }}
      aria-label={`Chord ${chord.name || 'empty'}, edit`}
    >
      {chord.name || '—'}
    </button>
  )
}

/**
 * A loose chord — trailing past the last letter, or on a wordless line — shown
 * exactly the way an anchored one is: the chip hangs from a zero-width anchor
 * with its bottom on the row's baseline, while a hidden copy of its name holds
 * the room it needs in the flow. The same ruler trick as the ghost; without it
 * these chips sat a descender lower than their anchored neighbours, and the
 * name field they open into resolved its position against the whole row.
 */
function ChordSeat({
  chord,
  editing,
  dragging,
  suppress,
  onEdit,
  onName,
  onMove,
}: {
  chord: { index: number; name: string }
  editing: number | null
  dragging: boolean
  suppress: { current: boolean }
  onEdit: (chord: number | null) => void
  onName: (chord: number, name: string) => void
  onMove: (chord: number, delta: number) => void
}) {
  return (
    <span className="chord-seat">
      <span className="chord-anchor">
        <ChordChip
          chord={chord}
          editing={editing}
          dragging={dragging}
          lifted={false}
          suppress={suppress}
          onEdit={onEdit}
          onName={onName}
          onMove={onMove}
        />
      </span>
      <span className="chord-seat-strut" aria-hidden>
        {chord.name || '—'}
      </span>
    </span>
  )
}

/**
 * The seat past the last chord, made visible on the focused line. Built like a
 * `ChordSeat` so it hangs at the same height as every chip; decoration only —
 * `pointer-events: none` on the seat sends the tap through to the row, which
 * has always known what a tap out here means.
 */
function AddSlot() {
  return (
    <span className="chord-seat chord-add-seat" aria-hidden>
      <span className="chord-anchor">
        <span className="chord-add-slot">+</span>
      </span>
      <span className="chord-seat-strut chord-add-strut">+</span>
    </span>
  )
}

/**
 * The chords of one line.
 *
 * The trick is the hidden copy of the words: the chords are pinned to zero-width
 * anchors sitting between the letters of that copy, so their position comes from
 * the same layout that positions the letters in the input below.
 *
 * A chord at or past `text.length` has no letter left to hang from — it plays
 * after the last word, and there may be several, one after another. Those are
 * laid out as their own row instead, the same `chord-loose` flex the wordless
 * case below uses, because ChordPro itself only keeps their order, never how far
 * past the end each one sits (see `ChordAt.at`) — ties can only ever mean "next".
 *
 * One pointer state machine covers the whole row: a press near a chip owns that
 * chip (a pull of six pixels drags it, a plain lift opens it), a press anywhere
 * else adds a chord on the syllable under the finger. The machine lives on the
 * row rather than on the chips so a finger never has to hit an 18px box exactly.
 */
function ChordRow({
  text,
  chords,
  editing,
  focused,
  onEdit,
  onName,
  onAddAt,
  onInsertAmong,
  onMove,
  onMoveTo,
}: {
  text: string
  chords: { at: number; name: string }[]
  editing: number | null
  focused: boolean
  onEdit: (chord: number | null) => void
  onName: (chord: number, name: string) => void
  onAddAt: (at: number) => void
  onInsertAmong: (order: number) => void
  onMove: (chord: number, delta: number) => void
  onMoveTo: (chord: number, at: number) => void
}) {
  const rowRef = useRef<HTMLDivElement | null>(null)
  const pointer = useRef<{
    id: number
    startX: number
    chord: number | null
    /** How far the press missed that chip; a tap opens it only when small. */
    gap: number
    moved: boolean
    at: number | null
  } | null>(null)
  /** True for the tick the browser's own click takes to follow a pointer lift. */
  const suppress = useRef(false)
  const [dragging, setDragging] = useState<{ chord: number; at: number } | null>(null)
  const [lifted, setLifted] = useState<readonly number[]>([])
  const [fontsReady, setFontsReady] = useState(false)

  /*
   * The lane pass below measures rendered chips, and a measurement taken in the
   * fallback font is wrong the moment the real one arrives.
   */
  useEffect(() => {
    let alive = true
    document.fonts?.ready.then(() => {
      if (alive) setFontsReady(true)
    })
    return () => {
      alive = false
    }
  }, [])

  /*
   * Two chords on the same letter — or long names a letter or two apart — paint
   * over each other, because each hangs from a zero-width anchor and the ghost
   * must never be widened (it mirrors the input; see `.chord-ghost`). So the
   * honest fix is presentational: measure the rendered chips, and lift any that
   * collides into a second lane above, with a hairline leader back down to its
   * letter. The rects are read after layout and only the vertical changes, so
   * one pass settles.
   */
  const chordsKey = chords.map((chord) => `${chord.at}:${chord.name}`).join(' ')
  useLayoutEffect(() => {
    const row = rowRef.current
    if (row === null) return

    /*
     * The trailing group and the ⊕ slot sit in the flow right after the ghost,
     * so an anchored chip cannot ride over them the way it can over empty air:
     * a chip on one of the last letters, wider than the letters it has left —
     * `pallon[mi7]e[la-][sol]` — has to lift, exactly as if the seam were
     * another chip.
     */
    const seam = Math.min(
      row.querySelector('.chord-trailing')?.getBoundingClientRect().left ?? Infinity,
      row.querySelector('.chord-add-slot')?.getBoundingClientRect().left ?? Infinity,
    )

    const lifts: number[] = []
    let groundRight = -Infinity
    // Scoped to the ghost: the seats past it hold chips in anchors too, but
    // those sit in the flow and can never collide or lift.
    for (const chip of row.querySelectorAll<HTMLElement>('.chord-ghost .chord-anchor .chord-chip')) {
      const box = chip.getBoundingClientRect()
      if (box.left >= groundRight - 1 && box.right <= seam + 1) groundRight = box.right
      else lifts.push(Number(chip.dataset.chord))
    }

    setLifted((current) =>
      current.length === lifts.length && current.every((chord, i) => chord === lifts[i])
        ? current
        : lifts,
    )
  }, [chordsKey, editing, dragging, focused, fontsReady])

  /* While a chip is held, its chord shows at the letter under the finger. */
  const shown =
    dragging === null
      ? chords
      : chords.map((chord, index) => (index === dragging.chord ? { ...chord, at: dragging.at } : chord))

  const ordered = shown.map((chord, index) => ({ ...chord, index })).sort((a, b) => a.at - b.at)
  const hasTrailing = ordered.some((chord) => chord.at >= text.length)

  /**
   * How many chips the point passed: the order a new chord slips in at. Where
   * every position is a tie — a wordless line, the run past the last word —
   * "between these two" is the only where there is, and it can only be read off
   * the rendered chips.
   */
  const insertionOrder = (row: HTMLElement, clientX: number): number => {
    let order = 0
    for (const chip of row.querySelectorAll<HTMLElement>('.chord-chip')) {
      const box = chip.getBoundingClientRect()
      if (clientX > (box.left + box.right) / 2) order += 1
    }
    return order
  }

  const releaseClick = () => {
    suppress.current = true
    setTimeout(() => {
      suppress.current = false
    }, 0)
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // With a name field open, a tap on the row is a way out, not a new chord:
    // the field commits on the blur this press causes, and nothing more happens.
    if (editing !== null) return
    if (event.pointerType === 'mouse' && event.button !== 0) return

    const near = chipAt(event.currentTarget, event.clientX)
    pointer.current = {
      id: event.pointerId,
      startX: event.clientX,
      chord: near === null ? null : near.chord,
      gap: near === null ? Infinity : near.gap,
      moved: false,
      at: null,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const held = pointer.current
    if (held === null || event.pointerId !== held.id) return
    if (!held.moved && Math.abs(event.clientX - held.startX) < 6) return
    held.moved = true
    if (held.chord === null) return
    const chord = held.chord

    const row = event.currentTarget
    const at = letterAt(row, event.clientX)
    if (at === null) return
    held.at = at
    setDragging((current) =>
      current !== null && current.chord === chord && current.at === at
        ? current
        : { chord, at },
    )

    // A long line scrolls as one piece; carry it along when the drag reaches an edge.
    const scroll = row.closest<HTMLElement>('.line-scroll')
    if (scroll !== null) {
      const box = scroll.getBoundingClientRect()
      if (event.clientX > box.right - 28) scroll.scrollLeft += 12
      else if (event.clientX < box.left + 28) scroll.scrollLeft -= 12
    }
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const held = pointer.current
    if (held === null || event.pointerId !== held.id) return
    pointer.current = null
    setDragging(null)
    releaseClick()

    if (held.moved) {
      // Letter-precise on purpose: a drag is the fine-placement tool.
      if (held.chord !== null && held.at !== null) onMoveTo(held.chord, held.at)
      return
    }

    // Only an all-but-direct hit opens a chip: the pull above is what gets the
    // wide forgiveness, so the gap between two chords stays a place to add.
    if (held.chord !== null && held.gap <= 6) {
      onEdit(held.chord)
      return
    }

    const at = letterAt(event.currentTarget, event.clientX)
    if (at === null) return

    // A tap aims at a syllable, not a letter: snap it to one. Past the last
    // word the syllables run out and only the order of the chords already out
    // there can say where "here" is.
    const snapped = nearestSnap(text, at)
    if (snapped >= text.length && hasTrailing) {
      onInsertAmong(insertionOrder(event.currentTarget, event.clientX))
      return
    }
    onAddAt(snapped)
  }

  const onPointerCancel = () => {
    pointer.current = null
    setDragging(null)
  }

  /*
   * A line with no words: an intro, a solo, a turnaround.
   *
   * Written `[re] [la] [re] [sol]`, so its "words" are single spaces — and a space is
   * four pixels wide while a chord name is twenty, which piled the whole intro into one
   * illegible smudge at the top of the song. There are no syllables here to align to, so
   * the chords are simply a row of chords, spaced like the words they stand in for.
   * Their order is the only position they have, and the ‹ › on the chord bar reorder
   * them; there is nothing here a drag could say that those cannot.
   */
  if (text.trim() === '') {
    return (
      <div
        ref={rowRef}
        className="chord-row"
        onClick={(event) => {
          // With a name field open, a tap out here only dismisses it (the blur
          // this click causes commits it); nothing new gets added.
          if (editing !== null) return

          // The same two reaches as the ghost rows' pointer logic: a tap opens
          // a chip only when it all but hit it, so the gap between two chords
          // stays the place where a new one slips in — by order, the only
          // position a wordless line has.
          const near = chipAt(event.currentTarget, event.clientX)
          if (near !== null && near.gap <= 6) {
            onEdit(near.chord)
            return
          }
          onInsertAmong(insertionOrder(event.currentTarget, event.clientX))
        }}
        role="presentation"
      >
        <span className="chord-loose">
          {ordered.map((chord) => (
            <ChordSeat
              key={chord.index}
              chord={chord}
              editing={editing}
              dragging={false}
              suppress={suppress}
              onEdit={onEdit}
              onName={onName}
              onMove={onMove}
            />
          ))}
        </span>
        {focused && editing === null && <AddSlot />}
      </div>
    )
  }

  const anchored = ordered.filter((chord) => chord.at < text.length)
  const trailing = ordered.filter((chord) => chord.at >= text.length)

  let cursor = 0
  const pieces: React.ReactNode[] = []

  anchored.forEach((chord, position) => {
    pieces.push(
      <span aria-hidden key={`t${position}`}>
        {text.slice(cursor, chord.at)}
      </span>,
    )
    cursor = chord.at

    pieces.push(
      <span className="chord-anchor" key={`c${chord.index}`}>
        <ChordChip
          chord={chord}
          editing={editing}
          dragging={dragging !== null && dragging.chord === chord.index}
          lifted={lifted.includes(chord.index)}
          suppress={suppress}
          onEdit={onEdit}
          onName={onName}
          onMove={onMove}
        />
      </span>,
    )
  })

  pieces.push(
    <span aria-hidden key="tail">
      {text.slice(cursor)}
    </span>,
  )

  return (
    <div
      ref={rowRef}
      className={`chord-row${lifted.length > 0 ? ' has-lanes' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      role="presentation"
    >
      <span className="chord-ghost">{pieces}</span>
      {trailing.length > 0 && (
        <span className="chord-loose chord-trailing">
          {trailing.map((chord) => (
            <ChordSeat
              key={chord.index}
              chord={chord}
              editing={editing}
              dragging={dragging !== null && dragging.chord === chord.index}
              suppress={suppress}
              onEdit={onEdit}
              onName={onName}
              onMove={onMove}
            />
          ))}
        </span>
      )}
      {/*
        * The seat past the last word, made visible: chords have always been able to
        * live out here (see the note on `ChordAt.at` — the file keeps their order,
        * never a distance), but nothing said so.
        */}
      {focused && editing === null && <AddSlot />}
    </div>
  )
}

/**
 * Typing a chord, and moving it.
 *
 * Empty and confirmed means the chord goes away — that is how one comes off a
 * syllable. The bar under the line carries the visible controls while this is
 * open; Alt+Arrow still moves the chord without leaving the field, for whoever
 * is on a keyboard. The field grows with the name, so `FA#m7` is never edited
 * through a slot half its size.
 */
function ChordField({
  name,
  onDone,
  onMove,
}: {
  name: string
  onDone: (name: string) => void
  onMove: (delta: number) => void
}) {
  const [value, setValue] = useState(name)

  return (
    <span className="chord-editing" onClick={(event) => event.stopPropagation()}>
      <input
        className="chord-field"
        style={{ width: `${Math.max(5, value.length + 2)}ch` }}
        value={value}
        autoFocus
        spellCheck={false}
        autoCapitalize="off"
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => onDone(value)}
        onKeyDown={(event) => {
          // Alt with an arrow moves the chord; the arrows alone move the cursor
          // inside the name, which is what they are for while typing.
          if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            event.preventDefault()
            onMove(event.key === 'ArrowLeft' ? -1 : 1)
            return
          }

          if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault()
            onDone(value)
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onDone(name)
          }
        }}
        aria-label="Chord name"
      />
    </span>
  )
}
