/**
 * The song as the editor handles it: one block per line of the source.
 *
 * The reading parser (`chordpro.ts`) throws away what it does not need — unknown
 * directives vanish, spacing between words is not recoverable from its output —
 * which is right for a renderer and fatal for an editor. Saving from here must not
 * quietly rewrite someone's file, so this model keeps every line, in order, and
 * `toSource(fromSource(x))` gives `x` back.
 *
 * That is the invariant the tests hold to, byte for byte, including on the real
 * repertoire: two of those songs carry a `{new_song}` line that the reader ignores
 * and that must survive being edited anyway.
 *
 * The source string stays the single source of truth in the editor. Every change
 * here is source → blocks → change → source, so the graphic mode and the raw mode
 * can never drift apart.
 */

import { unicodeEscapeAt } from '../chordpro'
import { placeholderAt } from '../chordproMeta'
import { matchDirective } from '../directiveLine'
import { markupTagAt } from '../markup'

export type SectionKind = 'verse' | 'chorus' | 'bridge'

/** A chord and the position in the line's text it sits above. */
export interface ChordAt {
  /**
   * Index into the block's `text`, at least 0. A value at or past `text.length`
   * means the chord plays after the last letter — ChordPro has no way to write
   * *how far* past, only the order several such chords come in, so that is all
   * this keeps meaning once it clears the end of the line.
   */
  at: number
  /** Chord as written, e.g. `la` or `F#m`. */
  name: string
}

export type Block =
  | { kind: 'lyrics'; text: string; chords: ChordAt[] }
  /** `{c: ...}`, keeping the spelling the file used. */
  /**
   * `raw` is the line exactly as the file wrote it, and it is what gets written back while
   * the text is untouched. Without it `{c:forte}` came back `{c: forte}` and
   * `{comment Repeat ad lib}` came back `{comment: Repeat ad lib}` — a canonical spelling
   * this module invented, applied to lines nobody had edited, so opening such a song and
   * pressing Save rewrote three lines of somebody's file. Absent on a block this editor
   * built itself, which has no original spelling to keep.
   */
  | { kind: 'comment'; directive: string; text: string; raw?: string }
  /** `{soc}`, `{eoc}`, `{sob}`, `{eob}`, again as written. */
  /**
   * `{soc}`, `{eoc}`, `{sob}`, `{eob}`, again as written — and with the label a section may
   * give itself, which is the whole reason `value` is here.
   *
   * It was dropped until 2026-09-19: `lineOf` wrote the directive back with its name alone,
   * so `{start_of_chorus: Chorus 2}` came out of a visit to the editor as
   * `{start_of_chorus}`. Nothing failed, nothing warned, and the only copy of that label was
   * gone. Caught by the test that round-trips every field the editor offers to add.
   */
  | {
      kind: 'boundary'
      directive: string
      edge: 'start' | 'end'
      section: SectionKind
      value: string
      /** The line as written — see the `comment` block above for why. */
      raw?: string
    }
  /** Any other directive, kept verbatim because something else may depend on it. */
  | { kind: 'directive'; raw: string }
  /**
   * A `#` source comment — a note from whoever wrote the file, which the reader never
   * shows. Verbatim, and a kind of its own rather than a `directive`: the two are
   * preserved identically and read completely differently, and without this it would be
   * a `lyrics` block, offered for editing word by word with its `[` read as a chord.
   */
  | { kind: 'source-comment'; raw: string }
  | { kind: 'blank'; raw: string }
  /**
   * `{start_of_tab}` … `{end_of_tab}`, one block for the whole run rather than one
   * per row: its rows are never lyrics — never split at spaces, never read for
   * chords — so there is nothing for the usual per-line model to do with them.
   * `endDirective` is null only when the source never closed the tab; `lineOf`
   * still writes a closing directive back out regardless (see its own comment),
   * since leaving it open would swallow every line after it into the same tab
   * the next time this is read.
   */
  | {
      kind: 'tab'
      startDirective: string
      /**
       * The name the block gives itself — `{start_of_tab: Solo}`. Empty for the ordinary
       * unnamed block. Kept for the same reason a section's label is: written back without
       * it, the only copy of that name was gone.
       */
      startValue: string
      /** The opening line as written — see the `comment` block above for why. */
      startRaw?: string
      endDirective: string | null
      /**
       * The closing line as written. `{ eot }`, `{eot:}` and an indented `{end_of_tab}` all came
       * back as `{eot}` on the first save — the one line of the block that did not survive.
       */
      endRaw?: string
      rows: string[]
      /**
       * Which of the two verbatim blocks this is — tablature or a chord grid. It decides
       * the closing directive written for a block the source never closed, and nothing
       * else: everything either one needs from an editor is «leave every column where it
       * is», which is the same need twice.
       */
      variant: 'tab' | 'grid' | 'delegate'
    }

