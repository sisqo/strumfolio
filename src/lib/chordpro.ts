/**
 * ChordPro parser.
 *
 * The output is shaped by one hard requirement from the reading UI: chords sit
 * above the exact syllable they belong to, and a long line must be able to wrap
 * without the alignment drifting. So the parser groups the line into *words*,
 * and each word into chord/text parts. The renderer can then make every word an
 * unbreakable box and let the browser wrap between words, which is the failure
 * mode this layout usually has on a phone.
 *
 * ## How close this is to the published format
 *
 * The reference is <https://www.chordpro.org/chordpro/chordpro-cheat_sheet/>. Everything
 * on that sheet that changes *what a reader sees* is understood here; everything on it
 * that is about **typesetting a PDF** — `{textfont}`, `{columns}`, `{new_page}`,
 * `{image}`, `{define}` and the rest — is deliberately not, because this app lays a song
 * out for a phone held on a music stand and has no page to break. Those fall through to
 * the `default:` branch and are ignored by the reader, while `editor/document.ts` keeps
 * them verbatim, so a file that arrives carrying them leaves carrying them.
 *
 * Two places where this parser knowingly departs from the specification, both older than
 * this comment and both left alone on purpose:
 *
 * - **`{st}`/`{subtitle}` is read as the artist**, which is OnSong's convention and not
 *   the specification's. `import/dialect.ts` argues it at length: on the single most
 *   contested directive in the survey, the value in real files is an artist, and moving
 *   it would change how every already-importable file imports.
 * - **`{songbook}`, `{division}` and `{link1..3}` are this app's own directives**, where
 *   a strict reading says a private extension is spelled `{x_…}`. The `{x_}` spellings
 *   are read too (below) so a file written by a stricter tool is understood; what this
 *   app *writes* is unchanged, because the export is also this repo's restore path and
 *   renaming what it writes would strand every backup already made.
 * - **Line continuation — a line ending in `\` joined to the one after it — is not
 *   read**, and this is the one construct on the cheat sheet that could not be added
 *   without breaking something. Every comment in a song is anchored by its block index in
 *   `editor/document.ts`, which is one block per *source* line; `buildAnchorMap` and the
 *   sheet walk those two lists in step. Joining two source lines into one here makes the
 *   reader's list shorter than the editor's, and from the continuation down every note in
 *   the song renders against the wrong line — silently, since nothing is missing and
 *   nothing throws. Supporting it honestly means teaching `fromSource` to hold the break
 *   so `lineOf` can put it back, which is real machinery for the rarest thing on the
 *   sheet. `chordpro.test.ts` holds the invariant that caught this
 *   («the two parsers agree on how many lyric lines a song has»); a backslash at the end
 *   of a line is therefore an ordinary backslash, and `\\` still escapes one.
 */

import { parseTimeSignature, readBpm } from './metronome/tempo'

export interface Part {
  /**
   * Raw chord token from the source, still in international notation — or, when
   * `annotation` is true, the annotation's text with its leading `*` already removed.
   */
  chord: string | null
  text: string
  /**
   * True when `chord` holds an **annotation** (`[*Capo 3]`) rather than a chord.
   *
   * The two occupy the same slot above the syllable and that is the whole of what they
   * share: an annotation is a word addressed to the player, so it must never be
   * transposed, never be looked up in the chord library, and never reach `chordTokens`
   * — where it would otherwise turn into a fingering diagram for a chord nobody wrote.
   * The flag rather than a separate field because every renderer already reads `chord`,
   * and the ones that care about music are few enough to name.
   *
   * `[*C]` is exactly why this cannot be inferred from the text: an annotation whose
   * words happen to spell a chord is still an annotation, and only the `*` says so.
   */
  annotation?: boolean
}

export interface Word {
  parts: Part[]
}

export type Line =
  | { kind: 'lyrics'; words: Word[]; hasChords: boolean }
  | { kind: 'comment'; text: string }
  /**
   * A verbatim block — every row kept exactly as written, never split into words or read
   * for chords: alignment is the whole point, and a string of dashes is not a syllable to
   * wrap between.
   *
   * Two directives land here. `{start_of_tab}` … `{end_of_tab}` is tablature.
   * `{start_of_grid}` … `{end_of_grid}` is a chord grid (`| Am . . . | F . . . |`), which
   * is a different thing to a musician and the identical thing to a renderer — monospaced,
   * untouched, its columns load-bearing. `variant` exists only so the two can be *named*
   * correctly on screen; nothing downstream treats them differently.
   */
  | { kind: 'tab'; rows: string[]; variant?: 'tab' | 'grid' }

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
   * rename still restores where it belongs. `{x_songbook: ...}` is read as the same
   * thing: it is how the format spells a private directive, so a file that came from a
   * tool strict about that is understood without asking anybody to rename anything.
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
   * before the rename still restores where it belongs. `{x_division: ...}` too, for
   * `songbookName`'s reason.
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

