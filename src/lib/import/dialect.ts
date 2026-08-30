/**
 * Which app wrote this file, and therefore what its directives mean.
 *
 * The whole reason this module exists is that the same directive means different
 * things in different apps, and reading one with the wrong table corrupts a field
 * without producing an error anywhere. `{a: Beatles}` is the artist in OnSong and the
 * *album* in MobileSheets. `{st: …}` is a subtitle in the ChordPro specification and
 * was redefined by OnSong to mean the artist. `{book: …}` names the songbook in
 * OnSong and is an alias for the album in MobileSheets. Each of those, read under the
 * wrong assumption, silently files the right value in the wrong place — and a wrong
 * value that arrived quietly is worse than a missing one, because nothing ever
 * prompts anybody to look at it again.
 *
 * So: sniff the dialect once per file, then read that dialect's table. When nothing
 * identifies the source, the ambiguous directives are **ignored rather than guessed**
 * — `{a: …}` in a file of unknown provenance becomes neither artist nor album.
 *
 * ## One inherited exception, deliberately kept
 *
 * `DIRECTIVE_ALIAS` in `chordpro.ts` already maps `st` and `subtitle` onto `artist`,
 * and has since long before this module existed. On the single most contested
 * directive in the whole survey, this app therefore already follows *OnSong's*
 * convention rather than the specification's. That is not corrected here. Files that
 * import correctly today would start importing differently, which is a regression
 * dressed as a standards fix — and the value in `{st:}` is, in every real file this
 * repo has seen, an artist. The base table stays as shipped; only what the base table
 * does not already decide is decided here.
 */

/** The apps whose directive conventions differ enough to matter. */
export type Dialect = 'chordpro' | 'onsong' | 'songbookpro' | 'mobilesheets'

/**
 * A canonical field name, or `null` for «recognised, but nothing here holds it».
 *
 * `null` is not the same as an unknown directive: `{album: …}` is understood, and
 * dropped on purpose because no column holds an album. Saying so in one place is what
 * keeps the next reader from wiring it to `tags` for want of anywhere better.
 */
export type Field =
  | 'title'
  | 'artist'
  | 'tags'
  | 'songbookName'
  | 'sectionName'
  | 'link1'
  | 'link2'
  | 'link3'
  | 'comment'
  | 'key'
  | 'capo'
  | 'tempo'
  | 'timeSignature'
  | 'duration'
  | 'copyright'
  | 'ccli'

/**
 * What every dialect agrees on: the directives that mean the same thing everywhere.
 *
 * Anything in this table is safe to read without knowing where the file came from,
 * which is what makes an unrecognised file still worth reading rather than refusing.
 */
const COMMON: Record<string, Field | null> = {
  key: 'key',
  capo: 'capo',
  tempo: 'tempo',
  bpm: 'tempo',
  time: 'timeSignature',
  duration: 'duration',
  length: 'duration',
  copyright: 'copyright',
  ccli: 'ccli',
  'ccli-number': 'ccli',
  ccli_number: 'ccli',
  footer: null,
  album: null,
  year: null,
  composer: null,
  lyricist: null,
  number: null,
  flow: null,
  tuning: null,
  midi: null,
  pitch: null,
  keywords: 'tags',
  topic: 'tags',
}

/**
 * What each dialect decides differently. Every entry here is a confirmed collision —
 * a directive that at least two of these apps read as two different things.
 *
 * `chordpro` is both a real dialect and the fallback for a file nobody could place,
 * which is why its ambiguous entries are `null`: under that table, «I do not know
 * where this came from» and «this abbreviation is not in the specification» happen to
 * call for exactly the same answer, which is to leave the value alone.
 */
const OVERRIDES: Record<Dialect, Record<string, Field | null>> = {
  chordpro: {
    // Not an abbreviation in the specification at all; and with the source unknown,
    // it is as likely to be MobileSheets' album as OnSong's artist. Left alone.
    a: null,
    k: null,
    ok: null,
    su: null,
    f: null,
    gc: null,
    cb: 'comment',
    book: null,
  },
  onsong: {
    a: 'artist',
    k: 'key',
    // OnSong's «original key» — the key before its own transposition. We store the
    // written key, and the written key is what `{key:}` holds, so this is dropped
    // rather than allowed to overwrite it.
    ok: null,
    f: null,
    // `{cb}` is `comment_bold` here and `comment_box` everywhere else. Both are a
    // comment as far as anything in this app can render, so the distinction costs
    // nothing to lose — but it must not fall through to somewhere else.
    cb: 'comment',
    // The one directive where OnSong's meaning is the *useful* one: it names the
    // songbook the song came from.
    book: 'songbookName',
  },
  mobilesheets: {
    // The collision that motivates this whole module.
    a: null,
    su: null,
    gc: 'comment',
    cb: 'comment',
    // An alias for the album here, not a songbook. Dropped, like every other album.
    book: null,
  },
  songbookpro: {
    a: null,
    cb: 'comment',
    book: null,
  },
}

