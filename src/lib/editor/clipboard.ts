/**
 * Taking a run of whole lines, and putting text back.
 *
 * A browser `Selection` cannot cross two `<input>` elements, and every line of the
 * graphic editor is an input of its own — the native caret and the phone keyboard
 * are worth more than any hand-written text surface, and that has never been in
 * question. So a selection that spans lines cannot be the browser's; it is a pair of
 * block indices, and the whole of it is here: what leaves as text, what a document
 * looks like with a run gone, and where pasted text lands.
 *
 * All of it pure, so `node:test` can hold it. The components above only turn gestures
 * into these four calls — which is also what keeps the graphic mode and the source
 * mode telling the same story, since both end up as a source string through here.
 */

import { convert } from '../import/convert'
import {
  type Block,
  type SongDocument,
  fromSource,
  readLyricLine,
  toSource,
} from './document'
import { joinLyrics, splitLyrics } from './edits'

/** A run of whole lines, by block index. Either end may be the larger. */
export interface LineRange {
  from: number
  to: number
}

/** Where the caret belongs once an edit has landed. The editor's own `Caret`. */
export interface Landing {
  line: number
  at: number
}

type Boundary = Extract<Block, { kind: 'boundary' }>

/** Both ends inside the document, and in order. */
function clamped(document: SongDocument, range: LineRange): LineRange {
  const last = document.blocks.length - 1
  const low = Math.min(range.from, range.to)
  const high = Math.max(range.from, range.to)

  return {
    from: Math.min(Math.max(low, 0), last),
    to: Math.min(Math.max(high, 0), last),
  }
}

/** The section directive still open just before a line, if any. */
function openBefore(blocks: Block[], index: number): Boundary | null {
  let open: Boundary | null = null

  for (const block of blocks.slice(0, index)) {
    if (block.kind !== 'boundary') continue
    open = block.edge === 'start' ? block : null
  }

  return open
}

/**
 * The directive that closes a section, spelled the way the one that opened it was:
 * `{soc}` is closed by `{eoc}` and `{start_of_chorus}` by `{end_of_chorus}`, so a
 * balanced copy does not mix the two spellings in one song.
 */
function closing(opener: Boundary): Boundary {
  const short = opener.directive.length <= 3
  const directive =
    opener.section === 'chorus'
      ? short
        ? 'eoc'
        : 'end_of_chorus'
      : short
        ? 'eob'
        : 'end_of_bridge'

  return { kind: 'boundary', directive, edge: 'end', section: opener.section }
}

/**
 * The lines of a run, as ChordPro, with the sections they belong to closed.
 *
 * An unclosed **start** is the dangerous half, and the only one balanced here.
 * `sectionsOf` keeps `forced` set until an end directive and the reading parser
 * (`chordpro.ts`) keeps `forcedKind` the same way, so a `{soc}` with no `{eoc}`
 * paints every line after it — to the foot of the song — as chorus. An `{eoc}` that
 * never opened is inert in both: `sectionsOf` marks that one row and clears `forced`,
 * `chordpro.ts` sets `forcedKind` and `section` back to nothing. So a run that begins
 * on the very `{eoc}` closing the section it inherited keeps that orphan, rather than
 * gaining an empty `{soc}` `{eoc}` pair in front of it.
 *
 * The balancing happens here and not on the way in because the text is `text/plain`
 * with three other consumers — the source mode, the import screen, another song — and
 * only a payload that is already whole is right in all of them.
 */
export function copyRange(document: SongDocument, range: LineRange): string {
  const { from, to } = clamped(document, range)
  const taken = document.blocks.slice(from, to + 1)

  const inherited = openBefore(document.blocks, from)
  const first = taken[0]
  const closesAtOnce = first !== undefined && first.kind === 'boundary' && first.edge === 'end'

  let open: Boundary | null = inherited
  for (const block of taken) {
    if (block.kind !== 'boundary') continue
    open = block.edge === 'start' ? block : null
  }

  return toSource({
    ...document,
    blocks: [
      ...(inherited !== null && !closesAtOnce ? [inherited] : []),
      ...taken,
      ...(open !== null ? [closing(open)] : []),
    ],
  })
}

/**
 * The document with a run of lines gone.
 *
 * Exactly the rows taken and nothing else: a `{soc}` whose `{eoc}` was inside the run
 * stays behind, and the chorus tint spreads to the foot of the song until something
 * closes it. That is visible, and it is one Undo away — while deleting a row nobody
 * selected is a surprise that looking cannot undo. `removeLine`'s own floor holds
 * here too: a song always keeps a line to stand on.
 */
