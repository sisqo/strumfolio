/**
 * The song's own data, as a form rather than as thirteen rows above the words.
 *
 * The head of a ChordPro file is metadata, and the graphic editor used to draw every line
 * of it the same way it draws a line of lyrics: a stack of chips a musician had to scroll
 * past to reach the first verse. This module is the other reading — the same blocks,
 * grouped by what they mean, so `{key}` sits beside `{capo}` and `{copyright}` sits out of
 * the way.
 *
 * **It is a view over the document, never a second copy of it.** Every field carries the
 * index of the block it came from, and editing one is `setLineText` on that block: one
 * field, one line, in place. Nothing here rebuilds the head, reorders it, or re-emits a
 * line nobody touched — which is what keeps `toSource(fromSource(x)) === x` true of every
 * untouched file, and what keeps a reader's notes on the lines they were left on.
 *
 * **A field is found wherever it is, and is not moved there.** A `{capo: 2}` written in
 * the middle of a song — three of the twelve reference files do something like it — shows
 * up in the form and edits that line where it stands. Hoisting it into the head would
 * rewrite the order of a file whose writer chose it, to buy nothing: the form groups by
 * meaning anyway, so file order is not what anybody is reading here.
 */

import {
  type Block,
  type SongDocument,
  blockStartLines,
  directiveLine,
  directiveParts,
  fromSource,
  toSource,
} from './document'
import { addFieldAt } from './edits'

/** A directive the app reads under more than one spelling; the value is what the form calls it. */
const ALIAS: Record<string, string> = {
  t: 'title',
  st: 'subtitle',
  bpm: 'tempo',
  length: 'duration',
  'ccli-number': 'ccli',
  ccli_number: 'ccli',
  chord: 'define',
  tags: 'tag',
}

/** The name a written directive answers to here — its own, unless it is a known spelling of another. */
export function fieldNameOf(raw: string): string | null {
  const parts = directiveParts(raw)
  if (parts === null) return null

  const name = parts.name.toLowerCase()
  return ALIAS[name] ?? name
}

export interface FieldSpec {
  name: string
  label: string
  /** A value that is not prose — a fingering, a time signature — is shown in the mono face. */
  mono?: boolean
  /**
   * How many of the three columns the field takes.
   *
   * One is the default and what nearly everything wants, so the form reads as a grid three
   * across; `2` is for the one value that is a whole sentence (a copyright notice), and
   * `'full'` for one that is a line of notation in its own right (a fingering). Anything
   * else widened for the sake of it leaves a hole in the row beside it, which is what the
   * first pass looked like in a browser.
   */
  span?: 2 | 'full'
}

export interface GroupSpec {
  title: string
  /** `repeat` groups hold N lines of one directive with their own add and remove. */
  kind: 'single' | 'repeat'
  fields: FieldSpec[]
}

/**
 * The fieldsets.
 *
 * Ordered the way somebody filling one in would go: what the song is, how it is played,
 * the fingerings it brings with it, who owns it, how it is found, how it files.
 *
 * **Songbook and section are deliberately not here**, though the form draws them first.
 * They are columns and not directives, so they have no block to point at and nothing in
 * this module could describe them; the component renders that pair itself, and gives them
 * no directive name beside their labels — which is the form saying, in the one place it
 * can, that those two live outside the file.
 *
 * `tag` and `define` are `repeat` groups because both directives are singular and
 * repeatable: `{tag: rock}` then `{tag: live}`, and a song in an open tuning defines a
 * fingering per chord — one of the reference files carries eleven. A single input would
 * have held the first and destroyed the rest.
 */
