/**
 * The bridge between the two coordinate systems a song has.
 *
 * `SongSheet` renders the *reading* AST — sections, lines, words, parts — and a tap lands
 * on a part. An anchor is stored in the *editor's* coordinates — a block index and a
 * character offset into that block's text. Neither can be computed from the other:
 * `parseLyricLine` consumes whitespace and never stores it (`if (/\s/.test(char)) {
 * flushWord(); continue }`), so joining the parts back up recovers the letters but not the
 * spacing, and an offset derived that way would drift on any line written with two spaces.
 *
 * So the map is built from the source, where both are still true at once: each drawn line is
 * walked against the text of the source lines it was built from, and each part gets the
 * offset it sits at.
 *
 * ## Keyed on the line, because counting stopped being safe
 *
 * This used to be an array, and the screen and the booklet each found a line's notes by
 * counting lyrics lines from the top of the song. That works while every drawn line is a
 * source line and fails silently the moment one is not — `{chorus}` draws a stanza the
 * source states once, a trailing `\` joins two source lines into one drawn one. Either way
 * the two counts slip apart and every note below the slip renders against the wrong line,
 * with nothing missing and nothing thrown.
 *
 * The key is the `Line` object itself, which the booklet already relied on for its own
 * reason: `paginateSong` divides a song into columns and pages by slicing and regrouping,
 * never by cloning, so the same reference survives every split.
 *
 * **Which is why the sections come in as an argument rather than being parsed here.** An
 * identity-keyed map is only useful to a caller holding the very objects it was keyed on,
 * and every screen already has a parse of its own — `useSong`'s on the reading screen,
 * `prepare`'s in the booklet. Parsing a second time inside would build a map whose keys
 * match nothing any caller holds, and every lookup would miss: no notes anywhere, no error
 * anywhere. The test that walks `content/` is what caught exactly that.
 *
 * Built on the server, once, beside the parse that is already happening there.
 */

import { type Line, type Section, unicodeEscapeAt } from '../chordpro'
import { markupTagAt } from '../markup'
import { type Block, blockStartLines, fromSource } from '../editor/document'

import type { CommentTarget, SongComment } from './types'

export interface PartAnchor {
  blockIndex: number
  charOffset: number
}

/**
 * Indexed by the drawn line, then word, then part.
 *
 * Only lyrics lines are in here. Comment lines and tab blocks have no words to anchor
 * into, which is also why a block that stops being lyrics orphans its notes
 * (`reanchor.ts`). A line the source does not contain — a repeated stanza — maps to an
 * empty list rather than being absent, so a caller never has to tell «no notes here» from
 * «this line is not in the map».
 */
export type AnchorMap = Map<Line, PartAnchor[][]>

/** One stretch of source text a drawn line was built from, and the block it belongs to. */
/** What a backslash makes literal — `chordpro.ts`' own set. */
const ESCAPABLE = '[]{}#\\'

interface Segment {
  blockIndex: number
  text: string
  /** Where each `[chord]` of the source line sits in `text`, in order. */
  chords: number[]
}

export function buildAnchorMap(sections: Section[], source: string): AnchorMap {
  const { blocks } = fromSource(source)
  const starts = blockStartLines(blocks)

  const lyricsBySourceLine = new Map<number, { blockIndex: number; block: Block }>()
  blocks.forEach((block, blockIndex) => {
    if (block.kind === 'lyrics') lyricsBySourceLine.set(starts[blockIndex], { blockIndex, block })
  })

  const map: AnchorMap = new Map()

  for (const section of sections) {
    for (const line of section.lines) {
      if (line.kind !== 'lyrics') continue

      const segments: Segment[] = []
      line.sourceLines.forEach((sourceLine, position) => {
        const found = lyricsBySourceLine.get(sourceLine)
        if (found === undefined || found.block.kind !== 'lyrics') return

        /*
         * The backslash that joined this line to the next is in the source and not in the
         * drawn line, so it is not a character the walker may charge anybody for. Dropped
         * from every segment but the last, which is the only one that never carried one.
         */
        const continues = position < line.sourceLines.length - 1
        const text =
          continues && found.block.text.endsWith('\\')
            ? found.block.text.slice(0, -1)
            : found.block.text

        segments.push({ blockIndex: found.blockIndex, text, chords: found.block.chords.map((chord) => chord.at) })
      })

      map.set(line, anchorsFor(line, segments))
    }
  }

  return map
}

/**
 * Where each part of a drawn line sits in the source.
 *
 * Walks the line's own words and parts against the source text they came from, skipping the
 * whitespace the reader dropped. More than one segment is a line the source spells over two
 * lines and the reader joined; none at all is a line the source does not contain, which
 * anchors nothing.
 */