/** `Block` narrowed to the one kind that has words and chords of its own. */
export type LyricsBlock = Extract<Block, { kind: 'lyrics' }>

export interface SongDocument {
  blocks: Block[]
  /** Preserved so a file written on Windows is not rewritten wholesale. */
  eol: '\n' | '\r\n'
}

// The reader's own matcher, not a copy of it: a name one parser accepts and the other does not
// is an editable lyrics line offering its `[` as a chord while the reader draws a directive.
const DIRECTIVE = { exec: matchDirective }

/**
 * Every spelling of a comment the format has. They differ only in how a PDF typesetter
 * frames them, which this editor does not do and this app does not draw — so they are
 * one row here, keeping whichever name the file used (`lineOf` writes `directive` back).
 *
 * `cb` joins them only when it has words: the reference implementation reads it as
 * `comment_box`, the documentation also gives it to `column_break`, and a bare `{cb}` can
 * only be the break — so it stays an opaque directive. `chordpro.ts` makes the same cut and
 * carries the long version of this.
 */
const COMMENT_NAMES = new Set(['c', 'comment', 'ci', 'comment_italic', 'comment_box', 'highlight'])

const BOUNDARIES: Record<string, { edge: 'start' | 'end'; section: SectionKind }> = {
  sov: { edge: 'start', section: 'verse' },
  start_of_verse: { edge: 'start', section: 'verse' },
  eov: { edge: 'end', section: 'verse' },
  end_of_verse: { edge: 'end', section: 'verse' },
  soc: { edge: 'start', section: 'chorus' },
  start_of_chorus: { edge: 'start', section: 'chorus' },
  eoc: { edge: 'end', section: 'chorus' },
  end_of_chorus: { edge: 'end', section: 'chorus' },
  sob: { edge: 'start', section: 'bridge' },
  start_of_bridge: { edge: 'start', section: 'bridge' },
  eob: { edge: 'end', section: 'bridge' },
  end_of_bridge: { edge: 'end', section: 'bridge' },
}

/** The two verbatim blocks, and the end directives that close either of them. */
const TAB_START_NAMES = new Set(['sot', 'start_of_tab'])
/* `grille` is the reference implementation's older name for a grid. */
const GRID_START_NAMES = new Set(['sog', 'start_of_grid', 'start_of_grille'])
const TAB_END_NAMES = new Set(['eot', 'end_of_tab', 'eog', 'end_of_grid', 'end_of_grille'])
/**
 * The delegated environments (`{start_of_abc}` and the rest): verbatim like a tab, closed only
 * by their own `{end_of_…}`. The reader draws them the same way (`chordpro.ts`' `DELEGATES`);
 * read as lyrics, an ABC tune's `[CDE]` was a chord offered for editing.
 */
const DELEGATE_START = /^start_of_(abc|ly|svg|textblock|strum)$/

/**
 * `start_of_tab-guitar` → `start_of_tab`. A verbatim block may carry a conditional's selector on
 * its opening and on its closing, and the reader reads it as the same block for that instrument
 * (`chordpro.ts`' `withoutSelector`); taking it for an unknown directive offered its rows as
 * lyrics, a tab's `[3]` as a chord. The line itself is kept whole in `startRaw`/`endRaw`.
 */