export const DATA_GROUPS: GroupSpec[] = [
  {
    title: 'Identity',
    kind: 'single',
    fields: [
      { name: 'title', label: 'Title' },
      { name: 'artist', label: 'Artist' },
      { name: 'subtitle', label: 'Subtitle' },
      { name: 'album', label: 'Album' },
      { name: 'composer', label: 'Composer' },
      { name: 'lyricist', label: 'Lyricist' },
      { name: 'year', label: 'Year' },
    ],
  },
  {
    title: 'Music',
    kind: 'single',
    fields: [
      { name: 'key', label: 'Key' },
      { name: 'capo', label: 'Capo' },
      { name: 'transpose', label: 'Transpose' },
      { name: 'tempo', label: 'Tempo' },
      { name: 'time', label: 'Time' },
      { name: 'duration', label: 'Duration' },
    ],
  },
  {
    title: 'Chord shapes',
    kind: 'repeat',
    fields: [{ name: 'define', label: 'Fingering', mono: true, span: 'full' }],
  },
  {
    title: 'Rights',
    kind: 'single',
    fields: [
      { name: 'copyright', label: 'Copyright', span: 2 },
      { name: 'ccli', label: 'CCLI' },
    ],
  },
  {
    title: 'Finding it',
    kind: 'repeat',
    fields: [{ name: 'tag', label: 'Tag' }],
  },
  {
    title: 'Sorting',
    kind: 'single',
    fields: [
      { name: 'sorttitle', label: 'Sorts as' },
      { name: 'sortartist', label: 'Artist sorts as' },
    ],
  },
]

/** Every name the groups claim, so «anything else» knows what is left. */
const CLAIMED = new Set(DATA_GROUPS.flatMap((group) => group.fields.map((field) => field.name)))

/**
 * Where the head of the file ends: the first block that draws something to a reader.
 *
 * Directives, blank lines and `#` notes are head; a lyric, a comment, a section boundary or
 * a tab is the song starting. Measured against the twelve reference files, which is what
 * settled including `source-comment` — five of them open with a `#` banner, and a rule that
 * stopped at the first one gave every one of those an empty head.
 *
 * Only two things use this: where a brand-new field is written, and which unrecognised
 * directives are metadata rather than layout. A *named* field is found wherever it sits.
 */
export function headEnd(blocks: Block[]): number {
  let at = 0
  while (at < blocks.length) {
    const kind = blocks[at]?.kind
    if (kind === 'lyrics' || kind === 'comment' || kind === 'boundary' || kind === 'tab') break
    at += 1
  }
  return at
}

/**
 * Which block a new field is written *after*; -1 puts it at the very top.
 *
 * The end of the head is not the answer, because a head usually ends in the blank line that
 * separates it from the song: inserting there put `{album: …}` under that blank, detached
 * from the directives it belongs with and leaning against the first verse. So: after the
 * last directive in the head, or failing that after the last line of it that is not blank —
 * a file whose head is a `#` banner and nothing else gets the new line under the banner
 * rather than above it, which is where somebody would have typed it.
 */
export function fieldInsertAfter(blocks: Block[]): number {
  const end = headEnd(blocks)

  for (let at = end - 1; at >= 0; at -= 1) if (blocks[at]?.kind === 'directive') return at
  for (let at = end - 1; at >= 0; at -= 1) if (blocks[at]?.kind !== 'blank') return at

  return -1
}

export interface DataRow {
  name: string
  label: string
  mono: boolean
  span: 1 | 2 | 'full'
  /** The block this value lives on, or null when the song does not carry the field at all. */
  block: number | null
  value: string
}

export interface DataGroupView {
  title: string
  kind: 'single' | 'repeat'
  /** For a repeat group, the directive every row writes. */
  name: string
  label: string
  mono: boolean
  rows: DataRow[]
}

export interface SongData {
  groups: DataGroupView[]
  /**
   * Directives in the head the form has no name for — kept with their own spelling, which
   * is the promise: a field this app never heard of is not lost and not renamed.
   *
   * Head only, and that is the line between metadata and layout. A `{column_break}` or a
   * `{chorus}` in the middle of a song is *positional* — where it sits is its whole
   * meaning — so it stays a row in the editor, where its position is visible. An unknown
   * directive at the top has no position to lose.
   */
  others: DataRow[]
  /** Where a new field line is written. */
  headEnd: number
}

function valueOf(block: Block): string {
  if (block.kind !== 'directive') return ''
  return directiveParts(block.raw)?.value ?? ''
}

