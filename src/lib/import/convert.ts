/**
 * Turns pasted text into ChordPro.
 *
 * Chords are almost always published as a line of chord names sitting above the
 * line of lyrics, aligned by column. That is what this converts. It is a
 * heuristic and it will be wrong on some sources, which is why the import screen
 * shows a preview and keeps the converted body editable — the escape hatch is
 * part of the design, not an apology for it.
 */

import { parseChord } from '../music/chord'

export type InputFormat = 'chordpro' | 'chords-above' | 'lyrics-only'

export interface Converted {
  format: InputFormat
  /** ChordPro body, ready to store. */
  body: string
}

export interface Token {
  text: string
  /** Zero-based column where the token starts. */
  col: number
}

/**
 * The non-space runs of a line, each with the column it starts in.
 *
 * Exported for `music/sheet.ts`, which transposes a chord line in place and has to put every
 * chord back in the column it came from — the same fact `merge` below reads to decide which
 * syllable a chord belongs over. One scanner, because two would be two ideas of where a
 * token starts, and the whole chords-above layout is columns.
 */
export function tokens(line: string): Token[] {
  const found: Token[] = []
  const pattern = /\S+/g

  let match: RegExpExecArray | null
  while ((match = pattern.exec(line)) !== null) {
    found.push({ text: match[0], col: match.index })
  }
  return found
}

/** A word that is just an Italian note name, with no accidental and no suffix. */
const BARE_ITALIAN = /^(?:do|re|mi|fa|sol|la|si)[,.;:!?]*$/i

/**
 * True when every token on the line reads as a chord.
 *
 * `parseChord` already refuses ordinary words and annotations, so `Ritornello`
 * and `x2` are not mistaken for music. Requiring *all* tokens to be chords is
 * most of what keeps a lyric line from being read as a chord line.
 *
 * It is not enough on its own, because chords are also readable in Italian: `la
 * la la la` is a line of lyrics in which every token is a valid chord. For a line
 * made *only* of bare note words, the tiebreaker is spacing — a chord line is
 * positioned above syllables, so it has a gap of two or more spaces somewhere,
 * while sung `la la la` does not.
 *
 * The bias is deliberate: a chord line mistaken for lyrics shows up as a stray
 * line the editor can fix, while lyrics mistaken for chords take the words out of
 * the song and hide them above an unrelated line.
 */
export function isChordLine(line: string): boolean {
  const found = tokens(line)
  if (found.length === 0) return false
  if (!found.every((token) => parseChord(token.text) !== null)) return false

  return !looksLikeSungNotes(line)
}

/**
 * A line of bare note words with no wide gap in it: `la la la la`, sung rather than played.
 *
 * The tiebreaker described above, as a predicate of its own so that a second reader can ask
 * the same question of a differently-spaced copy of the same line. `music/sheet.ts` is that
 * reader: it normalises a chart's commas and bar lines into spaces before asking
 * `isChordLine` anything, and that normalisation *invents* the wide gap this guard treats as
 * evidence — `do, re, mi` becomes `do  re  mi` and would be read as three chords. So it asks
 * this of the original spacing instead, and the guard has to be reachable to be asked.
 */
export function looksLikeSungNotes(line: string): boolean {
  const found = tokens(line)
  if (found.length === 0) return false
  if (!found.every((token) => BARE_ITALIAN.test(token.text))) return false

  return !/\S {2,}\S/.test(line)
}

/** A bracketed or colon-terminated label, e.g. `[Verse 1]` or `Ritornello:`. */
function sectionLabel(line: string): string | null {
  const trimmed = line.trim()

  const bracketed = /^\[([^\]]+)\]$/.exec(trimmed)
  if (bracketed !== null && parseChord(bracketed[1]) === null) return bracketed[1].trim()

  const colon = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 '’]{0,24}):$/.exec(trimmed)
  if (colon !== null) return colon[1].trim()

  return null
}