/**
 * OnSong's metatags, which are not directives at all.
 *
 * They sit as `Name: Value` lines in the first block of the file, before the first
 * blank line, and no other format in the survey writes metadata that way. That is
 * both what makes them recognisable and what makes them dangerous to recognise
 * loosely: `Ritornello:` on a line of its own is an ordinary section label in a plain
 * chords-above file, and `convert.ts` already reads it as one. So a line only counts
 * as a metatag if its name is one OnSong actually defines *and* it carries a value —
 * which `Ritornello:` does not.
 */
const ONSONG_METATAGS: Record<string, Field | null> = {
  title: 'title',
  artist: 'artist',
  album: null,
  key: 'key',
  'transposed key': null,
  capo: 'capo',
  tempo: 'tempo',
  time: 'timeSignature',
  duration: 'duration',
  copyright: 'copyright',
  ccli: 'ccli',
  book: 'songbookName',
  number: null,
  flow: null,
  keywords: 'tags',
  topic: 'tags',
  subdivision: null,
  beat: null,
  scene: null,
  restrictions: null,
  midi: null,
  'midi-index': null,
  pitch: null,
  tuning: null,
  footer: null,
  composer: null,
  lyricist: null,
  year: null,
  presenter: null,
}

/** `Name: Value`, with a value that is actually there. */
const METATAG_LINE = /^([A-Za-z][A-Za-z -]{0,20}):[ \t]+(\S.*)$/

/**
 * How many lines of the opening block read as OnSong metatags.
 *
 * Zero for every other format, which is the point: a ChordPro file opens with
 * `{title: …}`, an OpenSong file with `<`, and a plain chords-above file with a title
 * or a chord line — none of which match `Name: Value` with a name OnSong defines.
 */
function onSongMetatagCount(text: string): number {
  let count = 0

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (line.trim() === '') break

    const match = METATAG_LINE.exec(line)
    if (match === null) continue
    if (Object.hasOwn(ONSONG_METATAGS, match[1].trim().toLowerCase())) count++
  }

  return count
}

/**
 * Which app wrote this, decided from the content and never from the file name.
 *
 * An extension cannot answer this: a `.chopro` exported *by OnSong* holds OnSong's
 * conventions, and OnSong will happily open a file called anything at all. The
 * fingerprints below are each unique to one app in the whole surveyed set.
 *
 * Order matters. SongbookPro's and MobileSheets' fingerprints are single directives
 * that could in principle appear in a file that also has OnSong metatags; OnSong's is
 * a block of lines and is the strongest signal of the three, so it is tested first.
 */
export function sniffDialect(text: string): Dialect {
  if (onSongMetatagCount(text) > 0) return 'onsong'

  // SongbookPro's own invention; nothing else defines it.
  if (/\{\s*textfill\s*[:}]/i.test(text)) return 'songbookpro'

  // Two aliases MobileSheets defines and nobody else does.
  if (/\{\s*(su|gc)\s*:/i.test(text)) return 'mobilesheets'

  return 'chordpro'
}

/**
 * The field a directive names in a given dialect, or `null` to leave it alone.
 *
 * Returns `undefined` for a directive this knows nothing about, which is how a caller
 * tells «drop this on purpose» (`null`) from «this is not ours to read»
 * (`undefined`) — the second falls through to `chordpro.ts`'s own base table, which
 * is what keeps `{title:}`, `{soc}` and the rest working exactly as before.
 */
export function fieldFor(name: string, dialect: Dialect): Field | null | undefined {
  const key = name.trim().toLowerCase()

  const override = OVERRIDES[dialect]
  if (Object.hasOwn(override, key)) return override[key]
  if (Object.hasOwn(COMMON, key)) return COMMON[key]

  return undefined
}

/** One `Name: Value` metatag read off an OnSong file. */
export interface Metatag {
  field: Field
  value: string
}

/**
 * Reads OnSong's opening metatag block, and says where it ends.
 *
 * The count is what the caller needs in order to *remove* those lines from the body:
 * left in place they would render as the first verse, exactly as a plain-text heading
 * would — which is the same problem `deduce.ts` already solves for headings, and is
 * solved the same way.
 */
export function readOnSongMetatags(text: string): { tags: Metatag[]; consumed: number } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const tags: Metatag[] = []
  let consumed = 0

  for (const line of lines) {
    if (line.trim() === '') break
    consumed++

    const match = METATAG_LINE.exec(line)
    if (match === null) continue

    const field = ONSONG_METATAGS[match[1].trim().toLowerCase()]
    if (field != null) tags.push({ field, value: match[2].trim() })
  }

  // Only a block that is *entirely* metatags is a metatag block. One `Name: Value`
  // line among four lyric lines is a lyric line with a colon in it.
  const everyLineIsATag = lines
    .slice(0, consumed)
    .every((line) => METATAG_LINE.test(line) && Object.hasOwn(ONSONG_METATAGS, (METATAG_LINE.exec(line) as RegExpExecArray)[1].trim().toLowerCase()))

  return everyLineIsATag ? { tags, consumed } : { tags: [], consumed: 0 }
}
