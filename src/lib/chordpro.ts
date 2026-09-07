/**
 * ChordPro parser.
 *
 * The output is shaped by one hard requirement from the reading UI: chords sit
 * above the exact syllable they belong to, and a long line must be able to wrap
 * without the alignment drifting. So the parser groups the line into *words*,
 * and each word into chord/text parts. The renderer can then make every word an
 * unbreakable box and let the browser wrap between words, which is the failure
 * mode this layout usually has on a phone.
 */

import { parseTimeSignature, readBpm } from './metronome/tempo'

export interface Part {
  /** Raw chord token from the source, still in international notation. */
  chord: string | null
  text: string
}

export interface Word {
  parts: Part[]
}

export type Line =
  | { kind: 'lyrics'; words: Word[]; hasChords: boolean }
  | { kind: 'comment'; text: string }
  /**
   * A tablature block (`{start_of_tab}` … `{end_of_tab}`), verbatim — every row kept
   * exactly as written, never split into words or read for chords: alignment is the
   * whole point, and a string of dashes is not a syllable to wrap between.
   */
  | { kind: 'tab'; rows: string[] }

export type SectionKind = 'verse' | 'chorus' | 'bridge'

export interface Section {
  kind: SectionKind
  lines: Line[]
}

export interface ParsedSong {
  title: string | null
  artist: string | null
  tags: string[]
  /**
   * Name of the songbook this song *starts* in. Only ever an initial value:
   * the seed applies it on insert, or when the column is still empty, and
   * ignores it afterwards. From then on the database owns the assignment, or a
   * reseed would wipe every rename and move made in the app.
   *
   * Written as `{songbook: ...}`. `{canzoniere: ...}` — this directive's own name
   * before the rename to English — is still read, so an export made before the
   * rename still restores where it belongs.
   */
  songbookName: string | null
  /**
   * Name of the section of that songbook the song *starts* in, on the same terms as
   * the line above: an initial value, never an instruction.
   *
   * Written and read as `{division: ...}`, deliberately not `{section: ...}`. Other
   * tools write that one to mean a block of the song — `{section: chorus}` — and
   * reading it here would file the song into a section called «chorus». `{sezione:
   * ...}` — this app's own directive before the rename to English, kept Italian for
   * the same reason `{section}` doesn't work — is still read, so an export made
   * before the rename still restores where it belongs.
   */
  sectionName: string | null
  /**
   * Three free-form links, each its own slot rather than a joined list — see
   * `songs.link1` in `db/schema.ts` for why a gap between them has to stay a gap.
   * Written and read as `{link1: ...}`, `{link2: ...}`, `{link3: ...}`.
   */
  link1: string | null
  link2: string | null
  link3: string | null
  /**
   * The tempo the song is written at, from `{tempo: 96}` — the metronome's starting
   * point, and nothing else. Null when the song does not say, which is most of them.
   *
   * It stays in the body rather than becoming a column of its own, unlike the title and
   * the links above it: nothing outside the reading screen asks a song for its tempo, and
   * a column would have to be kept in step with a directive that the editor already
   * preserves verbatim and the export already carries through untouched (it is not in
   * `METADATA_DIRECTIVE`, so `toChoproFile` leaves it exactly where the writer put it).
   *
   * `{bpm: 96}` is read as the same thing — the importer's own dialect table already maps
   * the two together, so a file that came in from SongbookPro or OpenSong is read here the
   * way it was read there. A tempo written in words (`{tempo: fast}`, and files do carry
   * that) is null: see `readBpm`.
   */
  tempo: number | null
  /**
   * How many beats are in a bar, from the numerator of `{time: 3/4}` — what the
   * metronome's accent counts, and the only part of a time signature this app has a use
   * for. Null when the song does not say.
   */
  beatsPerBar: number | null
  sections: Section[]
}

// Digits are allowed in the name so the three numbered link directives match too.
const DIRECTIVE = /^\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?::\s*(.*?)\s*)?\}$/

/** Directive aliases, mapped to the canonical name we act on. */
const DIRECTIVE_ALIAS: Record<string, string> = {
  t: 'title',
  title: 'title',
  st: 'artist',
  subtitle: 'artist',
  artist: 'artist',
  tags: 'tags',
  tag: 'tags',
  canzoniere: 'songbookName',
  songbook: 'songbookName',
  division: 'sectionName',
  sezione: 'sectionName',
  link1: 'link1',
  link2: 'link2',
  link3: 'link3',
  /* Read for the metronome, and the one pair of directives here that is read as a number.
     `bpm` is `tempo`'s own alias in the import dialect table too (`import/dialect.ts`), so
     a file is understood the same way whichever door it came in through. */
  tempo: 'tempo',
  bpm: 'tempo',
  time: 'timeSignature',
  c: 'comment',
  comment: 'comment',
  soc: 'start_of_chorus',
  start_of_chorus: 'start_of_chorus',
  eoc: 'end_of_chorus',
  end_of_chorus: 'end_of_chorus',
  sob: 'start_of_bridge',
  start_of_bridge: 'start_of_bridge',
  eob: 'end_of_bridge',
  end_of_bridge: 'end_of_bridge',
  sot: 'start_of_tab',
  start_of_tab: 'start_of_tab',
  eot: 'end_of_tab',
  end_of_tab: 'end_of_tab',
}

