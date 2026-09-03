/**
 * A whole sheet moved at once, and the chords of a whole sheet collected at once.
 *
 * Everything in this app that transposes does it one chord at a time, at the moment of
 * drawing it: `readChord` takes a chord and hands back the chord that should be on the page,
 * and the sheet is never rewritten because the source is never the thing being looked at.
 * The public tools reverse that. Somebody arriving at `/tools/chord-transposer` has text and
 * wants text back — the same sheet, in a different key, in a form they can paste into
 * whatever they were using before they found us.
 *
 * So this module is text in, text out, with the music left to the modules that already know
 * it (`chord.ts` for a chord, `convert.ts` for what a chord *line* is). Two functions, one
 * for each tool that needs one, both pure and both here rather than in a component because
 * `npm test` in this repo reaches a module and not a React tree — the same split
 * `blog/shelves.ts` and `plans/testCard.ts` make.
 *
 * **What it deliberately does not do:** re-layout, re-format, or tidy. A sheet comes back as
 * close to how it arrived as the new chord names allow, because a person who pasted their own
 * work wants it back, not our opinion of it. The one place that is impossible is the subject
 * of `crowded` below.
 */

import { chordTokens, parseChordPro } from '../chordpro'
import {
  type InputFormat,
  isChordLine,
  isTabRow,
  looksLikeChordPro,
  looksLikeSungNotes,
  tokens,
} from '../import/convert'
import { type Accidentals, type Chord, formatChord, parseChord, readChord } from './chord'

/**
 * International letters, always, whatever the reader of the app would have chosen.
 *
 * The tool hands back a sheet to be pasted somewhere else, and `A` is the spelling every
 * other program in this corner can read. Italian, German and Nashville are the app's, where a
 * reader chooses one for themselves and nothing leaves the screen — printing `La` into a file
 * somebody will open in OnSong would be exporting our preference as their data. `tonic` is
 * the unread field of the union for this notation (see `Spelling` in `chord.ts`).
 */
const INTERNATIONAL = { notation: 'int', tonic: 0 } as const

/**
 * Punctuation that stands between chords rather than inside one: what a chart written by hand
 * puts there — `Am, F, C, G` — and what a bar-line chart uses — `| Am | F |`.
 *
 * Normalised **only to decide whether a line is a line of chords**, never in the output.
 * `parseChord` rejects `Am,` outright, so without this the commonest paste a transposer
 * receives — four chord names on one line with commas — would read as prose and come back
 * untouched, which is the failure a person notices and never reports.
 *
 * Used twice, on purpose, and the two uses want opposite things: spaces where the tokens have
 * to be readable, and nothing at all where the *spacing* is the evidence being weighed. See
 * `isChordRow`, which is where that trap was walked into and where the test that caught it
 * points.
 */
const SEPARATORS = /[,;|]/g

/** Trailing punctuation on a token, which is a chart's own and not part of the chord. */
const TRAILING = /[,;.]+$/

/**
 * One token of a chord line, split where the chord ends and the chart's punctuation begins.
 *
 * `core` is what `parseChord` is asked about; `trail` is put back untouched. A token that is
 * only punctuation — the `|` of a bar-line chart — has an empty core, parses as nothing, and
 * survives into the output as itself.
 */
function splitToken(text: string): { core: string; trail: string } {
  const trail = TRAILING.exec(text)?.[0] ?? ''
  return { core: trail === '' ? text : text.slice(0, -trail.length), trail }
}

/** The chord this token names, or null when it names something else. */
function chordOf(text: string): Chord | null {
  const { core } = splitToken(text)
  return core === '' ? null : parseChord(core)
}

/**
 * Whether this line is a line of chords, punctuation and all.
 *
 * `isChordLine` does the deciding — every guard it carries is a guard this needs, and a second
 * opinion about what a chord line is would be a second heuristic to keep in step with the
 * converter's. All this adds is the normalisation above, so that a chart's commas and bar
 * lines do not hide the chords from it.
 *
 * Tab is excluded first, on the same precedence `convert` uses: a row of dashes with a string
 * name in front of it is not a chord line, and rewriting the `A` at the start of one would
 * put a chord name into somebody's tablature.
 */
