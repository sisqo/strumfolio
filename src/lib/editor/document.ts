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
  | { kind: 'comment'; directive: string; text: string }
  /** `{soc}`, `{eoc}`, `{sob}`, `{eob}`, again as written. */
  | { kind: 'boundary'; directive: string; edge: 'start' | 'end'; section: 'chorus' | 'bridge' }
  /** Any other directive, kept verbatim because something else may depend on it. */
  | { kind: 'directive'; raw: string }
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
  | { kind: 'tab'; startDirective: string; endDirective: string | null; rows: string[] }

export interface SongDocument {
  blocks: Block[]
  /** Preserved so a file written on Windows is not rewritten wholesale. */
  eol: '\n' | '\r\n'
}

// Digits are allowed in the name so numbered directives like `{link1: ...}` still
// parse as a directive rather than falling through to a lyrics line — see
// `chordpro.ts`'s own copy of this regex.
const DIRECTIVE = /^\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?::\s*(.*?)\s*)?\}$/

const COMMENT_NAMES = new Set(['c', 'comment'])

const BOUNDARIES: Record<string, { edge: 'start' | 'end'; section: 'chorus' | 'bridge' }> = {
  soc: { edge: 'start', section: 'chorus' },
  start_of_chorus: { edge: 'start', section: 'chorus' },
  eoc: { edge: 'end', section: 'chorus' },
  end_of_chorus: { edge: 'end', section: 'chorus' },
  sob: { edge: 'start', section: 'bridge' },
  start_of_bridge: { edge: 'start', section: 'bridge' },
  eob: { edge: 'end', section: 'bridge' },
  end_of_bridge: { edge: 'end', section: 'bridge' },
}

const TAB_START_NAMES = new Set(['sot', 'start_of_tab'])
const TAB_END_NAMES = new Set(['eot', 'end_of_tab'])

/**
 * Splits one lyric line into plain text and the chords above it.
 *
 * A `[` with no closing bracket is literal text, exactly as the reader treats it,
 * so a line of prose containing a bracket survives a visit to the editor.
 */
export function readLyricLine(line: string): { text: string; chords: ChordAt[] } {
  const chords: ChordAt[] = []
  let text = ''

  for (let i = 0; i < line.length; i++) {
    if (line[i] === '[') {
      const close = line.indexOf(']', i)
      if (close !== -1) {
        chords.push({ at: text.length, name: line.slice(i + 1, close) })
        i = close
        continue
      }
    }
    text += line[i]
  }

  return { text, chords }
}

/** Puts the chords back where they were. */
export function writeLyricLine(text: string, chords: ChordAt[]): string {
  const ordered = [...chords].sort((a, b) => a.at - b.at)
  let out = ''
  let cursor = 0

  for (const chord of ordered) {
    const at = Math.max(0, Math.min(text.length, chord.at))
    out += text.slice(cursor, at) + `[${chord.name}]`
    cursor = at
  }

  return out + text.slice(cursor)
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

    const directive = DIRECTIVE.exec(line.trim())
    if (directive) {
      const name = directive[1].toLowerCase()

      if (TAB_START_NAMES.has(name)) {
        const rows: string[] = []
        let endDirective: string | null = null

        for (i += 1; i < rawLines.length; i += 1) {
          const inner = rawLines[i]
          const innerDirective = DIRECTIVE.exec(inner.trim())
          if (innerDirective && TAB_END_NAMES.has(innerDirective[1].toLowerCase())) {
            endDirective = innerDirective[1]
            break
          }
          rows.push(inner)
        }

        blocks.push({ kind: 'tab', startDirective: directive[1], endDirective, rows })
        continue
      }

      if (COMMENT_NAMES.has(name)) {
        blocks.push({ kind: 'comment', directive: directive[1], text: directive[2] ?? '' })
        continue
      }

      const boundary = BOUNDARIES[name]
      if (boundary) {
        blocks.push({ kind: 'boundary', directive: directive[1], ...boundary })
        continue
      }

      blocks.push({ kind: 'directive', raw: line })
      continue
    }

    blocks.push({ kind: 'lyrics', ...readLyricLine(line) })
  }

  return { blocks, eol }
}

export function toSource(document: SongDocument): string {
  return document.blocks.map((block) => lineOf(block, document.eol)).join(document.eol)
}

function lineOf(block: Block, eol: string): string {
  switch (block.kind) {
    case 'blank':
      return block.raw
    case 'directive':
      return block.raw
    case 'comment':
      return `{${block.directive}: ${block.text}}`
    case 'boundary':
      return `{${block.directive}}`
    case 'lyrics':
      return writeLyricLine(block.text, block.chords)
    case 'tab':
      return [`{${block.startDirective}}`, ...block.rows, `{${block.endDirective ?? 'end_of_tab'}}`].join(
        eol,
      )
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