/** Reads the whole form off one document. */
export function readSongData(document: SongDocument): SongData {
  const end = headEnd(document.blocks)

  /** Every directive block in the song, by the name it answers to. */
  const found = new Map<string, number[]>()
  document.blocks.forEach((block, index) => {
    if (block.kind !== 'directive') return
    const name = fieldNameOf(block.raw)
    if (name === null) return

    const list = found.get(name)
    if (list === undefined) found.set(name, [index])
    else list.push(index)
  })

  const groups: DataGroupView[] = DATA_GROUPS.map((group) => {
    const first = group.fields[0]!

    if (group.kind === 'repeat') {
      const rows = (found.get(first.name) ?? []).map((index) => ({
        name: first.name,
        label: first.label,
        mono: first.mono === true,
        span: first.span ?? (1 as const),
        block: index,
        value: valueOf(document.blocks[index]!),
      }))

      return {
        title: group.title,
        kind: group.kind,
        name: first.name,
        label: first.label,
        mono: first.mono === true,
        rows,
      }
    }

    const rows = group.fields.map((field) => {
      // The first one wins where a file says the same thing twice: it is the one a reader's
      // parser takes too, so the form edits the line that is actually in force.
      const block = found.get(field.name)?.[0] ?? null

      return {
        name: field.name,
        label: field.label,
        mono: field.mono === true,
        span: field.span ?? (1 as const),
        block,
        value: block === null ? '' : valueOf(document.blocks[block]!),
      }
    })

    return { title: group.title, kind: group.kind, name: first.name, label: first.label, mono: false, rows }
  })

  const others: DataRow[] = []
  for (let index = 0; index < end; index += 1) {
    const block = document.blocks[index]!
    if (block.kind !== 'directive') continue

    const name = fieldNameOf(block.raw)
    if (name === null || CLAIMED.has(name)) continue

    others.push({
      name,
      label: name,
      mono: true,
      span: 'full' as const,
      block: index,
      value: valueOf(block),
    })
  }

  return { groups, others, headEnd: end }
}

/**
 * A field's value changed.
 *
 * Three cases, and the third is the one worth naming: a field the song does not carry yet
 * has no block to write to, so typing into it *creates* the line — at the end of the head,
 * the only place a new directive can go without claiming to know where its writer would
 * have put it. An empty value creates nothing, so tabbing through the form leaves no trail
 * of `{album}` lines behind.
 */
export function setSongField(
  document: SongDocument,
  block: number | null,
  name: string,
  value: string,
): SongDocument {
  if (block !== null) {
    const existing = document.blocks[block]
    if (existing === undefined || existing.kind !== 'directive') return document

    const blocks = [...document.blocks]
    blocks[block] = { kind: 'directive', raw: directiveLine(name, value) }
    return { ...document, blocks }
  }

  if (value.trim() === '') return document

  return addFieldAt(document, fieldInsertAfter(document.blocks), directiveLine(name, value)).document
}

/** A row of a repeat group added — an empty line of that directive, at the end of the head. */
export function addSongField(document: SongDocument, name: string): { document: SongDocument; block: number } {
  return addFieldAt(document, fieldInsertAfter(document.blocks), directiveLine(name, ''))
}

/**
 * A field removed: the line goes, rather than being left as `{tag}` with nothing in it.
 *
 * Rebuilt through the source so the blocks are whatever the remaining lines mean, the same
 * rule `addField` follows — there is one authority on what a line is and it is `fromSource`.
 */
export function removeSongField(document: SongDocument, block: number): SongDocument {
  const existing = document.blocks[block]
  if (existing === undefined || existing.kind !== 'directive') return document

  const lines = toSource(document).split(/\r?\n/)
  const at = blockStartLines(document.blocks)[block]
  if (at === undefined) return document

  // One line, because a directive block is always exactly one — unlike a tab, which is why
  // this counts through `blockStartLines` rather than treating the block index as a line.
  lines.splice(at, 1)
  return { ...fromSource(lines.join(document.eol)), eol: document.eol }
}
