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
 * So the map is built from the source, where both are still true at once. For each lyrics
 * block the source line is reconstructed with `writeLyricLine` and re-read with the
 * reader's own `parseLyricLine`, which yields exactly the words and parts the sheet will
 * render; walking the block's plain text alongside them — skipping the whitespace the
 * reader dropped — gives each part the offset it sits at.
 *
 * Built on the server, once, beside the parse that is already happening there.
 */

import { parseLyricLine } from '../chordpro'
import { fromSource, writeLyricLine } from '../editor/document'

export interface PartAnchor {
  blockIndex: number
  charOffset: number
}

/**
 * Indexed the way the sheet renders: lyrics line, then word, then part.
 *
 * Only lyrics lines are in here. Comment lines and tab blocks have no words to anchor
 * into, which is also why a block that stops being lyrics orphans its notes
 * (`reanchor.ts`).
 */
export type AnchorMap = PartAnchor[][][]

export function buildAnchorMap(source: string): AnchorMap {
  const map: AnchorMap = []

  fromSource(source).blocks.forEach((block, blockIndex) => {
    if (block.kind !== 'lyrics') return

    const line = parseLyricLine(writeLyricLine(block.text, block.chords))
    if (line.kind !== 'lyrics') return

    const text = block.text
    let cursor = 0

    map.push(
      line.words.map((word) => {
        // The reader dropped the whitespace between words; the block's text still has it.
        while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1

        return word.parts.map((part) => {
          const charOffset = cursor
          cursor += part.text.length
          return { blockIndex, charOffset }
        })
      }),
    )
  })

  return map
}