function verbatimName(name: string): string {
  const cut = name.indexOf('-')
  return cut === -1 ? name : name.slice(0, cut)
}

/** The characters a backslash makes literal — the same set `chordpro.ts` un-escapes. */
const ESCAPABLE = '[]{}#\\'

/**
 * How many characters starting at `i` the reader takes as one, in the reader's own order
 * (`parseLyricLine`): an escape pair, a `\uXXXX`, a markup tag, a `%{…}` placeholder — or 1.
 *
 * **Nothing inside one of these is a chord to the reader**, so nothing inside one may be a
 * chord here. `a %{x[C]y} b` is a placeholder the reader keeps whole, and `<span
 * foreground="[red]">` a tag it consumes; until 2026-09-25 the editor offered `[C]` and `[red]`
 * as chords in them, and saving from the editor could put a chord inside one where neither
 * parser would ever find it again.
 */
function atomLength(line: string, i: number): number {
  if (line[i] === '\\') {
    if (i + 1 < line.length && ESCAPABLE.includes(line[i + 1])) return 2
    return unicodeEscapeAt(line, i) === null ? 1 : 6
  }
  if (line[i] === '<') return markupTagAt(line, i)?.length ?? 1
  if (line[i] === '%') {
    const end = placeholderAt(line, i)
    return end === null ? 1 : end - i
  }
  return 1
}

/**
 * Splits one lyric line into plain text and the chords above it.
 *
 * A `[` with no closing bracket is literal text, exactly as the reader treats it,
 * so a line of prose containing a bracket survives a visit to the editor.
 *
 * An escape is literal to the reader (`chordpro.ts`' `ESCAPABLE`), so it is literal here:
 * `\[C]` is the text «[C]» and not a chord, and deleting that «chord» in the editor used to
 * corrupt the line. Every character of it, and of the other units `atomLength` names, stays
 * in the text, so the line writes back as it came.
 */
export function readLyricLine(line: string): { text: string; chords: ChordAt[] } {
  const chords: ChordAt[] = []
  let text = ''
  let unclosed = false

  for (let i = 0; i < line.length; ) {
    const length = atomLength(line, i)
    if (length === 1 && line[i] === '[' && !unclosed) {
      /* Remembered, as the reader does: after one `[` finds no `]`, none after it will. */
      const close = line.indexOf(']', i)
      unclosed = close === -1
      if (close !== -1) {
        chords.push({ at: text.length, name: line.slice(i + 1, close) })
        i = close + 1
        continue
      }
    }
    text += line.slice(i, i + length)
    i += length
  }

  return { text, chords }
}

/**
 * Puts the chords back where they were — where the reader will find them again.
 *
 * `text` is the line as the file spells it with the chords taken out, escapes included, so
 * writing is a matter of putting each `[name]` back at its offset. Three places would make a
 * chord something the reader does not read as one, and each is moved rather than written:
 *
 * - **Inside a unit the reader takes whole** (`atomLength`): between `\` and the `#` it
 *   escapes, inside a `%{…}` or a markup tag. The chord goes after the unit. A drag is
 *   letter-precise and can land there.
 * - **Right after a backslash that escapes nothing**, which would pair with the chord's own
 *   `[` into the literal «[». Found on 2026-09-25 in two shapes: `x\\[C]#y` came back
 *   `x\\#[C]y`, because the guard above asked whether the character before was a backslash
 *   and not whether it was one *left over*; and `ab\` with a chord at the end was written
 *   `ab\[G]`, the chord lost. At the end of the line that backslash is a continuation (or a
 *   mark the reader drops) and never drawn, so the chord goes before it: `ab[G]\` keeps both
 *   the chord and the continuation, and a chord at the end of a continued line is played where
 *   the next line starts. Mid-line it is drawn as a backslash, so it is doubled: `a\\[G]b`
 *   draws exactly what `a\b` drew, with the chord where it was put.
 *
 * And a `[` somebody typed is escaped when a `]` follows it, or it would open a chord that
 * swallowed the words up to that bracket: `hello [world` over a chord used to be written
 * `hello [[G]world`. Only then — a `[` read from a file is text precisely because no `]`
 * follows it, and escaping every one would rewrite such a line on its first visit.
 */