/**
 * One directive on its own line.
 *
 * `-` is in the name charset for the format's own hyphenated spellings (`{ccli-number}`);
 * digits are there so the three numbered link directives match too.
 */
const DIRECTIVE = /^\{\s*([a-zA-Z_][a-zA-Z0-9_-]*)\s*(?::\s*(.*?)\s*)?\}$/

/**
 * `{meta artist Foo}` — the space-separated form, which the regex above cannot match
 * because it has no colon and a space where a colon would go. `{meta: artist Foo}` is
 * the same directive written the other way and *does* match `DIRECTIVE`, so it is taken
 * apart separately once the name is known to be `meta`.
 *
 * Either way the inner name is looked up in the same alias table as a bare directive, so
 * `{meta tempo 96}` and `{tempo: 96}` are one thing said twice.
 */
const META_DIRECTIVE = /^\{\s*meta\s*:?\s+([a-zA-Z_][a-zA-Z0-9_-]*)\s+(.*?)\s*\}$/i

/** `{meta: artist Foo}` once `DIRECTIVE` has already split off the `meta` name. */
const META_VALUE = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s+(.*)$/

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
  x_songbook: 'songbookName',
  division: 'sectionName',
  sezione: 'sectionName',
  x_division: 'sectionName',
  link1: 'link1',
  link2: 'link2',
  link3: 'link3',
  x_link1: 'link1',
  x_link2: 'link2',
  x_link3: 'link3',
  /* Read for the metronome, and the one pair of directives here that is read as a number.
     `bpm` is `tempo`'s own alias in the import dialect table too (`import/dialect.ts`), so
     a file is understood the same way whichever door it came in through. */
  tempo: 'tempo',
  bpm: 'tempo',
  time: 'timeSignature',
  /* Every shape of comment the format defines collapses to one here. `comment_italic` and
     `comment_box` differ from `comment` only in how a PDF typesetter draws the box around
     them, and this app draws no box; `highlight` is the same sentence again under a third
     name. Losing the distinction costs nothing a reader can see — but they must not fall
     through to the `default:` branch, which would drop the sentence itself.

     **`cb` is not among them**, and it is the one abbreviation here that looks like it
     should be. In the specification `cb` is `{column_break}`, a layout directive; only
     `comment_italic` has a short form (`ci`), and `comment_box` has none. Reading `cb` as
     a comment turns a column break into an empty comment line — a blank gap in the middle
     of a song, where ignoring it leaves nothing at all, which is right for an app with no
     page to break. `import/dialect.ts` *does* map it to a comment and that is not a
     contradiction: that table is a survey of what other apps mean by it (OnSong's
     `comment_bold`, MobileSheets' `comment_box`) and governs reading their files, where
     this one governs reading the format. */
  c: 'comment',
  comment: 'comment',
  ci: 'comment',
  comment_italic: 'comment',
  comment_box: 'comment',
  highlight: 'comment',
  /* The section directives. `{chorus}` is not one of them: it is a *reference* to the
     chorus rather than a block, and is handled on its own below. */
  sov: 'start_of_verse',
  start_of_verse: 'start_of_verse',
  eov: 'end_of_verse',
  end_of_verse: 'end_of_verse',
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
  sog: 'start_of_grid',
  start_of_grid: 'start_of_grid',
  eog: 'end_of_grid',
  end_of_grid: 'end_of_grid',
  chorus: 'chorus',
}

/**
 * The section a `{start_of_…}` opens, for the three this app draws differently.
 *
 * The format allows any name at all — `{start_of_solo}`, `{start_of_intro}` — and there
 * are only three section kinds here, each with styling of its own. An unrecognised one
 * opens a plain verse rather than being dropped: the block is real content whatever it
 * is called, and its own label is printed above it (see `labelLine`), so nothing about
 * it is lost except a colour.
 */
const SECTION_OF: Record<string, SectionKind> = {
  start_of_verse: 'verse',
  start_of_chorus: 'chorus',
  start_of_bridge: 'bridge',
}

