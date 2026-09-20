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
 * and — until 2026-09-20 — three links of this app's own, which the format does not have
 * and which one song in two hundred had ever filled in.
 *
 * `{st:}`/`{subtitle:}` left on the same date and for a different reason than `{key:}`: what
 * it means depends on the dialect, so a list that cannot see the dialect is the wrong place
 * to decide. `fieldFor` strips it where it is the artist (OnSong) and keeps it where it is a
 * subtitle (everywhere else) — see `dialect.ts`'s header.

 * `{key:}` left this list on that date: nothing stores it beside the song, so stripping it
 * here deleted the only copy. It is read from the body now (`ParsedSong.key`) and decides
 * the tonic Nashville numbers count from, so the body is its home exactly as it is the
 * tempo's. Everything still listed does have a column of its own. `export.ts` writes every one of
 * these fresh from the row rather than trusting a copy left in the body, so a copy
 * that survived import has no job left: it cannot be shown (the reading layer never
 * prints a directive it recognises), it cannot be exported (the row wins), and the
 * one place it does show up is the visual editor, as a directive chip with nothing
 * behind it to explain. Stripped here for the same reason `export.ts` strips it there.
 */
export const METADATA_DIRECTIVE =
  /^\s*\{\s*(?:title|t|artist|canzoniere|songbook|x_songbook|division|sezione|x_division)\s*:[^}]*\}\s*$/i

export interface Deduced {
  title: string
  artist: string | null
  songbookName: string | null
  sectionName: string | null
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

  return {
    title: parsed.title ?? dialectFields.title ?? heading[0] ?? '',
    artist: parsed.artist ?? dialectFields.artist ?? heading[1] ?? null,
    songbookName: parsed.songbookName ?? dialectFields.songbookName ?? null,
    sectionName: parsed.sectionName ?? dialectFields.sectionName ?? null,
    body: rest,
    dialect,
  }
}

/**
 * Fields whose value this app reads **out of the body**, rather than storing beside it.
 *
 * The exception the rule below needs, and the reason it exists: a song's tempo, its time
 * signature and its capo have no column of their own anywhere — `parseChordPro` reads them
 * off the body every time the song is opened, the metronome starts there (see
 * `ParsedSong.tempo` and `MetronomeProvider`) and the Capo menu states the fret from there
 * (`ParsedSong.capo`). So for these three the body is not a leftover copy, it is the only
 * copy, and stripping the line on the way in would mean a song imported from SongbookPro or
 * OpenSong — both of which write `{tempo: …}` — arriving with its tempo deleted by the
 * importer that had just understood it.
 *
 * **`capo` joined them on 2026-09-19 and its absence was a real defect**, worth naming
 * because it is the shape this list exists to prevent and it still happened. `{capo: 3}` is
 * a `Field` in `dialect.ts`, so `isDroppedDialectDirective` counted it as «read into a
 * column» and deleted the line — while no column takes it. The reader was taught to show
 * the fret the same day, so the feature worked on a song typed into the editor and never on
 * an imported one, which is the only way the directive ever arrives.
 *
 * **The rest joined them on the same day, and the rule is now stated the other way round:
 * a `Field` with no column belongs here, and the list is the whole answer to «what does the
 * importer keep».** `key`, `copyright`, `ccli` and `duration` were each understood, matched
 * to a field, and then deleted from the only copy anybody had — and `copyright` is the one
 * that makes the shape obvious, because an app for songbooks deleting a copyright line is
 * indefensible whatever the architecture says. `subtitle` is here because it too has no
 * column: in an OnSong file `{st:}` still means the artist and is still stripped, which is
 * `fieldFor`'s job and not this list's.
 */
const KEPT_IN_BODY: Field[] = [
  'tempo',
  'timeSignature',
  'capo',
  'key',
  'copyright',
  'ccli',
  'duration',
  'subtitle',
  /*
   * A comment has no column either, and until the twelve test files went through nobody had
   * noticed: `{cb: …}` and `{gc: …}` map to `comment` in the dialects that mean one by them,
   * so the importer read the line, matched it to a field nothing stores, and deleted it.
   * Whatever somebody wrote in that comment was gone.
   */
  'comment',
  /*
   * And `tags` joined them on 2026-09-20, the day the column was dropped — the same hole,
   * opened by the fix for a different one. `{keywords: …}` and `{topic: …}` map to this
   * field in the dialects that mean tags by them, so while `songs.tags` existed the
   * importer read the line, filled the column and deleted the line correctly. With no
   * column left, «understood» became «deleted» and the tag was simply gone: measured, not
   * reasoned — `{keywords: rock}` came back as `[C]parole` with the line removed.
   *
   * Kept rather than rewritten into `{tag: rock}`. This app does not edit somebody's file
   * on the way in, and an export is this repo's restore path; the line survives, which is
   * the promise, even though only `{tag:}` and `{tags:}` are read *as* tags by the reader.
   * That is the same bargain `{album:}` already makes — understood, kept, not acted on.
   */
  'tags',
]

/**
 * Whether a line is a directive this dialect reads into a field of its own, and which
 * therefore has no job left in the body — the same reasoning `METADATA_DIRECTIVE`
 * carries, applied to the names only a dialect knows.
 *
 * A directive that was *understood and dropped* (`fieldFor` → `null`, e.g. `{album:}`)
 * stays in the body deliberately. Nothing here holds an album, and silently deleting a
 * line whose value we chose not to keep would destroy the only copy of it a person has.
 * `KEPT_IN_BODY` is the same principle reached from the other side: understood, kept, and
 * kept *here* — so the line stays for the same reason `{album:}` does.
 */
function isDroppedDialectDirective(line: string, dialect: Dialect): boolean {
  const match = NAMED_DIRECTIVE.exec(line)
  if (match === null) return false

  const field = fieldFor(match[1], dialect)
  return field != null && !KEPT_IN_BODY.includes(field)
}