export function removeRange(document: SongDocument, range: LineRange): SongDocument {
  const { from, to } = clamped(document, range)
  const blocks = [...document.blocks.slice(0, from), ...document.blocks.slice(to + 1)]

  if (blocks.length === 0) {
    return { ...document, blocks: [{ kind: 'lyrics', text: '', chords: [] }] }
  }

  return { ...document, blocks }
}

/**
 * Pasted text as blocks.
 *
 * Two lines or more go through `convert()` — the import screen's own converter, whose
 * opening comment says it in as many words: it turns pasted text into ChordPro. It
 * recognises ChordPro itself and leaves it alone, merges a line of chords onto the
 * words beneath it by column, turns `[Verse 1]` into a comment and keeps a tab
 * verbatim. That is what makes a page copied off the web arrive already wearing its
 * chords.
 *
 * A single line is read for brackets and nothing else, and `convert()` is deliberately
 * not asked: it is a heuristic built for a page of chords above lyrics, and on one
 * short line it fires — `isChordLine('Am')` is true, so pasting the word «Am» into a
 * verse would take the letters out of the song and leave a chord hanging over the
 * next word. Two lines are where that heuristic earns its keep, and one line is where
 * `readLyricLine` already does everything needed.
 */
function blocksFromText(text: string): Block[] {
  const normalised = text.replace(/\r\n?/g, '\n')

  if (!normalised.includes('\n')) {
    return [{ kind: 'lyrics', ...readLyricLine(normalised) }]
  }

  return fromSource(convert(normalised).body).blocks
}

/** Where the caret goes at the end of a pasted run sitting at `offset`. */
function endOf(blocks: Block[], offset: number): Landing {
  const last = blocks[blocks.length - 1]

  return {
    line: offset + blocks.length - 1,
    at: last !== undefined && last.kind === 'lyrics' ? last.text.length : 0,
  }
}

/**
 * The blocks that replace the one line a paste landed on, and where its caret ends up.
 *
 * The line's kind decides, and it has to: `splitLine` does three different things by
 * kind, and only one of them is what a paste means. On a `comment` it cuts the row
 * into the comment and a **lyrics** block, so pasting into the middle of a comment
 * would quietly turn the rest of it into words to be sung; on a marker, a directive or
 * a tab it ignores the letter entirely and just opens an empty line below. None of
 * those rows has a letter for a caret to be at, so the run lands after them whole.
 *
 * A still-blank row is replaced outright rather than kept above the run: an empty
 * string is what a fresh split or a pressed «+ line» leaves behind (see `fromSource`),
 * so it is the row a paste arrives on most often, and there is nothing on it to keep.
 */
function graft(block: Block, at: number, pasted: Block[]): { blocks: Block[]; caret: Landing } {
  if (block.kind === 'blank') {
    return { blocks: [...pasted], caret: endOf(pasted, 0) }
  }

  if (block.kind !== 'lyrics') {
    return { blocks: [block, ...pasted], caret: endOf(pasted, 1) }
  }

  const [head, tail] = splitLyrics(block, at)
  const run: Block[] = [...pasted]

  // The near seam: the first pasted line continues the head when both are words.
  const first = run[0]
  if (first.kind === 'lyrics') run[0] = joinLyrics(head, first)
  else run.unshift(head)

  /*
   * The far seam, read before it is closed — the caret belongs after the last letter
   * that was pasted, not after the tail that follows it back onto the same line. With
   * a single pasted line the two seams are the same block, already carrying the head.
   */
  const lastIndex = run.length - 1
  const last = run[lastIndex]

  if (last.kind === 'lyrics') {
    const caret = { line: lastIndex, at: last.text.length }
    run[lastIndex] = joinLyrics(last, tail)
    return { blocks: run, caret }
  }

  run.push(tail)
  return { blocks: run, caret: { line: run.length - 1, at: 0 } }
}

/** Text pasted at the caret, with no run of lines taken. */
export function pasteAt(
  document: SongDocument,
  caret: Landing,
  text: string,
): { document: SongDocument; caret: Landing } | null {
  if (text.trim() === '') return null

  const block = document.blocks[caret.line]
  if (block === undefined) return null

  const grafted = graft(block, caret.at, blocksFromText(text))
  const blocks = [...document.blocks]
  blocks.splice(caret.line, 1, ...grafted.blocks)

  return {
    document: { ...document, blocks },
    caret: { line: caret.line + grafted.caret.line, at: grafted.caret.at },
  }
}

/** Text pasted over a run of lines, which it replaces. */
export function pasteOver(
  document: SongDocument,
  range: LineRange,
  text: string,
): { document: SongDocument; caret: Landing } | null {
  if (text.trim() === '') return null

  const { from, to } = clamped(document, range)
  const pasted = blocksFromText(text)

  const blocks = [...document.blocks]
  blocks.splice(from, to - from + 1, ...pasted)

  return { document: { ...document, blocks }, caret: endOf(pasted, from) }
}