function isChordRow(line: string): boolean {
  if (isTabRow(line)) return false

  /*
   * The sung-notes guard is asked of the line with its separators *removed* rather than
   * spaced out, and that order was found by a failing test rather than reasoned out: turning
   * `do, re, mi` into `do  re  mi` invents the two-space gap that guard reads as evidence of
   * a chord line, so the widening below would have rewritten a line of Italian singing into
   * three chord names. Removing them instead leaves `do re mi`, which the guard still
   * recognises as words. Lyrics read as chords is the worse of the two failures — see
   * `isChordLine` — so it gets the first say.
   */
  if (looksLikeSungNotes(line.replace(SEPARATORS, ''))) return false

  return isChordLine(line.replace(SEPARATORS, ' '))
}

/** What one chord token becomes, moved and respelled. Unparseable tokens come back as they are. */
function moveToken(text: string, semitones: number, accidentals: Accidentals): string {
  const chord = chordOf(text)
  if (chord === null) return text

  return formatChord(readChord(chord, semitones, accidentals), INTERNATIONAL) + splitToken(text).trail
}

interface RowResult {
  text: string
  moved: number
  /** True when a token could not start in its own column — see `transposeSheet`. */
  crowded: boolean
}

/**
 * A line of chords, rewritten with every chord still starting in its own column.
 *
 * The column *is* the information: in the chords-above layout a chord sits over the syllable
 * its column lands on, which is why `convert.ts` reads columns to place brackets and why this
 * has to write them back. Rewriting `A` as `Bb` without minding the columns moves every later
 * chord on the line one character right — over the wrong syllable, silently, on every line
 * where a name grew.
 *
 * So each token is placed at the column it had. When a longer name has eaten the gap that
 * followed it, the next token cannot have its column and is given a single space instead —
 * the least a reader can still parse, and what a person rewriting the line by hand would do.
 * That case sets `crowded`, because it is a real loss and the page says so rather than
 * letting it look like a bug: `A` → `Bb` with one space after it has nowhere to go.
 */
function moveChordRow(line: string, semitones: number, accidentals: Accidentals): RowResult {
  let out = ''
  let moved = 0
  let crowded = false

  for (const token of tokens(line)) {
    if (chordOf(token.text) !== null) moved += 1

    /* The earliest column this token may start in: hard against the left margin for the
       first one, and one space clear of the previous one for every other. Two chords with no
       space between them are one unreadable chord, so this floor comes before the column. */
    const earliest = out.length === 0 ? 0 : out.length + 1

    if (token.col >= earliest) out = out.padEnd(token.col, ' ')
    else {
      out += ' '
      crowded = true
    }

    out += moveToken(token.text, semitones, accidentals)
  }

  return { text: out, moved, crowded }
}

/**
 * Every `[chord]` in a ChordPro line, rewritten in place.
 *
 * Only the brackets that read as chords: `[x2]`, `[Verse 1]` and `[assolo]` are brackets that
 * mean something else, and `looksLikeChordPro` already draws that line the same way — a
 * bracket is a chord when `parseChord` says so and not because it is a bracket.
 */
function moveBrackets(line: string, semitones: number, accidentals: Accidentals): RowResult {
  let moved = 0

  const text = line.replace(/\[([^\]\n]{1,12})\]/g, (whole: string, inner: string) => {
    const chord = parseChord(inner)
    if (chord === null) return whole

    moved += 1
    return `[${formatChord(readChord(chord, semitones, accidentals), INTERNATIONAL)}]`
  })

  return { text, moved, crowded: false }
}

/**
 * `{key: G}`, moved with the chords under it.
 *
 * The one directive transposition invalidates. Nothing in this app reads it — it is not in
 * `chordpro.ts`'s alias table, because no screen here names a key (see `key.ts`) — but other
 * programs write it, `chordpro-explained.mdx` teaches it, and a sheet that comes back with
 * every chord moved and a `{key: G}` still at the top is a sheet that now lies about itself.
 *
 * `key` only, spelled out: no abbreviation, no Italian alias. A directive this does not
 * recognise is left alone, which is the direction that cannot corrupt anything.
 */
