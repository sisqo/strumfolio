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
import { FIELD_OPTIONS } from './fields'

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

/**
 * A directive's name and value, with `{meta: composer X}` read as `{composer: X}` — the
 * format's generic spelling of every metadata item (`Directives-meta.md`), and the reader's
 * reading of it. Until 2026-09-23 the form showed such a line as a field called «meta»
 * holding «composer X», while the Composer field beside it stayed empty.
 */
function fieldParts(raw: string): { name: string; value: string } | null {
  const parts = directiveParts(raw)
  if (parts === null) return null
  if (parts.name.toLowerCase() !== 'meta') return parts

  const inner = /^([a-zA-Z_][a-zA-Z0-9_]*)\s+(.*)$/.exec(parts.value.trim())
  return inner === null ? parts : { name: inner[1], value: inner[2] }
}

/** The name a written directive answers to here — its own, unless it is a known spelling of another. */
export function fieldNameOf(raw: string): string | null {
  const parts = fieldParts(raw)
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
      { name: 'arranger', label: 'Arranger' },
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

/**
 * Fields a song may hold several of — «Multiple arrangers can be specified using multiple
 * directives» (`Directives-arranger.md`), and the same for composers and lyricists. The reader
 * joins them (`chordpro.ts`' `MULTI_VALUED`), so the form draws every line rather than only
 * the first, and typing the name again adds one instead of going to the line already there.
 */
export const MULTI_FIELDS = new Set(['composer', 'lyricist', 'arranger'])

/**
 * Fields whose *position* decides what they mean, so the form owns only the one in the head.
 * A `{transpose}` before the first words is the song's starting transposition; one partway
 * through is a modulation from that point on (decided 2026-09-23, `chordpro.ts`), which the
 * toolbar drops at the caret as «Key change». The form showing it would present a key change
 * in the last chorus as the transposition of the whole song.
 */
const HEAD_ONLY = new Set(['transpose'])

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
  /** The block this value lives on. A row exists only because a line does. */
  block: number
  value: string
}

/** A field the form knows and this song does not carry — what the «add a field» menu offers. */
export interface MissingField {
  group: string
  name: string
  label: string
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
  /** Only the groups with something in them; an empty one is not drawn at all. */
  groups: DataGroupView[]
  /**
   * Every field the form knows that this song does not carry, in the groups' own order —
   * the menu behind «Add a field», and the exact complement of what is on screen.
   *
   * A repeat group counts as missing only while it holds nothing: once a song has one tag
   * the group is drawn and has an «add» of its own, so offering «Tag» in both places would
   * be two buttons for one act.
   */
  missing: MissingField[]
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
  return fieldParts(block.raw)?.value ?? ''
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
    /* A `{transpose}` below the head is a modulation, not the song's transposition — see
       `HEAD_ONLY` — so it stays a row in the song where it stands. */
    if (HEAD_ONLY.has(name) && index >= end) return

    const list = found.get(name)
    if (list === undefined) found.set(name, [index])
    else list.push(index)
  })

  /*
   * **A row exists because a line does.** The form used to draw every field it knows,
   * valued or not, which put nineteen inputs in front of somebody on an ordinary song and
   * fifteen of them empty — the opposite of what the handoff draws, where every field on
   * screen has something in it and the rest live behind «Add a field».
   *
   * The test of «is it there» is the *line*, never the value. A field whose value is empty
   * but whose line exists stays on screen: otherwise clearing a value to retype it would
   * take the field away under the caret, and with `DraftInput` holding the typed draft the
   * rule would have to become «has a value, or has the focus» — an «or» in the one sentence
   * that has to be simple.
   */
  const groups: DataGroupView[] = []
  const missing: MissingField[] = []

  for (const group of DATA_GROUPS) {
    const first = group.fields[0]!

    const rows: DataRow[] = group.fields.flatMap((field) =>
      // Every line for a repeat group and for a field the format lets a song hold more than
      // one of; the first for any other, which is the line a reader's parser takes too, so
      // the form edits what is actually in force.
      (group.kind === 'repeat' || MULTI_FIELDS.has(field.name)
        ? (found.get(field.name) ?? [])
        : (found.get(field.name) ?? []).slice(0, 1)
      ).map((index) => ({
        name: field.name,
        label: field.label,
        mono: field.mono === true,
        span: field.span ?? (1 as const),
        block: index,
        value: valueOf(document.blocks[index]!),
      })),
    )

    if (rows.length > 0) {
      groups.push({
        title: group.title,
        kind: group.kind,
        name: first.name,
        label: first.label,
        mono: first.mono === true,
        rows,
      })
    }

    /*
     * What the menu may offer. A repeat group is offered only while it is empty — once the
     * song has one tag the group is on screen with an «add» of its own, and the menu
     * offering «Tag» beside it would be two buttons for one act.
     */
    for (const field of group.fields) {
      const present = (found.get(field.name) ?? []).length > 0
      if (group.kind === 'repeat' ? rows.length === 0 : !present) {
        missing.push({ group: group.title, name: field.name, label: field.label })
      }
    }
  }

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

  return { groups, missing, others, headEnd: end }
}

