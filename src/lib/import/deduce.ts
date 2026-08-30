/**
 * Works out title and artist from what was pasted.
 *
 * Directives win when they are there. Otherwise the leading plain lines are read
 * as a heading — which is how chord sites lay a song out — and are *removed from
 * the body*, because a title left in place would render as the first line of the
 * lyrics.
 *
 * The key used to be worked out here too, and is not any more: nothing stores it. The
 * reading layer estimates it from the chords when it needs to spell an accidental, and
 * that estimate is never anybody's to type in or correct.
 */

import { parseChordPro } from '../chordpro'
import { type Dialect, type Field, fieldFor, readOnSongMetatags, sniffDialect } from './dialect'

/**
 * Directives that only ever repeat a column this row already has of its own —
 * title, artist, tags, the songbook and section a re-import declares, the three
 * links, and a key nothing has stored in years. `export.ts` writes every one of
 * these fresh from the row rather than trusting a copy left in the body, so a copy
 * that survived import has no job left: it cannot be shown (the reading layer never
 * prints a directive it recognises), it cannot be exported (the row wins), and the
 * one place it does show up is the visual editor, as a directive chip with nothing
 * behind it to explain. Stripped here for the same reason `export.ts` strips it there.
 */
export const METADATA_DIRECTIVE =
  /^\s*\{\s*(?:title|t|artist|st|subtitle|key|tags?|canzoniere|songbook|division|sezione|link[123])\s*:[^}]*\}\s*$/i

export interface Deduced {
  title: string
  artist: string | null
  tags: string[]
  songbookName: string | null
  sectionName: string | null
  link1: string | null
  link2: string | null
  link3: string | null
  /** The body with any consumed heading lines removed. */
  body: string
  /**
   * Which app's conventions this text was read under — shown on the import screen, not
   * merely recorded. A reader who can see that a file was understood as OnSong can tell
   * at a glance why `{a: …}` became the artist, and a reader who sees «ChordPro» on a
   * file they exported from MobileSheets has been told, before saving, that some of its
   * directives were left alone on purpose.
   */
  dialect: Dialect
}

function isDirective(line: string): boolean {
  return /^\s*\{.*\}\s*$/.test(line)
}

function hasChords(line: string): boolean {
  return /\[[^\]\n]+\]/.test(line)
}

/**
 * How many of the first lines are a heading rather than the song.
 *
 * Only lines before the first blank line and before any line carrying chords,
 * and at most two — one is a title, two is a title and an artist. More than that
 * is not a heading, it is lyrics.
 */
function headingLines(lines: string[]): number {
  let count = 0

  for (const line of lines) {
    if (count >= 2) break
    if (line.trim() === '' || hasChords(line) || isDirective(line)) break
    count++
  }

  // A heading is followed by a break or by the music; two plain lines running
  // straight into more plain lines are verses.
  const next = lines[count]
  if (next !== undefined && next.trim() !== '' && !hasChords(next) && !isDirective(next)) {
    return 0
  }
  return count
}

/** A directive line, split into its name and its value. */
const NAMED_DIRECTIVE = /^\s*\{\s*([a-zA-Z_][a-zA-Z0-9_ -]*?)\s*(?::\s*(.*?)\s*)?\}\s*$/

/**
 * Reads the directives whose meaning depends on which app wrote the file.
 *
 * A pass of its own, kept out of `chordpro.ts` on purpose: that module is the reading
 * layer's parser, used on every song on every page, and it has no business knowing
 * that OnSong exists. Dialects are an import-time concern and this is the import
 * layer, so the dependency points the way it should.
 *
 * Only ever *additive*. Every field this can produce is one `parseChordPro` leaves
 * null for lack of a directive it recognises — `{a:}` and `{book:}` are not in its
 * base table at all — so there is nothing here that can overrule what the standard
 * directives already said. Where both could speak, the standard one wins by being
 * applied second, in `deduce` below.
 */
function readDialectDirectives(lines: string[], dialect: Dialect): Partial<Record<Field, string>> {
  const found: Partial<Record<Field, string>> = {}

  for (const line of lines) {
    const match = NAMED_DIRECTIVE.exec(line)
    if (match === null) continue

    const field = fieldFor(match[1], dialect)
    // `undefined` is «not ours» — `parseChordPro` reads it from the base table.
    // `null` is «understood, and nothing here holds it», which is a decision, not a gap.
    if (field == null) continue

    const value = (match[2] ?? '').trim()
    // First one wins: a file with two `{key:}` lines is telling us about two sections
    // of itself, and the first is the one that describes the song as it opens.
    if (value !== '' && found[field] === undefined) found[field] = value
  }

  return found
}

export function deduce(body: string): Deduced {
  const dialect = sniffDialect(body)

  /*
   * OnSong's `Name: Value` block goes first, and has to: those lines are not
   * directives, so every reader below would take them for lyrics — and `headingLines`
   * would take the first one or two for a heading, making the title the literal string
   * «Title: Amazing Grace». Removed here for exactly the reason a heading is.
   */
  const metatags = readOnSongMetatags(body)
  const afterMetatags = body.split('\n').slice(metatags.consumed).join('\n').replace(/^\n+/, '')

  const parsed = parseChordPro(afterMetatags)
  const lines = afterMetatags.split('\n')

  const consumed = parsed.title === null ? headingLines(lines) : 0
  const heading = lines.slice(0, consumed).map((line) => line.trim())
  const rest = lines
    .slice(consumed)
    .filter((line) => !METADATA_DIRECTIVE.test(line) && !isDroppedDialectDirective(line, dialect))
    .join('\n')
    .replace(/^\n+/, '')

  /*
   * Three sources, and the order between them is the whole point. The metatag block
   * is the most explicit thing a file can say about itself, so it is read first;
   * dialect directives fill what it left empty; and `parseChordPro`'s own standard
   * directives win over both, because `{title:}` means the same thing in every app
   * and a value that needed no dialect to interpret is a value nothing can have
   * misread.
   */
  const fromMetatags: Partial<Record<Field, string>> = {}
  for (const tag of metatags.tags) fromMetatags[tag.field] ??= tag.value

  const dialectFields = { ...readDialectDirectives(lines, dialect), ...fromMetatags }

  const tagList =
    parsed.tags.length > 0
      ? parsed.tags
      : (dialectFields.tags ?? '')
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag !== '')

  return {
    title: parsed.title ?? dialectFields.title ?? heading[0] ?? '',
    artist: parsed.artist ?? dialectFields.artist ?? heading[1] ?? null,
    tags: tagList,
    songbookName: parsed.songbookName ?? dialectFields.songbookName ?? null,
    sectionName: parsed.sectionName ?? dialectFields.sectionName ?? null,
    link1: parsed.link1,
    link2: parsed.link2,
    link3: parsed.link3,
    body: rest,
    dialect,
  }
}

/**
 * Whether a line is a directive this dialect reads into a field of its own, and which
 * therefore has no job left in the body — the same reasoning `METADATA_DIRECTIVE`
 * carries, applied to the names only a dialect knows.
 *
 * A directive that was *understood and dropped* (`fieldFor` → `null`, e.g. `{album:}`)
 * stays in the body deliberately. Nothing here holds an album, and silently deleting a
 * line whose value we chose not to keep would destroy the only copy of it a person has.
 */
function isDroppedDialectDirective(line: string, dialect: Dialect): boolean {
  const match = NAMED_DIRECTIVE.exec(line)
  if (match === null) return false

  const field = fieldFor(match[1], dialect)
  return field != null
}