export function writeLyricLine(text: string, chords: ChordAt[]): string {
  const length = text.length
  /** Where a chord that lands at `j` goes: `j` itself, or the end of the unit `j` is inside. */
  const settle = Array.from({ length: length + 1 }, (_, j) => j)
  /** A `[` the reader reaches on its own, and a backslash that escapes nothing. */
  const bareOpen: number[] = []
  const lone = new Set<number>()
  for (let i = 0; i < length; ) {
    const size = atomLength(text, i)
    for (let k = i + 1; k < i + size; k += 1) settle[k] = i + size
    if (size === 1 && text[i] === '[') bareOpen.push(i)
    if (size === 1 && text[i] === '\\') lone.add(i)
    i += size
  }

  const placed = [...chords]
    .sort((a, b) => a.at - b.at)
    .map((chord) => {
      let at = settle[Math.max(0, Math.min(length, chord.at))]
      if (at === length && lone.has(at - 1)) at -= 1
      return { at, name: chord.name }
    })
    .sort((a, b) => a.at - b.at)

  const lastChord = placed.length > 0 ? placed[placed.length - 1].at : -1
  const closesAfter = Math.max(text.lastIndexOf(']'), lastChord)
  const escaped = new Set(bareOpen.filter((at) => at < closesAfter))
  const slice = (from: number, to: number) => {
    let piece = ''
    for (let j = from; j < to; j += 1) piece += escaped.has(j) ? `\\${text[j]}` : text[j]
    return piece
  }

  let out = ''
  let cursor = 0
  let doubled = -1
  for (const chord of placed) {
    out += slice(cursor, chord.at)
    if (chord.at > 0 && lone.has(chord.at - 1) && doubled !== chord.at) {
      out += '\\'
      doubled = chord.at
    }
    out += `[${chord.name}]`
    cursor = chord.at
  }

  const written = out + slice(cursor, length)
  /* A line of words that begins with `#` would come back as a source comment, which the reader
     never draws — typed words vanishing from the sheet with no warning. Escaped, it stays a
     line of words for both parsers. */
  return written.startsWith('#') ? `\\${written}` : written
}

export function fromSource(source: string): SongDocument {
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const rawLines = source.split(/\r?\n/)
  const blocks: Block[] = []

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]

    if (line.trim() === '') {
      blocks.push({ kind: 'blank', raw: line })
      continue
    }

    // Tested on the raw line, exactly as `chordpro.ts` tests it: the two have to agree
    // about which lines are comments, or the editor would offer to edit a line the
    // reader is not showing.
    if (line.startsWith('#')) {
      blocks.push({ kind: 'source-comment', raw: line })
      continue
    }

    const directive = DIRECTIVE.exec(line.trim())
    if (directive) {
      const name = directive[1].toLowerCase()

      const opening = verbatimName(name)
      const delegate = DELEGATE_START.exec(opening)?.[1]
      if (TAB_START_NAMES.has(opening) || GRID_START_NAMES.has(opening) || delegate !== undefined) {
        const rows: string[] = []
        let endDirective: string | null = null
        let endRaw: string | undefined
        const closes = (innerName: string) =>
          delegate !== undefined ? innerName === `end_of_${delegate}` : TAB_END_NAMES.has(innerName)

        for (i += 1; i < rawLines.length; i += 1) {
          const inner = rawLines[i]
          const innerDirective = DIRECTIVE.exec(inner.trim())
          if (innerDirective && closes(verbatimName(innerDirective[1].toLowerCase()))) {
            endDirective = innerDirective[1]
            endRaw = inner
            break
          }
          rows.push(inner)
        }

        /*
         * An unclosed block runs to the end of the file, and a file ending in a newline gives
         * it one empty last row that is not a row: kept, it became a blank line of tablature
         * above the closing directive the editor adds, and the file lost its final newline.
         * It goes back where it was, as the blank line after the block.
         */
        const trailingBlank = endDirective === null && rows.length > 0 && rows[rows.length - 1] === ''
        if (trailingBlank) rows.pop()

        blocks.push({
          kind: 'tab',
          startDirective: directive[1],
          startValue: directive[2] ?? '',
          startRaw: line,
          endDirective,
          ...(endRaw === undefined ? {} : { endRaw }),
          rows,
          variant: delegate !== undefined ? 'delegate' : GRID_START_NAMES.has(opening) ? 'grid' : 'tab',
        })
        if (trailingBlank) blocks.push({ kind: 'blank', raw: '' })
        continue
      }

      if (COMMENT_NAMES.has(name) || (name === 'cb' && (directive[2] ?? '').trim() !== '')) {
        blocks.push({ kind: 'comment', directive: directive[1], text: directive[2] ?? '', raw: line })
        continue
      }

      const boundary = BOUNDARIES[name]
      if (boundary) {
        blocks.push({
          kind: 'boundary',
          directive: directive[1],
          ...boundary,
          value: directive[2] ?? '',
          raw: line,
        })
        continue
      }

      blocks.push({ kind: 'directive', raw: line })
      continue
    }

    blocks.push({ kind: 'lyrics', ...readLyricLine(line) })
  }

  return { blocks, eol }
}