/** `{start_of_solo}` → `Solo`: the label the format implies when a block names no other. */
function impliedLabel(directiveName: string): string | null {
  const match = /^start_of_(.+)$/.exec(directiveName)
  if (match === null) return null

  const name = match[1].replace(/_/g, ' ').trim()
  if (name === '') return null

  return name.charAt(0).toUpperCase() + name.slice(1)
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
  /** Rows collected since `{start_of_tab}` or `{start_of_grid}`, or null when inside neither. */
  let verbatimRows: string[] | null = null
  let verbatimVariant: 'tab' | 'grid' = 'tab'

  const openSection = (kind: SectionKind): Section => {
    const created: Section = { kind, lines: [] }
    song.sections.push(created)
    return created
  }

  const rawLines = source.split(/\r?\n/)

  for (let index = 0; index < rawLines.length; index++) {
    const rawLine = rawLines[index]

    if (verbatimRows !== null) {
      const closing = DIRECTIVE.exec(rawLine.trim())
      const closingName = closing === null ? undefined : DIRECTIVE_ALIAS[closing[1].toLowerCase()]

      // Either end directive closes either block. A `{start_of_grid}` shut with
      // `{end_of_tab}` is malformed, and honouring it loses one block; refusing it
      // swallows the whole rest of the song into a grid nobody can see past.
      if (closingName === 'end_of_tab' || closingName === 'end_of_grid') {
        section ??= openSection(forcedKind ?? 'verse')
        section.lines.push({ kind: 'tab', rows: verbatimRows, variant: verbatimVariant })
        verbatimRows = null
      } else {
        // Verbatim, not trimmed: trailing spaces inside one of these rows are as much a
        // part of its alignment as anything else in it.
        verbatimRows.push(rawLine)
      }
      continue
    }

    /*
     * A `#` in the first column is the format's own source comment — a note from whoever
     * wrote the file, never anything a reader is meant to see. Tested on the raw line and
     * not on a trimmed one, which is the strict reading: an indented `#` is a lyric that
     * happens to start with a hash, and a song is a likelier place to find one of those
     * than a comment somebody chose to indent.
     */
    if (rawLine.startsWith('#')) continue

    const line = rawLine.trimEnd()

    const directive = DIRECTIVE.exec(line.trim())
    const meta = directive === null ? META_DIRECTIVE.exec(line.trim()) : null

    if (directive || meta) {
      let rawName = (directive ?? (meta as RegExpExecArray))[1].toLowerCase()
      let value = (directive ?? (meta as RegExpExecArray))[2] ?? ''

      // `{meta: artist Foo}` — the colon form, whose name is `meta` and whose value is
      // the real directive and its own value. Re-split so both forms meet here as one.
      if (directive && rawName === 'meta') {
        const inner = META_VALUE.exec(value)
        if (inner === null) continue
        rawName = inner[1].toLowerCase()
        value = inner[2].trim()
      }

      const name = DIRECTIVE_ALIAS[rawName]

      /**
       * A section's own label, printed above it as a comment so it reaches the screen,
       * the PDF and the booklet without any of them learning a new line kind.
       *
       * `fallback` is what an *unlabelled* block says, and the two callers want opposite
       * things. A `{start_of_chorus}` says nothing, because this app draws a chorus
       * differently from a verse and that styling already is the label — printing the
       * word as well would put «Chorus» above every chorus in the repertoire, which is
       * a change to how existing songs read and not a compliance fix. A
       * `{start_of_solo}` has no styling of its own, so it says «Solo» or it says
       * nothing at all about a block that is there.
       */
      const labelLine = (fallback: string | null): void => {
        const label = value || fallback
        if (label === null || label === '') return
        section?.lines.push({ kind: 'comment', text: label })
      }

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
        /* `{chorus}` repeats the chorus without writing it out again. Nothing here can
           *replay* it — the reading screen shows the song in the order it was typed, and
           quoting a block back would put the same words under two different comment
           anchors — so it is printed as the reference it is. Unlabelled it says «Chorus»,
           which is the one place a default label is right: the directive's whole job is to
           mark a spot, and a silent one marks nothing. */
        case 'chorus':
          section ??= openSection(forcedKind ?? 'verse')
          section.lines.push({ kind: 'comment', text: value || 'Chorus' })
          break
        case 'start_of_verse':
        case 'start_of_chorus':
        case 'start_of_bridge':
          forcedKind = SECTION_OF[name]
          section = openSection(forcedKind)
          labelLine(null)
          break
        case 'start_of_tab':
          verbatimRows = []
          verbatimVariant = 'tab'
          break
        case 'start_of_grid':
          verbatimRows = []
          verbatimVariant = 'grid'
          break
        case 'end_of_verse':
        case 'end_of_chorus':
        case 'end_of_bridge':
          forcedKind = null
          section = null
          break
        default:
          /*
           * A `{start_of_…}` this app has no styling for is still a block somebody drew a
           * line around — a solo, an intro, a coda. It opens a plain verse and prints its
           * own name, rather than being dropped along with the lines it contains. Its
           * `{end_of_…}` closes it, whatever the two are called.
           *
           * Everything else — the typesetting directives, `{x_…}` extensions nobody here
           * claims, a directive invented after this was written — is ignored rather than
           * shown as lyrics.
           */
          if (name === undefined && /^start_of_./.test(rawName)) {
            forcedKind = 'verse'
            section = openSection('verse')
            labelLine(impliedLabel(rawName))
          } else if (name === undefined && /^end_of_./.test(rawName)) {
            forcedKind = null
            section = null
          }
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

  // A tab or grid with no closing directive — malformed, but its rows are real content
  // typed by someone, not something to drop silently for want of an `{end_of_tab}`.
  if (verbatimRows !== null) {
    section ??= openSection(forcedKind ?? 'verse')
    section.lines.push({ kind: 'tab', rows: verbatimRows, variant: verbatimVariant })
  }

  return song
}

/** What a backslash may escape, per the format: the characters that otherwise mean something. */
const ESCAPABLE = '[]{}#\\'

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
  let annotation = false
  /** A chord held back from the word it closed, waiting for the word that follows it. */
  let deferred: { chord: string; annotation: boolean } | null = null
  let hasChords = false

  const flushPart = () => {
    if (chord !== null || text !== '') {
      parts.push(annotation ? { chord, text, annotation: true } : { chord, text })
      chord = null
      annotation = false
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

  const strandedPart = (held: { chord: string; annotation: boolean }): Part =>
    held.annotation ? { chord: held.chord, text: '', annotation: true } : { chord: held.chord, text: '' }

  /** One character of lyric, taking over a held chord if this is the word it was waiting for. */
  const appendText = (char: string) => {
    if (text === '' && chord === null && deferred !== null) {
      chord = deferred.chord
      annotation = deferred.annotation
      deferred = null
    }
    text += char
  }

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    /*
     * A backslash makes the next character literal, so a song can print a bracket or a
     * hash of its own. Only the characters the format gives a meaning to are escapable:
     * a backslash in front of anything else stays a backslash, which keeps a stray one
     * in somebody's lyrics from eating the letter after it.
     */
    if (char === '\\' && i + 1 < line.length && ESCAPABLE.includes(line[i + 1])) {
      appendText(line[i + 1])
      i += 1
      continue
    }

    if (char === '[') {
      const close = line.indexOf(']', i)
      if (close === -1) {
        // An unclosed bracket is literal text, not a broken chord.
        appendText(char)
        continue
      }

      const token = line.slice(i + 1, close)
      i = close

      if (deferred !== null) {
        // The previous chord never found a word to sit on; keep it visible.
        words.push({ parts: [strandedPart(deferred)] })
        deferred = null
      }

      flushPart()
      // `[*…]` is an annotation: a word for the player, sharing the chord's slot and
      // none of its meaning. The `*` is the marker and is not part of the text.
      annotation = token.startsWith('*')
      chord = annotation ? token.slice(1) : token
      // True for an annotation too: the flag asks whether this line needs the row above
      // the words, and an annotation is drawn in exactly that row.
      hasChords = true
      continue
    }

    if (/\s/.test(char)) {
      if (text === '' && chord !== null) {
        // Chord sits right before a space: hold it for the next word.
        deferred = { chord, annotation }
        chord = null
        annotation = false
      }
      flushWord()
      continue
    }

    appendText(char)
  }

  flushWord()

  if (deferred !== null) {
    words.push({ parts: [strandedPart(deferred)] })
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

/**
 * Every distinct chord token in the song, in order of first appearance.
 *
 * Annotations are not chords and never appear here — this list is what the summary panel
 * draws fingerings for and what the transposer moves, and `[*Capo 3]` belongs in neither.
 */
export function chordTokens(song: ParsedSong): string[] {
  const seen = new Set<string>()

  for (const section of song.sections) {
    for (const line of section.lines) {
      if (line.kind !== 'lyrics') continue
      for (const word of line.words) {
        for (const part of word.parts) {
          if (part.chord !== null && part.annotation !== true) seen.add(part.chord)
        }
      }
    }
  }
  return [...seen]
}