export function parseChordPro(source: string): ParsedSong {
  const song: ParsedSong = {
    title: null,
    artist: null,
    tags: [],
    songbookName: null,
    sectionName: null,
    link1: null,
    link2: null,
    link3: null,
    tempo: null,
    beatsPerBar: null,
    sections: [],
  }

  let section: Section | null = null
  let forcedKind: SectionKind | null = null
  /** Rows collected since `{start_of_tab}`, or null when not inside one. */
  let tabRows: string[] | null = null

  const openSection = (kind: SectionKind): Section => {
    const created: Section = { kind, lines: [] }
    song.sections.push(created)
    return created
  }

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trimEnd()

    if (tabRows !== null) {
      const closing = DIRECTIVE.exec(line.trim())
      if (closing && DIRECTIVE_ALIAS[closing[1].toLowerCase()] === 'end_of_tab') {
        section ??= openSection(forcedKind ?? 'verse')
        section.lines.push({ kind: 'tab', rows: tabRows })
        tabRows = null
      } else {
        // Verbatim, not `line`: trailing spaces inside a tab row are as much a
        // part of its alignment as anything else in it.
        tabRows.push(rawLine)
      }
      continue
    }

    const directive = DIRECTIVE.exec(line.trim())
    if (directive) {
      const name = DIRECTIVE_ALIAS[directive[1].toLowerCase()]
      const value = directive[2] ?? ''

      switch (name) {
        case 'title':
          song.title = value || null
          break
        case 'artist':
          song.artist = value || null
          break
        case 'tags':
          song.tags = value
            .split(',')
            .map((tag) => tag.trim())
            .filter((tag) => tag !== '')
          break
        case 'songbookName':
          song.songbookName = value || null
          break
        case 'sectionName':
          song.sectionName = value || null
          break
        case 'link1':
          song.link1 = value || null
          break
        case 'link2':
          song.link2 = value || null
          break
        case 'link3':
          song.link3 = value || null
          break
        /* Narrowed, not stored raw: `readBpm` and `parseTimeSignature` answer null for
           everything that is not a number this can beat, so a directive nobody can play
           leaves the song saying nothing rather than handing the audio clock a `NaN`. */
        case 'tempo':
          song.tempo = readBpm(value)
          break
        case 'timeSignature':
          song.beatsPerBar = parseTimeSignature(value)
          break
        case 'comment':
          section ??= openSection(forcedKind ?? 'verse')
          section.lines.push({ kind: 'comment', text: value })
          break
        case 'start_of_chorus':
          forcedKind = 'chorus'
          section = openSection('chorus')
          break
        case 'start_of_bridge':
          forcedKind = 'bridge'
          section = openSection('bridge')
          break
        case 'start_of_tab':
          tabRows = []
          break
        case 'end_of_chorus':
        case 'end_of_bridge':
          forcedKind = null
          section = null
          break
        default:
          // Unknown directives are ignored rather than shown as lyrics.
          break
      }
      continue
    }

    if (line.trim() === '') {
      // A blank line closes an implicit verse; explicit sections are closed by
      // their own end directive instead.
      if (forcedKind === null) section = null
      continue
    }

    section ??= openSection(forcedKind ?? 'verse')
    section.lines.push(parseLyricLine(line))
  }

  // A tab with no closing directive — malformed, but its rows are real content
  // typed by someone, not something to drop silently for want of a `{end_of_tab}`.
  if (tabRows !== null) {
    section ??= openSection(forcedKind ?? 'verse')
    section.lines.push({ kind: 'tab', rows: tabRows })
  }

  return song
}

/**
 * Splits one line into words and chord/text parts.
 *
 * A chord that is immediately followed by a space attaches to the *next* word
 * rather than hanging over an empty slot — which is what reads correctly for
 * `[Am] Certe notti`. A chord with no following word at all (an instrumental
 * line such as `[C] [F] [G]`) becomes a word of its own.
 */
export function parseLyricLine(line: string): Line {
  const words: Word[] = []
  let parts: Part[] = []
  let text = ''
  let chord: string | null = null
  let deferred: string | null = null
  let hasChords = false

  const flushPart = () => {
    if (chord !== null || text !== '') {
      parts.push({ chord, text })
      chord = null
      text = ''
    }
  }

  const flushWord = () => {
    flushPart()
    if (parts.length > 0) {
      words.push({ parts })
      parts = []
    }
  }

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '[') {
      const close = line.indexOf(']', i)
      if (close === -1) {
        // An unclosed bracket is literal text, not a broken chord.
        text += char
        continue
      }

      const token = line.slice(i + 1, close)
      i = close

      if (deferred !== null) {
        // The previous chord never found a word to sit on; keep it visible.
        words.push({ parts: [{ chord: deferred, text: '' }] })
        deferred = null
      }

      flushPart()
      chord = token
      hasChords = true
      continue
    }

    if (/\s/.test(char)) {
      if (text === '' && chord !== null) {
        // Chord sits right before a space: hold it for the next word.
        deferred = chord
        chord = null
      }
      flushWord()
      continue
    }

    if (text === '' && chord === null && deferred !== null) {
      chord = deferred
      deferred = null
    }
    text += char
  }

  flushWord()

  if (deferred !== null) {
    words.push({ parts: [{ chord: deferred, text: '' }] })
  }

  return { kind: 'lyrics', words, hasChords }
}

/** Lyrics with all chords removed — used to build the search index. */
export function plainLyrics(song: ParsedSong): string {
  const lines: string[] = []

  for (const section of song.sections) {
    for (const line of section.lines) {
      if (line.kind !== 'lyrics') continue
      lines.push(line.words.map((word) => word.parts.map((part) => part.text).join('')).join(' '))
    }
  }
  return lines.join('\n')
}

/** Every distinct chord token in the song, in order of first appearance. */
export function chordTokens(song: ParsedSong): string[] {
  const seen = new Set<string>()

  for (const section of song.sections) {
    for (const line of section.lines) {
      if (line.kind !== 'lyrics') continue
      for (const word of line.words) {
        for (const part of word.parts) {
          if (part.chord !== null) seen.add(part.chord)
        }
      }
    }
  }
  return [...seen]
}