/**
 * Which line of the source each block starts on.
 *
 * Here rather than in the one module that needs it (`comments/anchorMap.ts`) because the
 * rule is `fromSource`'s own and nowhere else's: every block is one line, except a tab or a
 * grid, which swallows its start directive, its rows and its end directive into one. Written
 * out a second time somewhere else it would drift the first time a new block kind consumed
 * two lines, and the symptom would be notes landing on the wrong line rather than anything
 * that looks like a bug in a line counter.
 */
/**
 * A directive line split into the name and the value the editor lets somebody type into.
 *
 * Here rather than in the editor because `DIRECTIVE` is this module's regex and the rule for
 * what counts as a name belongs beside it — written out a second time in a component it
 * would drift the first time the format grew a spelling.
 *
 * Null for a line that is not a directive at all.
 */
export function directiveParts(raw: string): { name: string; value: string } | null {
  const match = DIRECTIVE.exec(raw.trim())
  if (match === null) return null

  return { name: match[1], value: match[2] ?? '' }
}

/** The line a directive writes once its value has been typed into. */
export function directiveLine(name: string, value: string): string {
  return value.trim() === '' ? `{${name}}` : `{${name}: ${value}}`
}

export function blockStartLines(blocks: Block[]): number[] {
  const starts: number[] = []
  let line = 0

  for (const block of blocks) {
    starts.push(line)
    line += block.kind === 'tab' ? 1 + block.rows.length + (block.endDirective === null ? 0 : 1) : 1
  }

  return starts
}

export function toSource(document: SongDocument): string {
  return document.blocks.map((block) => lineOf(block, document.eol)).join(document.eol)
}

function lineOf(block: Block, eol: string): string {
  switch (block.kind) {
    case 'blank':
      return block.raw
    case 'directive':
    case 'source-comment':
      return block.raw
    /* `{c}` and `{c: forte}` are both comments and only one of them has a value. Writing
       the colon back regardless turned an empty one into `{c: }` — a line that says the
       same thing in bytes the file never had, which is the one thing this module exists
       not to do.

       `raw` is the rest of that argument, found on 2026-09-20 by reading the whole corpus
       instead of a fixture: the separator is the file's too. `{c:forte}` and
       `{comment Repeat ad lib}` are both legal and neither is what this canonical form
       writes, so an untouched line of either shape was rewritten the moment anybody saved
       the song. An edit drops `raw` (see `setLineText`) and falls through to the canonical
       spelling, which is the right trade: keep what was written, normalise what was typed. */
    case 'comment':
      if (block.raw !== undefined) return block.raw
      return block.text === '' ? `{${block.directive}}` : `{${block.directive}: ${block.text}}`
    case 'boundary':
      if (block.raw !== undefined) return block.raw
      return block.value === '' ? `{${block.directive}}` : `{${block.directive}: ${block.value}}`
    case 'lyrics':
      return writeLyricLine(block.text, block.chords)
    case 'tab':
      return [
        block.startRaw ??
          (block.startValue === ''
            ? `{${block.startDirective}}`
            : `{${block.startDirective}: ${block.startValue}}`),
        ...block.rows,
        block.endRaw ??
          `{${
            block.endDirective ??
            (block.variant === 'grid'
              ? 'end_of_grid'
              : block.variant === 'delegate'
                ? verbatimName(block.startDirective).replace(/^start_of_/i, 'end_of_')
                : 'end_of_tab')
          }}`,
      ].join(eol)
  }
}