function moveKeyDirective(line: string, semitones: number, accidentals: Accidentals): string | null {
  const match = /^(\s*\{\s*key\s*:\s*)([^}]*?)(\s*\}\s*)$/i.exec(line)
  if (match === null) return null

  const chord = parseChord(match[2])
  if (chord === null) return null

  const moved = formatChord(readChord(chord, semitones, accidentals), INTERNATIONAL)
  return `${match[1]}${moved}${match[3]}`
}

/** What came back from a sheet, and what had to be given up to get it there. */
export interface TransposedSheet {
  /** Which layout was recognised — the same three `convert` distinguishes. */
  format: InputFormat
  /** The sheet, moved. */
  text: string
  /** How many chords were rewritten. Zero means nothing here read as one. */
  moved: number
  /**
   * True when at least one chord could not keep its own column, because a longer name had
   * eaten the space in front of the next one. Only possible in the chords-above layout —
   * ChordPro attaches a chord to a syllable and has no columns to lose.
   */
  crowded: boolean
}

/**
 * A sheet in one key, back in another.
 *
 * Three layouts, and the format decides how much can be preserved:
 *
 * - **ChordPro** — every bracketed chord rewritten where it stands. Nothing else is touched,
 *   so the words, the directives, the tab blocks and the blank lines all come back identical.
 *   This is the layout that survives transposition perfectly, which is the argument the blog
 *   makes for the format and is worth making again here in the one place a reader can see it.
 * - **Chords above the words** — the chord lines rewritten by column (`moveChordRow`), the
 *   lyric lines untouched. Alignment survives unless a name grew into the following gap.
 * - **Lyrics only** — nothing read as a chord, so nothing changes and `moved` is 0. The page
 *   says so instead of showing the paste back and letting it look like a broken tool.
 *
 * Line endings and tabs are normalised exactly as `convert` normalises them, and for the same
 * reason: a tab is an unknown number of columns, and column arithmetic on a line containing
 * one is arithmetic on a guess.
 *
 * `semitones` of 0 still respells: that is what the ♯/♭ choice does on a song nobody moved,
 * the same as `readChord`'s own behaviour, and the tool exposes it for the reader who wants
 * `Bb` where their source wrote `A#` and nothing else changed.
 */
export function transposeSheet(text: string, semitones: number, accidentals: Accidentals): TransposedSheet {
  const normalised = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')

  if (looksLikeChordPro(normalised)) {
    const lines = normalised.split('\n')
    let moved = 0

    const out = lines.map((line) => {
      const key = moveKeyDirective(line, semitones, accidentals)
      if (key !== null) return key

      const result = moveBrackets(line, semitones, accidentals)
      moved += result.moved
      return result.text
    })

    return { format: 'chordpro', text: out.join('\n'), moved, crowded: false }
  }

  const lines = normalised.split('\n')
  let moved = 0
  let crowded = false

  const out = lines.map((line) => {
    const key = moveKeyDirective(line, semitones, accidentals)
    if (key !== null) return key

    if (!isChordRow(line)) return line

    const result = moveChordRow(line, semitones, accidentals)
    moved += result.moved
    crowded = crowded || result.crowded
    return result.text
  })

  return {
    format: moved > 0 ? 'chords-above' : 'lyrics-only',
    text: out.join('\n'),
    moved,
    crowded,
  }
}

/**
 * Every distinct chord in a paste, in order of first appearance — what the capo calculator
 * counts and what a key estimate is made from.
 *
 * Two paths, because a paste is one of two things and the app already knows how to read both:
 * a ChordPro song goes through the real parser (`chordTokens`, which deduplicates and skips
 * tab blocks), and anything else is read line by line with the converter's own idea of a
 * chord line.
 *
 * The second path is what makes the capo calculator usable by somebody who has no sheet at
 * all: `Am F C G` typed into the box, or `| Am | F |` copied off a chart, is a chord line by
 * this definition and answers the question they came to ask. `isChordRow`'s guards are what
 * keep a line of words out of the answer.
 */
export function collectChordTokens(text: string): string[] {
  const normalised = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')

  if (looksLikeChordPro(normalised)) return chordTokens(parseChordPro(normalised))

  const seen = new Set<string>()

  for (const line of normalised.split('\n')) {
    if (!isChordRow(line)) continue

    for (const token of tokens(line)) {
      const { core } = splitToken(token.text)
      if (chordOf(token.text) !== null) seen.add(core)
    }
  }

  return [...seen]
}