/**
 * A field's value changed — one field, one line, in place.
 *
 * **It never creates a line.** Every row on screen exists because a line does, so there is
 * always a block to write to; `addSongField` is the only door in, and going through the
 * menu is what makes a field appear. This used to create on a first keystroke into an
 * always-drawn empty field, which is the shape the form no longer has.
 */
export function setSongField(
  document: SongDocument,
  block: number,
  name: string,
  value: string,
): SongDocument {
  const existing = document.blocks[block]
  if (existing === undefined || existing.kind !== 'directive') return document

  /* A `{meta: …}` line stays one when its value is edited: `{meta: mood happy}` rewritten as
     `{mood: …}` would turn a metadata item into a directive nobody defines. */
  const isMeta = directiveParts(existing.raw)?.name.toLowerCase() === 'meta'
  const blocks = [...document.blocks]
  blocks[block] = {
    kind: 'directive',
    raw: isMeta ? directiveLine('meta', value.trim() === '' ? name : `${name} ${value}`) : directiveLine(name, value),
  }
  return { ...document, blocks }
}

/**
 * A field added: an empty line of that directive at the end of the head, and the block it
 * landed in so the caret can go there.
 *
 * Empty and not absent, because the line *is* the field — writing `{album}` is what puts
 * Album on screen, and the value is typed into it afterwards like any other. The name is
 * whatever the caller passes, which is how «Anything else» gets a field the app has never
 * heard of: nothing here checks the name against a list.
 */
export function addSongField(
  document: SongDocument,
  name: string,
): { document: SongDocument; block: number } {
  return addFieldAt(document, fieldInsertAfter(document.blocks), directiveLine(name, ''))
}

/**
 * Whether a typed name may be added as a field of its own.
 *
 * The same shape a directive name has everywhere else in this repo, minus the conditional's
 * dash-and-selector — a field is a field for the whole song, so `{album-guitar}` from this
 * box would be asking for something the form cannot show. Rejected rather than corrected,
 * because guessing what somebody meant by a name is how `{albm}` becomes a permanent row.
 */
export function isFieldName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name.trim())
}

/**
 * What typing a name into «Another field» does to this song: add a line, go to the line
 * that is already there, or nothing.
 *
 * The shape is not enough, because the box is one door into the same form and every name
 * that comes through it has to end up as a row somebody can see and type into:
 *
 * - **A column is refused** — `title`, `t`, `artist`, `songbook`, `division` and their other
 *   spellings. The form draws those from the songs table and never from a line, and the save
 *   strips the line anyway: the field would be written, stay invisible, and then vanish.
 * - **Anything with a place in the song is refused** — a comment, a section, a tab, and the
 *   toolbar's structure and printing directives. Those are not fields; the toolbar drops them
 *   where the caret is, and written into the head they would draw nothing here.
 * - **A name the form knows is that field**, under the spelling the form uses (`st` is
 *   Subtitle). If the song already carries it, the answer is the line it has — a second
 *   `{key}` would be a line the reader ignores. A repeat group always takes another row.
 * - **Anything else is added as typed**, or found where it already sits in the head.
 */
export type TypedField = { add: string } | { focus: number }

export function typedField(document: SongDocument, typed: string): TypedField | null {
  if (!isFieldName(typed)) return null

  const written = typed.trim()
  const name = fieldNameOf(`{${written}}`)
  if (name === null) return null

  if (METADATA_COLUMNS.has(name)) return null
  if (POSITIONAL.has(name)) return null
  if (fromSource(`{${written}: x}`).blocks[0]?.kind !== 'directive') return null

  const data = readSongData(document)
  const group = DATA_GROUPS.find((one) => one.fields.some((field) => field.name === name))

  if (group !== undefined) {
    if (group.kind === 'repeat' || MULTI_FIELDS.has(name)) return { add: name }

    const drawn = data.groups.flatMap((one) => one.rows).find((row) => row.name === name)
    return drawn === undefined ? { add: name } : { focus: drawn.block }
  }

  const other = data.others.find((row) => row.name === name)
  return other === undefined ? { add: written } : { focus: other.block }
}

/** The directives a column takes, under every spelling the importer strips (`METADATA_DIRECTIVE`). */
const METADATA_COLUMNS = new Set([
  'title',
  'artist',
  'songbook',
  'canzoniere',
  'x_songbook',
  'division',
  'sezione',
  'x_division',
])

/** What the toolbar offers: directives whose position in the song is their meaning. */
const POSITIONAL = new Set(FIELD_OPTIONS.map((option) => option.name).filter((name) => !CLAIMED.has(name)))

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