/**
 * Which section each block belongs to, by the same rules the reader applies: an
 * explicit start directive wins until its end directive, and otherwise a blank line
 * closes the verse. The editor needs this to show a chorus as a chorus while it is
 * being written.
 */
export function sectionsOf(blocks: Block[]): SectionKind[] {
  let forced: SectionKind | null = null

  return blocks.map((block) => {
    if (block.kind === 'boundary') {
      if (block.edge === 'start') {
        forced = block.section
        return block.section
      }

      const closing = forced ?? block.section
      forced = null
      return closing
    }

    return forced ?? 'verse'
  })
}

/**
 * The chords the song already uses, most frequent first, ties in the order they
 * first appear. The editor offers these while a chord is being named: a song's
 * own vocabulary is almost always the chord being typed, and on a phone one tap
 * beats a trip through the symbols keyboard.
 */
export function chordVocabulary(blocks: Block[]): string[] {
  const counts = new Map<string, number>()

  for (const block of blocks) {
    if (block.kind !== 'lyrics') continue
    for (const { name } of block.chords) {
      const trimmed = name.trim()
      if (trimmed !== '') counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1)
    }
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
}

/**
 * Where the chords of a line end up after its text changes.
 *
 * The edit is reduced to one replaced span: what the old and new text share at the
 * start, what they share at the end, and the difference in between. Anchors before
 * the span stay, anchors after it move by the length delta, and anchors *inside* it
 * collapse to where the span begins rather than disappearing — losing a chord
 * because a word was retyped would be the worst kind of quiet damage.
 *
 * Common prefix and suffix are ambiguous on repeated text: turning `la la` into
 * `la la la` could be read as an insertion at three different points. Any of them
 * keeps every chord and moves only the ones after the change, which is why the rule
 * is stated in terms of the span rather than of an intent that cannot be known.
 */
/**
 * The stretch of `oldText` that was rewritten, as the longest common prefix and
 * suffix leave it, plus how much longer the line got.
 *
 * Split out of `shiftChords` because the comments feature re-anchors on exactly
 * this span and must not compute it a second, drifting way — but decides the
 * *inside* case differently: a chord collapses to `prefix`, a comment orphans
 * (`lib/comments/reanchor.ts`). Same measurement, two policies.
 *
 * An anchor is inside the rewritten span when `prefix <= at < spanEnd`.
 */
export function editedSpan(
  oldText: string,
  newText: string,
): { prefix: number; spanEnd: number; delta: number } {
  let prefix = 0
  while (prefix < oldText.length && prefix < newText.length && oldText[prefix] === newText[prefix]) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < oldText.length - prefix &&
    suffix < newText.length - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix += 1
  }

  return { prefix, spanEnd: oldText.length - suffix, delta: newText.length - oldText.length }
}

export function shiftChords(chords: ChordAt[], oldText: string, newText: string): ChordAt[] {
  if (oldText === newText) return chords

  const { prefix, spanEnd, delta } = editedSpan(oldText, newText)

  return chords.map((chord) => {
    // Strictly before, so text typed at an anchor pushes it along: a chord belongs
    // to the syllable that follows it, and that syllable has just moved.
    if (chord.at < prefix) return chord
    if (chord.at >= spanEnd) return { ...chord, at: chord.at + delta }
    return { ...chord, at: prefix }
  })
}