function anchorsFor(line: Extract<Line, { kind: 'lyrics' }>, segments: Segment[]): PartAnchor[][] {
  // A line the source does not contain — a repeated stanza. Its shape is still the drawn
  // line's, so a caller can index into it without checking, and every slot is empty.
  if (segments.length === 0) return line.words.map((word) => word.parts.map(() => null).flatMap(() => []))

  let index = 0
  let cursor = 0

  /*
   * **A chord with no words under it is anchored where the editor puts that chord**, taken in
   * order. Walking the text alone cannot place a chord that has no words under it: on a line
   * like `[D] [F#dim] [G] [A]` the source text is three spaces, the walker skipped them all and
   * fell off the end, and every chord after the first anchored at offset 0 — so a note on the
   * G showed on all four, on screen and in the booklet.
   */
  let chordSegment = 0
  let chordIndex = 0
  const nextChord = (): { segment: number; at: number } | null => {
    while (chordSegment < segments.length) {
      const at = segments[chordSegment].chords[chordIndex]
      if (at !== undefined) {
        chordIndex += 1
        return { segment: chordSegment, at }
      }
      chordSegment += 1
      chordIndex = 0
    }
    return null
  }

  /** Moves past the whitespace between words, and off the end of a segment that is spent. */
  const settle = () => {
    while (index < segments.length) {
      const { text } = segments[index]
      if (cursor >= text.length) {
        index += 1
        cursor = 0
        continue
      }
      /* A markup tag is source and never text (`markup.ts`), so it is walked past like space. */
      const tag = markupTagAt(text, cursor)
      if (tag !== null) {
        cursor += tag.length
        continue
      }
      if (!/\s/.test(text[cursor])) return
      cursor += 1
    }
  }

  return line.words.map((word) => {
    settle()

    return word.parts.map((part) => {
      const chord = part.chord === null ? null : nextChord()
      /*
       * Only for a chord with **no words under it** — the case the text walk cannot place. A
       * chord over words keeps the walker's answer, which is where the words start: the reader
       * moves `del[sol] grande`'s chord onto «grande», one character past the bracket, and the
       * notes already stored on such lines (eleven of them across the 223 songs on dev) are
       * anchored to the word. Every chord is still taken from the list, so the order holds.
       *
       * The word-level settle above may already have walked off the end of a line whose text
       * is only spaces, which is why the chord's position wins over the cursor here.
       */
      if (chord !== null && part.text === '') {
        index = chord.segment
        cursor = chord.at
      } else {
        settle()
      }
      const segment = segments[Math.min(index, segments.length - 1)]
      const anchor = { blockIndex: segment.blockIndex, charOffset: cursor }

      // A part can straddle two segments only where the reader joined two source lines
      // with no space between them; then it anchors where it starts, and the cursor walks
      // on into whichever segment it ends in.
      //
      // Walked a character at a time rather than by length, because the source spells an
      // escaped character with two: `a\#b` is three characters drawn and four written, and
      // charging only three left every later word on the line one character short.
      //
      // By UTF-16 unit, as the source is indexed, and skipping what the source spells without
      // drawing: markup tags between the letters, and the extra characters of an escape
      // (`\#` is one drawn character in two, `\u00e9` one in six).
      for (let at = 0; at < part.text.length; at += 1) {
        const drawn = part.text[at]
        for (;;) {
          while (index < segments.length && cursor >= segments[index].text.length) {
            index += 1
            cursor = 0
          }
          if (index >= segments.length) break
          const tag = markupTagAt(segments[index].text, cursor)
          if (tag === null) break
          cursor += tag.length
        }
        if (index >= segments.length) break
        const text = segments[index].text
        if (text[cursor] === '\\' && text[cursor + 1] === drawn && ESCAPABLE.includes(drawn)) cursor += 2
        else if (unicodeEscapeAt(text, cursor) === drawn) cursor += 6
        else cursor += 1
      }
      if (index < segments.length && cursor >= segments[index].text.length) {
        index += 1
        cursor = 0
      }

      return anchor
    })
  })
}

/**
 * The notes sitting on one exact point, and the number the first of them wears.
 *
 * Shared by the reading screen (`SongSheet`) and the booklet's own rendering
 * (`booklet/document.tsx`), which both walk the same reading AST and need the same
 * answer to "does a part have a note on it, and which one" — a second copy of this scan
 * is exactly the kind of thing that would drift the two silently apart.
 *
 * `comments` must already be in reading order (`inReadingOrder`): the number is the
 * position in that list, never recomputed from anything else.
 */
export function notesAt(
  comments: readonly SongComment[],
  anchor: PartAnchor,
  target: CommentTarget,
): { ids: string[]; number: number } {
  const ids: string[] = []
  let number = 0

  comments.forEach((comment, index) => {
    if (comment.anchor === null) return
    if (
      comment.anchor.blockIndex === anchor.blockIndex &&
      comment.anchor.charOffset === anchor.charOffset &&
      comment.anchor.target === target
    ) {
      if (ids.length === 0) number = index + 1
      ids.push(comment.id)
    }
  })

  return { ids, number }
}
