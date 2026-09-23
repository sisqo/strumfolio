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
 * - **`{songbook}` and `{division}` are this app's own directives**, where a strict reading
 *   says a private extension is spelled `{x_…}`. The `{x_}` spellings are read too (below)
 *   so a file written by a stricter tool is understood; what this app *writes* is unchanged,
 *   because the export is also this repo's restore path and renaming what it writes would
 *   strand every backup already made. They earn their keep by answering a question the
 *   format does not ask — *where does this song live* — which is why they stayed when
 *   `{link1..3}` went (2026-09-20): a link is a field, and the format already decides which
 *   fields a song has.
 * - **Line continuation — a line ending in `\` joined to the one after it — is read**, and
 *   it was the last construct on the cheat sheet to arrive because it could not be added
 *   safely before the anchors stopped counting. Every comment in a song is anchored into
 *   `editor/document.ts`, which is one block per *source* line; while `buildAnchorMap`
 *   walked the two lists in step, joining two source lines into one here made the reader's
 *   list shorter than the editor's, and from the continuation down every note rendered
 *   against the wrong line — silently, since nothing was missing and nothing threw. What
 *   made it possible is `sourceLines`: a drawn line records which source lines it was built
 *   from, so a joined line resolves into the two blocks it really spans. The join happens
 *   per line rather than over the whole source, so it cannot reach inside a tab or a grid
 *   where a trailing backslash is part of a drawing, and `\\` at the end is an escaped
 *   backslash rather than a continuation. `chordpro.test.ts` holds the invariant that
 *   caught the original breakage («the two parsers agree on how many lyric lines a song
 *   has»), and it is still the cheapest check that a new construct is safe.
 */

import { metadataValues, placeholderAt, substituteMetadata } from './chordproMeta'
import { MarkupState, type Run, isStyled, markupRuns, markupTagAt, sameStyle, stripMarkup } from './markup'
import { MAX_CAPO } from './music/capo'
import { parseChord } from './music/chord'
import { spellPitchClass } from './music/notes'
import { parseTimeSignature, readBpm } from './metronome/tempo'

export interface Part {
  /**
   * The part's text as styled runs, present only when markup (`<b>`, `<i>`, `<sym/>`…)
   * touches it — `markup.ts`. `text` is always the plain words with every tag taken out, so
   * width, search, the booklet and the note anchors never see a tag; a renderer that can
   * draw styles reads this instead.
   */
  runs?: Run[]
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

/**
 * How a comment is framed. The format has four spellings and they differ only in the box a
 * typesetter draws around them, so this app drew none of them and read all four as one — a
 * `{comment_box}` and a `{highlight}` came out as the same grey line as `{c}`.
 *
 * `plain` is also what a *generated* comment carries: a section's own label and the line
 * `{chorus}` prints are comments this parser invents, and neither is a frame the file asked
 * for.
 */
export type CommentStyle = 'plain' | 'box' | 'italic' | 'highlight'

export type Line =
  | {
      kind: 'lyrics'
      words: Word[]
      hasChords: boolean
      /**
       * Which lines of the source this one was built from, in order — almost always one.
       *
       * **This is what pairs a drawn line with the notes anchored to it**, and it replaced
       * counting. Every comment is stored against a block of `editor/document.ts`, which is
       * one block per source line, and both the screen and the booklet used to find a line's
       * notes by counting lyrics lines from the top of the song and trusting the two counts
       * to agree. They agree today and stop agreeing the moment a drawn line is not a source
       * line: `{chorus}` draws a stanza the source states once, a trailing `\` joins two
       * source lines into one drawn one. Either way the counts slip and every note below the
       * slip renders against the wrong line — silently, since nothing is missing and nothing
       * throws.
       *
       * Empty means «nothing in the source is this line», which is what a repeated stanza
       * is: the note stays on the stanza where somebody put it, and the repeat carries none.
       */
      sourceLines: number[]
      /**
       * Semitones this line moves **beyond the song's starting transposition** — a modulation
       * written as `{transpose: 2}` partway through, which the specification says applies
       * «from where it appears». Absent is 0. The reader's own transposition replaces the
       * starting one and never this: a song that steps up for its last chorus keeps the step
       * whatever key somebody reads it in. Decided with the owner on 2026-09-23.
       */
      shift?: number
    }
  | {
      kind: 'comment'
      /** Plain text, every markup tag taken out — see `Part.text`. */
      text: string
      /** The text as styled runs, present only when markup touches it (`markup.ts`). */
      runs?: Run[]
      /**
       * Set on the line this parser writes where a song modulates: `by` is the step at this
       * point, `offset` where it leaves the song relative to its start. `text` carries a plain
       * fallback («Key change +2»); a renderer that knows the key names the new one.
       */
      keyChange?: { by: number; offset: number }
      style: CommentStyle
      /**
       * The instrument this line is for, when the file said — `{comment-guitar: …}`. Null is
       * «everybody», which is nearly always.
       *
       * **Recorded rather than obeyed here**, and that is the whole shape of the feature:
       * this parser is a pure function of the text, and the instrument belongs to whoever is
       * reading. Deciding it at parse time would make the same file parse two ways for two
       * readers, and the notes anchored in it are found by walking these very objects.
       * `selectorMatches` is what the screen asks on the way to drawing.
       */
      selector: string | null
    }
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
  | {
      kind: 'tab'
      rows: string[]
      /**
       * `delegate` is the third verbatim block, and arrived on 2026-09-23: the environments the
       * format hands to another program — `{start_of_abc}`, `_ly`, `_svg`, `_textblock`,
       * `_strum` (`Directives-delegates.md`). Their content is ABC or LilyPond or SVG source,
       * not lyrics, and reading it as lyrics turned `[CDE]` in a tune into a chord. This app
       * renders none of those languages, so it keeps the source visible, verbatim and folded
       * like a tab, under the name of what it is.
       */
      variant?: 'tab' | 'grid' | 'delegate'
      /** For a `delegate`, which one — `abc`, `ly`, `svg`, `textblock`, `strum`. */
      delegate?: string
    }

export type SectionKind = 'verse' | 'chorus' | 'bridge'

export interface Section {
  kind: SectionKind
  lines: Line[]
  /** The instrument this whole block is for, from `{start_of_chorus-piano}`. Usually null. */
  selector: string | null
}

/**
 * Whether something the file guarded is for this reader.
 *
 * `{comment-guitar}` is for a guitarist; `{comment-!guitar}` is for everybody else. A
 * selector naming an instrument this app does not have — piano, bass — is somebody else's,
 * which is the honest reading: a file that bothered to say «piano» did not mean us.
 *
 * Pure and here rather than in the renderer so `npm test` can reach it, and so the screen
 * and the printed booklet can never disagree about who a line was for.
 */
export function selectorMatches(selector: string | null, instrument: string): boolean {
  if (selector === null) return true

  const negated = selector.startsWith('!')
  const wanted = (negated ? selector.slice(1) : selector).trim().toLowerCase()

  return negated ? wanted !== instrument.toLowerCase() : wanted === instrument.toLowerCase()
}

/**
 * What the file says about the song that this app stores nowhere and only shows.
 *
 * Read as written and never interpreted — a year is `string` because a file may say «1979»
 * or «circa 1979», and a duration «3:40» or «220». Nothing here is parsed into a number,
 * because nothing here is used for anything but being printed back to a reader; the moment
 * one of these earns a behaviour it stops belonging in this bag and gets a field of its own,
 * the way `key` did.
 *
 * All of it lives in the body and none of it in a column, which is what `KEPT_IN_BODY`
 * guarantees: the line the file carried is the only copy, and an export hands it back
 * exactly where the writer put it.
 */
export interface SongMetadata {
  album: string | null
  composer: string | null
  lyricist: string | null
  year: string | null
  copyright: string | null
  duration: string | null
  ccli: string | null
  /** Standard metadata in the reference implementation (`Directives-arranger.md`). */
  arranger: string | null
  /** Sorting keys, for a list this app does not build — shown so nothing in the file is invisible. */
  sortTitle: string | null
  sortArtist: string | null
}

const EMPTY_METADATA: SongMetadata = {
  album: null,
  composer: null,
  lyricist: null,
  year: null,
  copyright: null,
  duration: null,
  ccli: null,
  arranger: null,
  sortTitle: null,
  sortArtist: null,
}

/** Directive name → the field of `SongMetadata` it fills. Everything here is text and only text. */
const METADATA_FIELD: Record<string, keyof SongMetadata> = {
  album: 'album',
  composer: 'composer',
  lyricist: 'lyricist',
  year: 'year',
  copyright: 'copyright',
  duration: 'duration',
  length: 'duration',
  ccli: 'ccli',
  'ccli-number': 'ccli',
  ccli_number: 'ccli',
  sorttitle: 'sortTitle',
  sortartist: 'sortArtist',
  arranger: 'arranger',
}

/**
 * The metadata the specification lets a song hold more than one of — «Multiple arrangers can
 * be specified using multiple directives» (`Directives-arranger.md`, `Directives-meta.md`).
 * Joined with the reference implementation's own separator rather than kept as the last one
 * seen, which threw every earlier composer away. Everything else here is one value per song,
 * and the first one wins.
 */
const MULTI_VALUED = new Set<keyof SongMetadata>(['composer', 'lyricist', 'arranger'])

/**
 * A fingering the file drew itself, from `{define: …}` or `{chord: …}`.
 *
 * Both directives take the same options and this app reads the two that decide where the
 * fingers go; `fingers`, `keys`, `diagram`, `display` and `format` are about how a typesetter
 * draws the box and are ignored, like every other typesetting instruction here.
 *
 * `frets` is in this app's own terms — absolute fret positions, `null` for a muted string —
 * rather than the file's, so nothing downstream has to know that ChordPro counts from
 * `base-fret`. That translation happens once, in `readDefinition`, where it can be tested.
 */
export interface ChordDefinition {
  /** The chord as the file named it, kept verbatim for the error nobody wants to debug. */
  name: string
  frets: (number | null)[]
}

export interface ParsedSong {
  title: string | null
  artist: string | null
  /**
   * `{subtitle: …}`, which the specification means literally and OnSong redefined as the
   * artist. **This reader always takes it literally**, and can, because the ambiguity is
   * settled one layer up: `import/dialect.ts` consumes it into the artist column for an
   * OnSong file and strips the line, so a body that still carries one is a body where it
   * really is a subtitle. See that module's header for the measurement behind it.
   */
  subtitle: string | null
  /**
   * `{key: …}` as the song was written, verbatim — «G», «Am», «Sol». The one piece of
   * metadata here that *does* something: it names the note Nashville numbers count from,
   * where otherwise `estimateKey` guesses it from the chords. Null when the song does not
   * say, which is nearly always, and then the guess stands.
   */
  key: string | null
  metadata: SongMetadata
  /**
   * The fingerings this song brings with it, keyed by the chord name lowercased.
   *
   * **They win over the built-in library for this song**, and only for this song: somebody
   * who writes a `{define}` is saying either that our table has no such voicing or that the
   * instrument is in an open tuning, and in both cases they know more than the table does.
   * What still beats them is a shape this reader chose by hand, which is the most recent and
   * the most theirs.
   */
  definitions: Record<string, ChordDefinition>
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
  /**
   * The fret the song says it is played with the capo on, from `{capo: 3}` — **stated,
   * never applied.** Null when the song does not say, which today is every song in the
   * archive: nothing here has ever written the directive, so it only ever arrives on an
   * imported file.
   *
   * It is deliberately not wired to `user_song_prefs.capo`. That column is the reader's
   * own answer and is `NOT NULL DEFAULT 0`, so `0` means «no capo» and «never chose» at
   * once; letting a file supply the value where the reader's reads 0 would put a capo on
   * for somebody who had taken it off, which is `SongPrefs.bpm`'s own argument turned the
   * wrong way round. Telling them what the file says costs nobody their setting, and the
   * stronger version is still available afterwards — it needs that column nullable first.
   *
   * In the body rather than a column of its own, for `tempo`'s reason directly above.
   */
  capo: number | null
  /**
   * `{transpose: 2}` — how far the song asks to be moved, in semitones, and the only
   * directive in the format that asks for the chords to be *changed*.
   *
   * A starting value for the reader's own transposition, never an instruction: the same
   * arrangement as `tempo` and `capo`, and for the same reason — `user_song_prefs.semitones`
   * is where a reader's answer lives and `null` there means «I take the song's».
   */
  transpose: number | null
  sections: Section[]
}

/**
 * One directive on its own line.
 *
 * **A space separates the name from the value as readily as a colon does.** `{comment: x}` is
 * the form the cheat sheet writes, and real files carry `{comment Repeat ad lib…}` and
 * `{titles center}` just as happily — the colon is punctuation, not structure. Without the
 * space alternative those lines matched nothing and were drawn as *words*, so a comment
 * printed in the middle of the song as though somebody sang it. Found by importing twelve
 * generated files rather than by any test here, which is what integration is for.
 *
 * `-` is in the name charset for the format's own hyphenated spellings (`{ccli-number}`)
 * and for a conditional's selector (`{comment-guitar}`); digits are there because a
 * hyphenated name may end in one.
 *
 * **The `!` after a dash is what makes a negated conditional reachable at all.** A selector
 * may be `!guitar` — «everybody except» — and `selectorMatches` has implemented that since
 * the day conditionals landed, but this charset excluded the character, so the line matched
 * no directive and was drawn as *words*: `{comment-!guitar: no capo}` printed in the middle
 * of a song exactly as `{comment Repeat ad lib}` used to, and the negation branch downstream
 * was dead code for every real file. Only after a dash, so a bare `{!foo}` is still not a
 * directive. Found on 2026-09-20 by parsing a file that used every construct the guide
 * documents, which is the kind of bug no unit test finds because each half is correct.
 */
const DIRECTIVE = /^\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:-!?[a-zA-Z0-9_-]*)?)\s*(?:[:\s]\s*(.*?)\s*)?\}$/

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
  st: 'subtitle',
  subtitle: 'subtitle',
  artist: 'artist',
  key: 'key',
  tags: 'tags',
  tag: 'tags',
  canzoniere: 'songbookName',
  songbook: 'songbookName',
  x_songbook: 'songbookName',
  division: 'sectionName',
  sezione: 'sectionName',
  x_division: 'sectionName',
  /* Read for the metronome, and the one pair of directives here that is read as a number.
     `bpm` is `tempo`'s own alias in the import dialect table too (`import/dialect.ts`), so
     a file is understood the same way whichever door it came in through. */
  tempo: 'tempo',
  bpm: 'tempo',
  time: 'timeSignature',
  capo: 'capo',
  transpose: 'transpose',
  define: 'define',
  chord: 'define',
  /* Everything the file says and nothing acts on. Mapped to one case below rather than to a
     case each: none of them is interpreted, so none of them needs its own. */
  ...Object.fromEntries(Object.keys(METADATA_FIELD).map((name) => [name, 'metadata'])),
  /* Every shape of comment the format defines collapses to one here. `comment_italic` and
     `comment_box` differ from `comment` only in how a PDF typesetter draws the box around
     them, and this app draws no box; `highlight` is the same sentence again under a third
     name. Losing the distinction costs nothing a reader can see — but they must not fall
     through to the `default:` branch, which would drop the sentence itself.

     **`cb` is `comment_box`, and only when it has something to say.** The reference
     implementation maps `cb` to `comment_box` and `colb` to `column_break` (`Song.pm`'s
     abbreviation table); its own documentation contradicts itself, giving `cb` to both. This
     app used to take the column-break reading, so `{cb: Palm mute}` vanished from the screen
     — words somebody wrote, drawn nowhere. Now `{cb: …}` with a value is a boxed comment and a
     bare `{cb}`, which can only be a break, is ignored like every other break: both readings
     are honoured, and the editor draws the same line (`editor/document.ts`). */
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
  /* The reference implementation's older name for a grid (`Song.pm`'s directive table). */
  start_of_grille: 'start_of_grid',
  end_of_grille: 'end_of_grid',
  eog: 'end_of_grid',
  end_of_grid: 'end_of_grid',
  chorus: 'chorus',
}

/** Which frame each spelling of a comment asks for; anything else is `plain`. */
const COMMENT_STYLE: Record<string, CommentStyle> = {
  comment_box: 'box',
  cb: 'box',
  ci: 'italic',
  comment_italic: 'italic',
  highlight: 'highlight',
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
    subtitle: null,
    key: null,
    metadata: { ...EMPTY_METADATA },
    definitions: {},
    tags: [],
    songbookName: null,
    sectionName: null,
    tempo: null,
    beatsPerBar: null,
    capo: null,
    transpose: null,
    sections: [],
  }

  let section: Section | null = null
  let forcedKind: SectionKind | null = null
  /**
   * The chorus a later `{chorus}` replays, and the ones a labelled `{chorus: …}` may pick
   * out by name. The most recent unlabelled chorus is the default, which is what a file
   * writing `{soc}` once and `{chorus}` three times means.
   */
  /* The whole section, not only its lines: a conditional chorus (`{soc-piano}`) carries a
     selector, and a repeat of it has to carry the same one or it is drawn for every reader. */
  /*
   * `{transpose}`, as the reference implementation keeps it (`Song.pm`'s `dir_transpose`):
   * values add up, and an empty one restores the one before. What is in force when the first
   * line of words is drawn is the song's starting transposition — `song.transpose`, the one a
   * reader's own choice replaces — and every change after that is a modulation, carried on
   * the lines it applies to (`Line.shift`).
   */
  let transposeTotal = 0
  const transposeStack: number[] = []
  /* Whether the file set a starting transposition at all: a song that only modulates has none. */
  let transposeBeforeWords = false
  let startingTranspose: number | null = null
  const modulation = () => transposeTotal - (startingTranspose ?? transposeTotal)

  let lastChorus: Section | null = null
  const chorusByLabel = new Map<string, Section>()
  /** Rows collected since `{start_of_tab}` or `{start_of_grid}`, or null when inside neither. */
  let verbatimRows: string[] | null = null
  let verbatimVariant: 'tab' | 'grid' | 'delegate' = 'tab'
  /** Which delegated environment is open, whose own `{end_of_…}` is the only thing that closes it. */
  let verbatimDelegate = ''
  /** `{start_of_tab: Solo}`'s label, printed above the block exactly as a section's is. */
  let verbatimLabel = ''

  const openSection = (kind: SectionKind, selector: string | null = null): Section => {
    const created: Section = { kind, lines: [], selector }
    song.sections.push(created)
    return created
  }

  const rawLines = source.split(/\r?\n/)

  for (let index = 0; index < rawLines.length; index++) {
    const rawLine = rawLines[index]

    if (verbatimRows !== null) {
      const closing = DIRECTIVE.exec(rawLine.trim())
      const closingRaw = closing === null ? undefined : closing[1].toLowerCase()
      const closingName = closingRaw === undefined ? undefined : DIRECTIVE_ALIAS[closingRaw]

      // Either end directive closes either block. A `{start_of_grid}` shut with
      // `{end_of_tab}` is malformed, and honouring it loses one block; refusing it
      // swallows the whole rest of the song into a grid nobody can see past.
      // A delegated block closes only on its own name: `{end_of_tab}` inside a LilyPond
      // source is not the end of it.
      const closes =
        verbatimVariant === 'delegate'
          ? closingRaw === `end_of_${verbatimDelegate}`
          : closingName === 'end_of_tab' || closingName === 'end_of_grid'
      if (closes) {
        section ??= openSection(forcedKind ?? 'verse')
        if (verbatimLabel !== '') section.lines.push(commentLine(verbatimLabel, 'plain', null))
        section.lines.push(verbatimLine(verbatimRows, verbatimVariant, verbatimDelegate))
        verbatimRows = null
        verbatimLabel = ''
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

    /*
     * A line ending in a single backslash continues on the one after it.
     *
     * Done here rather than over the whole source so it cannot reach inside a tab or a
     * grid, where a trailing backslash is a character in a drawing. `\\` at the end is an
     * escaped backslash and not a continuation, which is why the count is what decides.
     *
     * Every line it swallows is recorded, because that is what the anchors are found by:
     * the drawn line covers two source lines and its parts must resolve into whichever of
     * the two each one really sits in.
     */
    /*
     * **Never into a line that is not words.** The editor keeps a `#` note, a directive and a
     * tab as blocks of their own whatever precedes them, so a continuation that swallowed one
     * made the two parsers disagree: `verse \` followed by `{c: hi}` drew `{c:` and `hi}` as
     * lyrics, and followed by `{start_of_tab}` never opened the tab at all.
     */
    const continuesInto = (next: string | undefined) =>
      next !== undefined && next.trim() !== '' && !next.startsWith('#') && DIRECTIVE.exec(next.trim()) === null && META_DIRECTIVE.exec(next.trim()) === null

    const sourceLines = [index]
    let joined = rawLine
    while (/(^|[^\\])(\\\\)*\\$/.test(joined) && index + 1 < rawLines.length && continuesInto(rawLines[index + 1])) {
      index += 1
      sourceLines.push(index)
      joined = joined.slice(0, -1) + rawLines[index]
    }
    /* A continuation with nothing it may continue into is only a mark: drawn, it would be a
       stray `\` at the end of the words. */
    if (/(^|[^\\])(\\\\)*\\$/.test(joined)) joined = joined.slice(0, -1)

    const line = joined.trimEnd()

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

      value = decodeUnicodeEscapes(value)
      /* A section's or a chorus recall's label, in either of the format's spellings. */
      const label = readLabel(value)

      /*
       * A conditional directive — `{comment-guitar: …}`, `{start_of_chorus-piano}` — runs
       * only for a reader whose instrument the selector names.
       *
       * **The selector is recorded here and answered at the screen.** This parser is a pure
       * function of the text and the instrument belongs to whoever is reading; deciding it
       * here would make one file parse two ways for two readers, and the notes anchored in
       * it are found by walking these very objects. `selectorMatches` is the question, and
       * `SongSheet` and the booklet are the ones who ask it.
       *
       * **Only what a reader sees may be conditional.** A comment and a section are drawn or
       * not drawn, so the answer can wait; a `{tempo-guitar: 96}` would have to change a
       * number before anybody looks, which this parser is in no position to decide — those
       * are skipped, exactly as every conditional was before.
       *
       * A name this table already knows is never split, however many hyphens it has:
       * `{ccli-number: …}` is a directive whose own name contains one, and reading it as
       * «`ccli`, for readers of type `number`» dropped it. A test holds that, and it started
       * failing the moment `ccli` entered the table.
       */
      let selector: string | null = null

      if (DIRECTIVE_ALIAS[rawName] === undefined && rawName.includes('-')) {
        const cut = rawName.indexOf('-')
        const base = DIRECTIVE_ALIAS[rawName.slice(0, cut)]

        if (base !== undefined) {
          if (base !== 'comment' && SECTION_OF[base] === undefined) continue
          selector = rawName.slice(cut + 1)
          rawName = rawName.slice(0, cut)
        }
      }

      /* `cb` is two directives in the documentation — see the alias table. With words it is
         a boxed comment; bare it is a column break, which there is no page here to take. */
      const name = rawName === 'cb' ? (value !== '' ? 'comment' : undefined) : DIRECTIVE_ALIAS[rawName]

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
        const text = label || fallback
        if (text === null || text === '') return
        section?.lines.push(commentLine(text, 'plain', null))
      }

      switch (name) {
        /*
         * **The first of each wins**, where it used to be the last. The specification says a
         * `{key}`, a `{time}` or a `{tempo}` «applies from where it was specified» — a second
         * one is a change partway through, and the song's own value is the one it opens with.
         * Taking the last labelled a song that modulates at the bridge with the bridge's key.
         * (`{transpose}` is deliberately left out of this: what a mid-song one means is an
         * open decision.)
         */
        case 'title':
          song.title ??= value || null
          break
        case 'artist':
          song.artist ??= value || null
          break
        case 'subtitle':
          song.subtitle ??= value || null
          break
        case 'key':
          song.key ??= value || null
          break
        case 'metadata': {
          const field = METADATA_FIELD[rawName]
          if (value === '') break
          const held = song.metadata[field]
          if (held === null) song.metadata[field] = value
          else if (MULTI_VALUED.has(field) && !held.split('; ').includes(value)) song.metadata[field] = `${held}; ${value}`
          break
        }
        /*
         * **`{tag:}` accumulates, because the specification says it repeats.** One tag per
         * line is the format's primary form — «Multiple tags are possible» — and this used
         * to *assign*, so a song saying `{tag: rock}` then `{tag: live}` kept only «live»
         * and threw the rest away without a word. Five of twelve real files carried two
         * `{tag}` lines, so it was not a corner: they imported with half their tags gone.
         *
         * `{tags: rock, live}` is this app's own plural, comma-separated spelling and is
         * still read — every export it ever wrote used it, and every song already stored
         * came in through it. It adds to the same list rather than replacing it, so the two
         * forms can sit in one file without either winning.
         *
         * Deduplicated, since accumulating two spellings of the same word otherwise shows
         * it twice on the song.
         */
        case 'tags':
          for (const tag of value.split(',').map((one) => one.trim())) {
            if (tag !== '' && !song.tags.includes(tag)) song.tags.push(tag)
          }
          break
        case 'songbookName':
          song.songbookName = value || null
          break
        case 'sectionName':
          song.sectionName = value || null
          break
        /* Narrowed, not stored raw: `readBpm` and `parseTimeSignature` answer null for
           everything that is not a number this can beat, so a directive nobody can play
           leaves the song saying nothing rather than handing the audio clock a `NaN`. */
        case 'tempo':
          song.tempo ??= readBpm(value)
          break
        case 'timeSignature':
          song.beatsPerBar ??= parseTimeSignature(value)
          break
        /* Narrowed like the two above: a fret this app could not draw — a word, a
           negative, something past the end of the neck — leaves the song saying nothing
           rather than putting an impossible number in front of a reader. */
        case 'capo':
          song.capo ??= readCapo(value)
          break
        /* Narrowed like the rest: an octave either way is the most anybody transposes, and a
           directive nobody can play leaves the song saying nothing. */
        /*
         * A number, optionally followed by `s` or `f` — the reference's request for sharps or
         * flats. The letter is read and set aside: which accidentals a chord is spelt with is
         * the reader's own preference in this app (`GlobalPrefs.accidentals`), decided on
         * 2026-09-23 to stay that way. An octave either way is the most anybody transposes.
         */
        case 'transpose': {
          const before = transposeTotal
          if (value.trim() === '') {
            /* Nothing to restore is nothing said: a bare `{transpose}` at the top of a file must
               not become «this song declares 0», which the reader treats as a choice. */
            if (transposeStack.length === 0) break
            transposeTotal = transposeStack.pop() ?? 0
          } else {
            const match = /^([+-]?\d{1,2})\s*[sf]?$/i.exec(value.trim())
            const moved = match === null ? null : Number(match[1])
            if (moved === null || Math.abs(moved) > 12) break
            transposeStack.push(transposeTotal)
            transposeTotal += moved
          }
          if (startingTranspose === null) transposeBeforeWords = true

          /* After the first words, a change is a modulation, and the sheet says so where it
             happens rather than letting the chords jump without warning. */
          if (startingTranspose !== null && transposeTotal !== before) {
            section ??= openSection(forcedKind ?? 'verse')
            const by = transposeTotal - before
            section.lines.push({
              kind: 'comment',
              text: `Key change ${by > 0 ? '+' : '−'}${Math.abs(by)}`,
              style: 'plain',
              selector: null,
              keyChange: { by, offset: modulation() },
            })
          }
          break
        }
        case 'define': {
          const defined = readDefinition(value)
          if (defined !== null) song.definitions[defined.name.toLowerCase()] = defined
          break
        }
        case 'comment':
          section ??= openSection(forcedKind ?? 'verse')
          section.lines.push(commentLine(value, COMMENT_STYLE[rawName] ?? 'plain', selector))
          break
        /*
         * `{chorus}` repeats the chorus without writing it out again, and now it really
         * does repeat it — a stanza somebody on a stand does not know by heart is worth
         * more than the word «Chorus».
         *
         * **The repeated lines carry no `sourceLines`, which is what makes this safe.**
         * They are not in the file: the note a reader placed stays on the stanza where they
         * placed it, and `buildAnchorMap` gives a line with no source an empty set of
         * anchors rather than the original's. Before Phase 2 there was no way to say that —
         * the anchors were found by counting drawn lines, so a repeat shifted every note
         * below it onto the wrong row, which is why this printed a word instead.
         *
         * A repeat opens a chorus section of its own so it is drawn as a chorus; the verse
         * around it resumes afterwards. With no chorus to repeat — a file that says
         * `{chorus}` and never `{soc}` — the reference is printed as it used to be, since
         * saying nothing at all would lose the one thing the directive marks.
         */
        case 'chorus': {
          /*
           * **`{chorus: Final}` is the last chorus again, labelled «Final»** — that is what the
           * specification means by the argument (`Directives-chorus.md`, «the argument is used
           * as a label for the chorus»), spelt `{chorus: label="Final"}` too. This app also
           * lets the argument *name* a chorus it has seen (`{start_of_chorus: Final}` …
           * `{chorus: Final}`); where it names none, it used to print the word and repeat
           * nothing, which is the spec's own example producing no chorus at all.
           */
          const named = label === '' ? undefined : chorusByLabel.get(label.toLowerCase())
          const wanted = named ?? lastChorus

          if (wanted === null || wanted.lines.length === 0) {
            section ??= openSection(forcedKind ?? 'verse')
            section.lines.push(commentLine(label || 'Chorus', 'plain', null))
            break
          }

          // The chorus's own selector, so a `{soc-piano}` repeats for piano players only. (A
          // conditional `{chorus-…}` never reaches here: it is refused as a directive above.)
          const repeat = openSection('chorus', wanted.selector)
          if (label !== '' && named === undefined) repeat.lines.push(commentLine(label, 'plain', null))
          /* At the pitch in force where `{chorus}` stands — the last chorus a tone up, written
             once — and not at the pitch it was first written at. */
          repeat.lines.push(...repeatedLines(wanted.lines, modulation()))
          // The verse the reference sat in resumes; a repeat is not a section boundary.
          section = null
          break
        }
        case 'start_of_verse':
        case 'start_of_chorus':
        case 'start_of_bridge':
          forcedKind = SECTION_OF[name]
          section = openSection(forcedKind, selector)
          labelLine(null)
          // Remembered by reference: the block is still being filled, and a `{chorus}`
          // further down wants it as it finally stands.
          if (forcedKind === 'chorus') {
            lastChorus = section
            if (label !== '') chorusByLabel.set(label.toLowerCase(), section)
          }
          break
        case 'start_of_tab':
          verbatimRows = []
          verbatimVariant = 'tab'
          verbatimLabel = label
          break
        case 'start_of_grid':
          verbatimRows = []
          verbatimVariant = 'grid'
          verbatimLabel = label
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
          const delegate = /^start_of_(.+)$/.exec(rawName)?.[1]
          if (name === undefined && delegate !== undefined && DELEGATES.has(delegate)) {
            /* A delegated environment: verbatim to its own `{end_of_…}` — see `Line`'s `tab`. */
            verbatimRows = []
            verbatimVariant = 'delegate'
            verbatimDelegate = delegate
            verbatimLabel = label
          } else if (name === undefined && /^start_of_./.test(rawName)) {
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
    if (startingTranspose === null) startingTranspose = transposeTotal
    const lyric = parseLyricLine(line, sourceLines)
    const offset = modulation()
    section.lines.push(offset !== 0 && lyric.kind === 'lyrics' ? { ...lyric, shift: offset } : lyric)
  }

  // A tab or grid with no closing directive — malformed, but its rows are real content
  // typed by someone, not something to drop silently for want of an `{end_of_tab}`.
  if (verbatimRows !== null) {
    section ??= openSection(forcedKind ?? 'verse')
    if (verbatimLabel !== '') section.lines.push(commentLine(verbatimLabel, 'plain', null))
    section.lines.push(verbatimLine(verbatimRows, verbatimVariant, verbatimDelegate))
  }

  /* The starting transposition, when the file set one. A song whose `{transpose}` lines all
     come before any words — or that has no words at all — starts at their total. */
  /* Folded into an octave rather than clamped: `{transpose: 10}` then `{transpose: 5}` is +15,
     which names the same chords as +3, and clamping it to +12 while every later modulation is
     measured from 15 would bend each of them by three semitones. */
  if (transposeBeforeWords) {
    const start = startingTranspose ?? transposeTotal
    song.transpose = Math.abs(start) <= 12 ? start : start % 12
  }

  return song
}

/**
 * `{capo: 3}` as a fret, or null for anything that is not one.
 *
 * Whole frets only, and inside the neck this app draws (`MAX_CAPO`): `{capo: none}` and
 * `{capo: 2nd fret}` both turn up in real files and neither is a number. `0` is a real
 * answer and stays one — a file saying «no capo» is saying something.
 */
function readCapo(value: string): number | null {
  if (!/^\d{1,2}$/.test(value.trim())) return null

  const fret = Number(value.trim())
  return fret <= MAX_CAPO ? fret : null
}

/**
 * The same line again, detached from the source.
 *
 * Emptying `sourceLines` is the whole of it: a repeat draws the same words and owns none of
 * the notes, which stay where somebody put them.
 */
function repeated(line: Line, offset: number): Line {
  if (line.kind !== 'lyrics') return line
  const rest: Line = { ...line, sourceLines: [] }
  delete rest.shift
  return offset === 0 ? rest : { ...rest, shift: offset }
}

/**
 * A chorus's lines again, starting from the modulation in force where `{chorus}` stands.
 *
 * **A `{transpose}` written inside the chorus moves the repeat too.** Its «Key change» line is
 * part of the chorus and is repeated with it, so the lines after it have to move by the same
 * step — until 2026-09-23 every repeated line took the one offset in force at `{chorus}`, and the
 * sheet announced a key change and then played the second half as written. Walking the
 * announcements rather than re-reading each line's stored `shift` is what keeps the step
 * relative: the stored shifts are measured from where the chorus was first written.
 */
function repeatedLines(lines: readonly Line[], offset: number): Line[] {
  let running = offset
  return lines.map((line) => {
    if (line.kind === 'comment' && line.keyChange !== undefined) {
      running += line.keyChange.by
      return { ...line, keyChange: { ...line.keyChange, offset: running } }
    }
    return repeated(line, running)
  })
}

/**
 * `Cmaj7 base-fret 3 frets 0 3 2 0 0 0` as a fingering this app can draw.
 *
 * Two translations happen here and nowhere else. A string is muted when the file writes `x`
 * or `N`, which becomes `null`. And a fret is written **relative to `base-fret`**, where 1 is
 * the first fret the diagram shows — so with `base-fret 3` a `1` is really fret 3. An open
 * string is `0` and stays 0 whatever the base is, since an open string is not on the diagram
 * at all. With the usual `base-fret 1` the arithmetic cancels and the numbers are already
 * absolute, which is why getting it wrong would go unnoticed on almost every file.
 *
 * Anything this cannot read is null rather than a guess: a fingering drawn wrong is worse
 * than a fingering drawn from the table, because a reader has no way to tell.
 */
export function readDefinition(value: string): ChordDefinition | null {
  const name = value.trim().split(/\s+/)[0] ?? ''
  if (name === '') return null

  const frets = /(?:^|\s)frets\s+((?:[\dxXnN]+\s*)+)/.exec(value)
  if (frets === null) return null

  const base = /(?:^|\s)base-fret\s+(\d+)/.exec(value)
  const baseFret = base === null ? 1 : Number(base[1])

  const positions = frets[1]
    .trim()
    .split(/\s+/)
    .map((cell): number | null => {
      if (/^[xXnN]$/.test(cell)) return null
      const fret = Number(cell)
      if (!Number.isInteger(fret) || fret < 0) return null
      return fret === 0 ? 0 : baseFret + fret - 1
    })

  return positions.length === 0 ? null : { name, frets: positions }
}

/** What a backslash may escape, per the format: the characters that otherwise mean something. */
const ESCAPABLE = '[]{}#\\'

/** The character a `\uXXXX` at `index` names, or null when what is there is not one. */
export function unicodeEscapeAt(text: string, index: number): string | null {
  if (text[index] !== '\\' || text[index + 1] !== 'u') return null
  const hex = text.slice(index + 2, index + 6)
  return /^[0-9a-fA-F]{4}$/.test(hex) ? String.fromCharCode(parseInt(hex, 16)) : null
}

/** Every `\uXXXX` in a directive's value, as the character it names. */
function decodeUnicodeEscapes(value: string): string {
  if (!value.includes('\\u')) return value
  let out = ''
  for (let i = 0; i < value.length; i += 1) {
    const char = unicodeEscapeAt(value, i)
    if (char !== null) {
      out += char
      i += 5
    } else out += value[i]
  }
  return out
}

/**
 * A section's label in either spelling the format allows: positional (`{start_of_verse:
 * Verse 1}`, the legacy form) or as an attribute (`{start_of_verse: label="Verse 1"}`, the one
 * `Directives-env.md` recommends). Until 2026-09-23 the second was printed as it stood —
 * `label="Verse 1"` on the screen. A `\n` in a label is a line break (`Directives-env.md`),
 * and an attribute list with no `label` in it names no label at all.
 */
export function readLabel(value: string): string {
  const trimmed = value.trim()
  if (/^[a-zA-Z_-]+\s*=\s*["']/.test(trimmed)) {
    const match = /(?:^|\s)label\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(trimmed)
    return match === null ? '' : (match[1] ?? match[2] ?? '').replace(/\\n/g, '\n')
  }
  return trimmed.replace(/\\n/g, '\n')
}

/** The environments the format delegates to another program (`Directives-delegates.md`). */
const DELEGATES = new Set(['abc', 'ly', 'svg', 'textblock', 'strum'])

function verbatimLine(rows: string[], variant: 'tab' | 'grid' | 'delegate', delegate: string): Line {
  return variant === 'delegate' ? { kind: 'tab', rows, variant, delegate } : { kind: 'tab', rows, variant }
}

/** A comment line, its markup read into runs and taken out of its plain text. */
function commentLine(text: string, style: CommentStyle, selector: string | null): Line {
  if (!text.includes('<')) return { kind: 'comment', text, style, selector }
  const runs = markupRuns(text)
  const plain = runs.map((run) => run.text).join('')
  return isStyled(runs) ? { kind: 'comment', text: plain, runs, style, selector } : { kind: 'comment', text: plain, style, selector }
}

/**
 * Splits one line into words and chord/text parts.
 *
 * A chord that is immediately followed by a space attaches to the *next* word
 * rather than hanging over an empty slot — which is what reads correctly for
 * `[Am] Certe notti`. A chord with no following word at all (an instrumental
 * line such as `[C] [F] [G]`) becomes a word of its own.
 */
export function parseLyricLine(line: string, sourceLines: number[] = []): Line {
  const words: Word[] = []
  let parts: Part[] = []
  let text = ''
  let chord: string | null = null
  let annotation = false
  /** A chord held back from the word it closed, waiting for the word that follows it. */
  let deferred: { chord: string; annotation: boolean } | null = null
  let hasChords = false
  /* Markup in force across the whole line — a `<b>` may open in one word and close three
     words later — and the current part's text as runs of one style each. */
  const markup = new MarkupState()
  let runs: Run[] = []

  const flushPart = () => {
    if (chord !== null || text !== '' || runs.length > 0) {
      const styled = isStyled(runs) ? { runs } : {}
      parts.push(annotation ? { chord, text, annotation: true, ...styled } : { chord, text, ...styled })
      chord = null
      annotation = false
      text = ''
      runs = []
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
    const style = markup.style()
    const last = runs[runs.length - 1]
    if (last !== undefined && last.symbol === undefined && sameStyle(last.style, style)) last.text += char
    else runs.push({ text: char, style })
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

    /* `\u00e9` is the character it names — the format's own escape for one a keyboard
       cannot type (`ChordPro-Cheat_Sheet.md`). Exactly four hex digits, or it is text. */
    const unicode = char === '\\' ? unicodeEscapeAt(line, i) : null
    if (unicode !== null) {
      appendText(unicode)
      i += 5
      continue
    }

    /* Markup: the tag itself is never text. It changes the style of what follows, and a
       `<sym/>` adds a symbol that is drawn without being part of the words. */
    const tag = char === '<' ? markupTagAt(line, i) : null
    if (tag !== null) {
      if (tag.kind === 'symbol') runs.push({ text: '', style: markup.style(), symbol: tag.symbol })
      markup.apply(tag)
      i += tag.length - 1
      continue
    }

    /*
     * A `%{…}` travels whole, spaces and all, and is not resolved here.
     *
     * Whole, because the conditional form contains one: `%{artist|di %{}}` would otherwise
     * be split at its space into two words and could never be resolved afterwards. Not
     * resolved, because every note in a song is anchored by a character offset into this
     * very line — swapping a placeholder for a value of a different length would slide every
     * note after it. The renderer substitutes on the way to the screen and the file keeps
     * what its writer typed, which is also what an export has to hand back.
     */
    const placeholderEnd = char === '%' ? placeholderAt(line, i) : null
    if (placeholderEnd !== null) {
      appendText(line.slice(i, placeholderEnd))
      i = placeholderEnd - 1
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
      /* Markup on a chord (`[<b>C</b>]`) styles how a typesetter draws it; the name under it
         is what transposes, so the tags are taken out of it here. */
      chord = stripMarkup(annotation ? token.slice(1) : token)
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

  return { kind: 'lyrics', words, hasChords, sourceLines }
}

/**
 * The song as this reader sees it: everything the file guarded for somebody else removed.
 *
 * One function, called once by each renderer at the point where it decides what to draw, so
 * the screen and the printed booklet can never disagree about who a block was for. Filtering
 * here rather than in the parse is what keeps `parseChordPro` a pure function of the text —
 * and what makes hiding safe at all, since the notes are found by the identity of the lines
 * that remain, and a line nobody draws is simply never looked up.
 *
 * A song with no conditionals in it — every song, very nearly — comes back untouched, the
 * same objects in the same order, which is what the anchors depend on.
 */
export function visibleSections(sections: Section[], instrument: string): Section[] {
  return sections
    .filter((section) => selectorMatches(section.selector, instrument))
    .map((section) => {
      const lines = section.lines.filter(
        (line) => line.kind !== 'comment' || selectorMatches(line.selector, instrument),
      )

      return lines.length === section.lines.length ? section : { ...section, lines }
    })
}

/**
 * Lyrics with all chords removed — used to build the search index.
 *
 * Placeholders are resolved as far as the body alone allows, so a line reading
 * `%{artist}` is indexed as the artist rather than as the six characters of the
 * placeholder. Only as far as the body allows: the title and the artist usually live in
 * columns this function cannot see, and a name it cannot resolve indexes as nothing, which
 * is still better than indexing `%{artist}` and matching a search for «artist».
 */
export function plainLyrics(song: ParsedSong): string {
  const lines: string[] = []
  const values = metadataValues(song, null, null)

  for (const section of song.sections) {
    for (const line of section.lines) {
      if (line.kind !== 'lyrics') continue
      lines.push(
        line.words
          .map((word) => substituteMetadata(word.parts.map((part) => part.text).join(''), values))
          .join(' '),
      )
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
export function chordTokens(song: ParsedSong, played = true): string[] {
  const seen = new Set<string>()

  for (const section of song.sections) {
    for (const line of section.lines) {
      if (line.kind !== 'lyrics') continue
      /*
       * A line past a modulation plays its chords `shift` semitones higher than they are
       * written, so the song's chord list — the diagrams somebody learns before they start —
       * names the ones actually played there, as if the file had written them out. `played`
       * false asks for the chords as written, which is what estimating the song's opening key
       * wants: a last chorus a tone up is not evidence about where the song starts.
       */
      const shift = played ? (line.shift ?? 0) : 0
      for (const word of line.words) {
        for (const part of word.parts) {
          if (part.chord === null || part.annotation === true) continue
          if (shift === 0) seen.add(part.chord)
          else if (line.shift !== undefined) {
            const moved = shiftToken(part.chord, shift)
            if (moved !== null) seen.add(moved)
          }
        }
      }
    }
  }
  return [...seen]
}

/** A chord token moved by semitones, written back in international notation; null for a non-chord. */
function shiftToken(token: string, semitones: number): string | null {
  const chord = parseChord(token)
  if (chord === null) return null
  const root = spellPitchClass(chord.root + semitones, false)
  const bass = chord.bass === null ? '' : `/${spellPitchClass(chord.bass + semitones, false)}`
  return `${root}${chord.suffix}${bass}`
}