/**
 * Places each chord above the syllable it sits over, by column.
 *
 * Inserted back to front so earlier insertions do not shift the columns still to
 * be used. The lyric line is padded first, so a chord hanging past the end of
 * the words — common on a final ritornello — still lands after them instead of
 * being dropped.
 */
function merge(chordLine: string, lyricLine: string): string {
  const chords = tokens(chordLine)
  if (chords.length === 0) return lyricLine

  const widest = Math.max(...chords.map((token) => token.col))
  let out = lyricLine.padEnd(widest, ' ')

  for (const token of [...chords].reverse()) {
    out = `${out.slice(0, token.col)}[${token.text}]${out.slice(token.col)}`
  }
  return out.trimEnd()
}

/** A chord line with no lyrics under it, e.g. an intro or a solo. */
function chordsOnly(line: string): string {
  return tokens(line)
    .map((token) => `[${token.text}]`)
    .join(' ')
}

function isDirective(line: string): boolean {
  return /^\s*\{.*\}\s*$/.test(line.trim())
}

/**
 * A row of guitar/bass tablature: a string name — "e", "B", "G", "D", "A", "E",
 * optionally sharped/flatted for a drop tuning — followed by "|" and a run of
 * fret numbers, dashes and the usual articulation marks (h/p/b/s/r/x, slides,
 * bends, grace notes). The trailing `-{2,}` check is what tells this apart from
 * a chord line that happens to open with a bare "A" or "G": a run of rest dashes
 * is the one thing every real tab row has and no chord or lyric line ever does.
 */
const TAB_ROW = /^\s{0,4}[A-Ga-g](?:[#b]|\d)?\s*\|[-\d\s/\\()~.<>^hHpPbBrRsStTxX|]*$/

export function isTabRow(line: string): boolean {
  return TAB_ROW.test(line) && /-{2,}/.test(line)
}

/**
 * Detects whether the text is already ChordPro.
 *
 * The test is whether any bracketed token reads as a chord — not merely whether
 * brackets appear, because `[Verse 1]` and `[x2]` are brackets that mean
 * something else entirely.
 */
export function looksLikeChordPro(text: string): boolean {
  for (const match of text.matchAll(/\[([^\]\n]{1,12})\]/g)) {
    if (parseChord(match[1]) !== null) return true
  }
  return false
}

export function convert(text: string): Converted {
  const normalised = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')

  if (looksLikeChordPro(normalised)) {
    return { format: 'chordpro', body: normalised.trim() }
  }

  const lines = normalised.split('\n')
  const out: string[] = []
  let sawChords = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, '')

    if (isDirective(line)) {
      out.push(line.trim())
      continue
    }

    const label = sectionLabel(line)
    if (label !== null) {
      out.push(`{comment: ${label}}`)
      continue
    }

    // A tab block is verbatim, never split at spaces or read for chords, so it
    // has to be pulled out before the chord-line merge below ever sees it —
    // otherwise a chord line sitting above it (e.g. naming the harmony over an
    // intro lick) gets spliced straight into the dashes as bracketed chords.
    if (isTabRow(line)) {
      sawChords = true
      out.push('{start_of_tab}', line)
      while (i + 1 < lines.length && isTabRow(lines[i + 1].replace(/\s+$/, ''))) {
        i++
        out.push(lines[i].replace(/\s+$/, ''))
      }
      out.push('{end_of_tab}')
      continue
    }

    if (isChordLine(line)) {
      sawChords = true
      const next = lines[i + 1] ?? ''

      // A chord line pairs with the words underneath, unless there are none —
      // or unless what follows is tab, which stands on its own.
      if (
        next.trim() !== '' &&
        !isChordLine(next) &&
        sectionLabel(next) === null &&
        !isDirective(next) &&
        !isTabRow(next)
      ) {
        out.push(merge(line, next.replace(/\s+$/, '')))
        i++
      } else {
        out.push(chordsOnly(line))
      }
      continue
    }

    out.push(line)
  }

  // Collapse runs of blank lines: they separate sections, and more than one
  // separator means nothing extra.
  const body = out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { format: sawChords ? 'chords-above' : 'lyrics-only', body }
}
