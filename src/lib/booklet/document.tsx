/**
 * The booklet as a PDF, laid out the same way the reading screen is: chords
 * sitting above the exact syllable they belong to, word by word — see
 * `SongSheet`'s own comment on why that has to be word-by-word rather than
 * line-by-line to survive wrapping.
 *
 * Visual design follows a pixel-mockup handoff (cover, index, song and
 * continuation pages) rather than the app's own on-screen look — a printed
 * booklet is its own artifact with its own paper palette, not a screenshot of
 * the reader. The mockup groups runs of chord-less words into one span with
 * literal spaces; this file keeps the reading screen's own word-by-word
 * model instead (dropped whitespace, reinserted as a margin) since the two
 * produce the same visual result and rebuilding the parser around the
 * mockup's DOM shape would buy nothing — see its own README: match the
 * output, not the prototype's structure.
 *
 * Written key by default: a booklet is printed for a room, not for the one person who
 * happened to press the button, and their capo or their `-2` has no business on
 * somebody else's page uninvited. A reader may still opt in, per download (never
 * remembered — see `BookletPanel`), to their own capo/transposition for a personal
 * copy; when they do, `BookletSong.personal` carries it and every affected page says so
 * out loud (`transposeNote` below), the same sentence `TransposeNote` puts on the
 * reading screen — including in the one case where the letters printed don't change at
 * all (capo and transposition cancelling, see `music/capo.ts`'s own comment), because
 * the note is what stops that from reading as a silent no-op.
 *
 * Colors are literal hex, not `var(--accent)` and friends: a PDF has no
 * stylesheet to read custom properties from, and this page's paper palette
 * (warm off-black ink, terracotta accent, a ladder of greys for rules and
 * captions) is its own, separate from the screen theme in `DESIGN.md`.
 *
 * Helvetica and Courier, not Outfit and Geist Mono — a standing divergence from
 * `DESIGN.md`, decided and kept rather than unnoticed, and the reasons below are
 * the real ones. This paragraph used to argue that embedding the app's own fonts
 * would cost a booklet its offline build, and that argument was wrong twice
 * over: `next/font/google` self-hosts, so there is no CDN in the picture at
 * runtime at all, and a booklet is *already* online-only — `loadBooklet` is a
 * server action, so with no connection the button never gets as far as this
 * file. There was nothing offline here to protect. Anybody reweighing this
 * choice should weigh these two things instead:
 *
 * **Format.** What `next/font` self-hosts is woff2, and react-pdf's
 * `Font.register` does not read it. Using Outfit here means committing a
 * separate `.ttf` of it to `public/` and keeping that copy in step with
 * whatever the screen font becomes — a second source of truth for the
 * typeface, which is the part that makes this more than a one-line change.
 *
 * **Metrics.** Every `fontSize` below was tuned against Helvetica's own
 * advance widths, and the layout does not merely *look* different in another
 * face: `paginateSong` finds each song's page breaks by rendering real PDFs
 * and counting their pages (`countPages`), so a different typeface moves where
 * the pages break, not just how they read. A font swap is therefore a
 * re-typesetting pass over the whole booklet, not a substitution.
 *
 * What the standard fonts buy, and the one thing the old paragraph had right:
 * Standard-14 needs no embedding at all, so nothing is downloaded, parsed or
 * carried inside the file.
 *
 * The cost, stated plainly because it is visible on every page: Standard-14
 * Helvetica has only normal and bold, not the 500 the mockup and `DESIGN.md`'s
 * One Voice Rule both ask for, so every weight below is rounded to whichever of
 * the two reads closer — which makes a printed booklet's headings heavier than
 * the same headings on screen.
 *
 * Cover, index, songs — the index has to print a page number next to every
 * song, and there is no way to know those before the songs themselves are
 * laid out, since a page is as long as its own lyrics make it, not a fixed
 * slot. `pdf-lib` reads a throwaway rendered PDF back just to count its
 * physical pages — see `countPages` — which is also how each song finds its
 * own page breaks: `paginateSong` renders growing prefixes of a song's
 * sections and asks `countPages` whether they still fit on one physical
 * page, binary-searching for the largest prefix that does. `@react-pdf/renderer`
 * lays out a fixed tree and won't balance text across columns as it
 * overflows the way a browser's own CSS columns would, so this is the
 * closest a fixed layout can get to that: a page's own worth of sections,
 * once found, is what decides how many physical pages the whole song needs —
 * there's no separate measuring pass to reconcile with a later render.
 *
 * A section never splits across the column divide (see `splitByRows`), and a
 * stanza never splits across a column or page break either (see the
 * `stanza` style's own comment). A page whose sections all land in one
 * column — the common case for a page down to its last stanza or two —
 * renders as one full-width column rather than a half-width one sitting next
 * to empty space; see `BookletSongPage`'s own comment.
 *
 * The index doesn't get this same per-page measurement treatment — it still
 * splits its groups into two columns once by row count (`splitGroupsIntoColumns`)
 * and leaves any overflow to `@react-pdf/renderer`'s own pagination, so a long
 * enough index can show the same half-width-column-next-to-blank-space
 * artifact a song page used to. Nobody's reported that in practice, since a
 * songbook's own index rarely spans more than a page or two.
 */

import { Fragment } from 'react'

import { Document, Font, Link, Page, Path, StyleSheet, Svg, Text, View, pdf } from '@react-pdf/renderer'
import { PDFDocument } from 'pdf-lib'

import type { Booklet, BookletSong } from './actions'
import { type Line, type Section, chordTokens, parseChordPro } from '../chordpro'
import { type PartAnchor, buildAnchorMap, notesAt } from '../comments/anchorMap'
import { type SongComment, inReadingOrder } from '../comments/types'
import { type Notation, parseChord, transposeChord, formatChord } from '../music/chord'
import { readKey, readShift, transposeNoteText } from '../music/capo'
import { estimateKey } from '../music/key'
import { C_MAJOR } from '../music/notes'

// React-pdf hyphenates long words by default (a title wrapping as "ani-mati"),
// which reads as a typo rather than typesetting. A song title or chord chart
// should wrap at word boundaries, never split one open.
Font.registerHyphenationCallback((word) => [word])

/**
 * The note glyph on the cover badge: the same path `IconNote` draws on screen,
 * copied rather than imported because react-pdf's `<Path>` is not the DOM's.
 * The viewBox travels with it as a constant, and both go together every time the
 * logo is redrawn: a new path under the old box distorts the glyph silently —
 * nothing type-errors, and the only place it shows is a generated PDF.
 */
const BRAND_ICON_PATH =
  'M21.9 178.0C8.0 175.6 -1.3 164.3 0.5 152.1C3.6 131.3 31.8 113.6 53.1 119.1L59.0 120.7L59.0 60.3L59.0 0.0L65.3 0.0L71.6 0.0L73.7 7.3C76.8 17.6 82.1 25.1 94.9 37.0C110.9 52.0 117.2 62.2 118.6 75.2C119.8 87.0 114.5 102.7 106.2 112.0C101.0 117.9 99.8 116.7 102.6 108.3C110.2 85.9 102.4 65.4 82.7 55.5C70.6 49.5 71.8 44.9 72.1 98.2C72.4 143.9 72.3 144.6 70.1 150.2C65.9 160.9 57.5 169.2 45.6 174.5C41.1 176.5 29.1 179.3 27.0 178.9C26.7 178.8 24.4 178.4 21.9 178.0Z'

const BRAND_ICON_VIEWBOX = '0 0 119 179'

const INK = '#16181d'
const MUTED = '#5c626c'
const FAINT = '#8d939c'
const FOOTER_GREY = '#a8aab0'
const CONTINUATION_GREY = '#b0b2b8'
const RULE = '#e6e3dc'
const COLUMN_RULE = '#efece5'
const LEADER_DOTS = '#d5d1c8'
const ACCENT = '#97490f'
const ACCENT_BG = '#faf6f1'
const BADGE_TEXT = '#fffaf4'
/** The reading screen's own note blue (`--note`, light theme) — a comment must never
 *  read as part of the music, so it never borrows the chord accent. */
const NOTE_BLUE = '#2f5f8f'
/** `ACCENT` diluted against a white page — a bridge's own rule, quieter than a chorus's solid one. */
const BRIDGE_RULE = '#dbbfab'

const styles = StyleSheet.create({
  coverPage: {
    paddingTop: 72,
    paddingHorizontal: 63,
    paddingBottom: 45,
    fontFamily: 'Helvetica',
  },
  page: {
    paddingTop: 54,
    paddingHorizontal: 63,
    paddingBottom: 56,
    fontFamily: 'Helvetica',
  },
  /*
   * Absolutely positioned, not a flow sibling of the content above it: a
   * `fixed` element that stays in flow competes with the column layout for
   * the page's height, and on a page whose content exactly fills the page
   * that starves the last line of room rather than pushing it to the next
   * page. Pinning it to the page's own edges — the page already reserves the
   * room in its `paddingBottom` — keeps it out of that fight.
   */
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 63,
    right: 63,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerBordered: {
    borderTopWidth: 0.75,
    borderTopColor: RULE,
    paddingTop: 13.5,
  },
  footerCaption: {
    fontSize: 8.25,
    color: FOOTER_GREY,
  },

  // Cover
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  badgeIcon: {
    width: 19.5,
    height: 19.5,
    borderRadius: 6,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontSize: 9.75,
    color: FAINT,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  coverTitle: {
    fontSize: 68,
    fontWeight: 'bold',
    lineHeight: 0.96,
    letterSpacing: -1.2,
    color: INK,
  },
  coverMeta: {
    fontSize: 14.25,
    color: MUTED,
    marginTop: 21,
  },
  coverDivider: {
    marginTop: 39,
    paddingTop: 22.5,
    borderTopWidth: 0.75,
    borderTopColor: INK,
  },
  coverHighlights: {
    fontSize: 14.25,
    lineHeight: 1.6,
    color: MUTED,
  },

  // Index
  indexHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: 15,
    borderBottomWidth: 0.75,
    borderBottomColor: INK,
  },
  indexTitle: {
    fontSize: 27,
    fontWeight: 'bold',
    letterSpacing: -0.5,
    color: INK,
  },
  indexSongbookName: {
    fontSize: 10.5,
    color: FAINT,
  },
  indexColumns: {
    flexDirection: 'row',
    marginTop: 22.5,
  },
  indexColumnLeft: {
    flex: 1,
    marginRight: 26,
  },
  indexColumn: {
    flex: 1,
  },
  indexGroup: {
    marginBottom: 16.5,
  },
  indexGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 7.5,
  },
  indexGroupLabel: {
    fontSize: 8.625,
    fontWeight: 'bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: ACCENT,
  },
  indexGroupRule: {
    flex: 1,
    height: 0.75,
    backgroundColor: RULE,
  },
  indexRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 5.25,
  },
  indexRowTitle: {
    fontSize: 10.5,
    color: INK,
  },
  indexLeader: {
    flex: 1,
    marginHorizontal: 4.5,
    marginBottom: 2,
    borderBottomWidth: 0.75,
    borderBottomColor: LEADER_DOTS,
    borderBottomStyle: 'dotted',
  },
  indexPageNumber: {
    fontSize: 10.5,
    color: MUTED,
  },

  // Song pages
  songHeader: {
    paddingBottom: 13.5,
    borderBottomWidth: 0.75,
    borderBottomColor: INK,
  },
  songHeaderLabel: {
    fontSize: 8.625,
    fontWeight: 'bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: ACCENT,
    marginBottom: 7.5,
  },
  songTitle: {
    fontSize: 25.5,
    fontWeight: 'bold',
    lineHeight: 1.05,
    letterSpacing: -0.5,
    color: INK,
  },
  songArtist: {
    fontSize: 11.25,
    color: MUTED,
    marginTop: 4.5,
  },
  /** `TransposeNote`'s sentence, printed — see `prepare`'s own comment on why it must. */
  personalNote: {
    fontSize: 8.625,
    fontStyle: 'italic',
    color: ACCENT,
    marginTop: 4.5,
  },
  songLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 10.5,
  },
  songLink: {
    fontSize: 8.625,
    color: ACCENT,
    textDecoration: 'underline',
  },
  continuationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: 10.5,
    borderBottomWidth: 0.75,
    borderBottomColor: RULE,
  },
  continuationTitle: {
    fontSize: 11.25,
    color: MUTED,
  },
  continuationSuffix: {
    color: CONTINUATION_GREY,
  },
  columns: {
    flexDirection: 'row',
    flex: 1,
    marginTop: 19.5,
  },
  /** A page whose content all lands in one column (see `BookletSongPage`) gets the full width instead of sitting next to an empty second column. */
  columnsSingle: {
    flex: 1,
    marginTop: 19.5,
  },
  columnLeft: {
    flex: 1,
    marginRight: 15,
  },
  column: {
    flex: 1,
    paddingLeft: 15,
    borderLeftWidth: 0.75,
    borderLeftColor: COLUMN_RULE,
  },
  stanza: {
    marginBottom: 12,
  },
  /** A chorus's graphical reference: a solid accent rule and a tinted box — no label needed to tell it apart. */
  stanzaChorus: {
    paddingTop: 8.25,
    paddingHorizontal: 9,
    paddingBottom: 9,
    borderLeftWidth: 1.5,
    borderLeftColor: ACCENT,
    backgroundColor: ACCENT_BG,
  },
  /** A bridge's graphical reference: the same indent as a chorus but a quieter rule and no fill, plus italics — matches the reading screen's own `is-bridge` treatment. */
  stanzaBridge: {
    paddingLeft: 9,
    borderLeftWidth: 1.5,
    borderLeftColor: BRIDGE_RULE,
    fontStyle: 'italic',
  },
  comment: {
    fontSize: 8.625,
    fontStyle: 'italic',
    color: MUTED,
    marginBottom: 4,
  },
  tabRow: {
    fontFamily: 'Courier',
    fontSize: 7.5,
    color: INK,
  },
  lineSpacing: {
    marginTop: 3.75,
  },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  word: {
    flexDirection: 'row',
    marginRight: 3,
  },
  part: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  chord: {
    fontSize: 8.25,
    fontWeight: 'bold',
    color: ACCENT,
  },
  /** Only a real chord label needs breathing room before the next part; a blank placeholder doesn't. */
  chordGap: {
    paddingRight: 3.7,
  },
  lyric: {
    fontSize: 9.75,
    color: INK,
  },
  /** The footnote marker, right after the text it's about — see `markerNumbers`'s own
   *  comment on why it can carry more than one number. */
  noteMarker: {
    fontSize: 6,
    color: NOTE_BLUE,
  },

  // Notes, at the foot of the song they belong to
  footnotesGroup: {
    marginTop: 15,
  },
  /** The orphan group's own label — same wording as the reading screen's, since it
   *  is the same fact: these notes lost their hold on the text (`reanchor.ts`). */
  footnotesOrphanLabel: {
    fontSize: 8.625,
    fontStyle: 'italic',
    color: MUTED,
    marginBottom: 6,
  },
  footnoteRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  footnoteNumber: {
    width: 18,
    flex: 'none',
    fontSize: 8.625,
    fontWeight: 'bold',
    color: NOTE_BLUE,
  },
  footnoteBody: {
    flex: 1,
    fontSize: 9,
    lineHeight: 1.4,
    color: INK,
  },
})

/**
 * The page number, and — on the plans whose booklet carries one — the footer line: the
 * fixed "Printed with Strumfolio · …", nothing, or the account's own words. `footerText`
 * is resolved once on the server and travels on `loadBooklet`'s result — see
 * `resolveFooterText` there — so this component never decides what a plan may print,
 * only draws whatever string it was handed.
 *
 * The `Text` element is rendered either way and only its *content* goes empty, which is
 * deliberate and load-bearing. Page numbers come from measuring renders (`countPages`,
 * `sectionsPerPage`), so a footer that changed height between the measured document and
 * the printed one would shift every song's page number in the index — silently, with
 * nothing for the compiler to catch and no test in this repo able to see it.
 */
function Footer({ footerText, bordered = true }: { footerText: string; bordered?: boolean }) {
  return (
    <View style={[styles.footer, bordered ? styles.footerBordered : undefined]} fixed>
      <Text style={styles.footerCaption}>{footerText}</Text>
      <Text
        style={styles.footerCaption}
        render={({ pageNumber }) => (pageNumber === 1 ? '' : String(pageNumber))}
      />
    </View>
  )
}

function CoverPage({ booklet, footerText }: { booklet: Booklet; footerText: string }) {
  const songCount = booklet.sections.reduce((sum, section) => sum + section.songs.length, 0)
  const sectionNames = booklet.sections.map((section) => section.name)

  return (
    <Page size="A4" style={styles.coverPage}>
      <View style={styles.badgeRow}>
        <View style={styles.badgeIcon}>
          <Svg width={10.5} height={10.5} viewBox={BRAND_ICON_VIEWBOX}>
            <Path d={BRAND_ICON_PATH} fill={BADGE_TEXT} />
          </Svg>
        </View>
        <Text style={styles.badgeLabel}>Strumfolio</Text>
      </View>

      <View style={{ flex: 1 }} />

      <Text style={styles.coverTitle}>{booklet.songbookName}</Text>
      <Text style={styles.coverMeta}>
        {songCount} {songCount === 1 ? 'song' : 'songs'} · {sectionNames.length}{' '}
        {sectionNames.length === 1 ? 'section' : 'sections'}
      </Text>

      {sectionNames.length > 0 && (
        <View style={styles.coverDivider}>
          <Text style={styles.coverHighlights}>{sectionNames.join(' · ')}</Text>
        </View>
      )}

      <View style={{ flex: 1 }} />

      <Footer footerText={footerText} bordered={false} />
    </Page>
  )
}

/** One song row in the index, grouped under the songbook section it belongs to. */
interface IndexEntry {
  title: string
  /** Null only for the measuring pass, before any page number is known yet. */
  page: number | null
}

interface IndexGroup {
  sectionName: string
  entries: IndexEntry[]
}

/**
 * Splits index groups into two columns by row count (a group header plus one
 * row per song), never mid-group — the index equivalent of `splitByRows`.
 */
function splitGroupsIntoColumns(groups: IndexGroup[]): [IndexGroup[], IndexGroup[]] {
  const totalRows = groups.reduce((sum, group) => sum + 1 + group.entries.length, 0)
  const half = totalRows / 2

  const left: IndexGroup[] = []
  const right: IndexGroup[] = []
  let seen = 0

  for (const group of groups) {
    if (seen < half) {
      left.push(group)
    } else {
      right.push(group)
    }
    seen += 1 + group.entries.length
  }

  return [left, right]
}

function IndexColumn({ groups }: { groups: IndexGroup[] }) {
  return (
    <>
      {groups.map((group, groupIndex) => (
        <View key={groupIndex} style={styles.indexGroup} wrap={false}>
          <View style={styles.indexGroupHeader}>
            <Text style={styles.indexGroupLabel}>{group.sectionName}</Text>
            <View style={styles.indexGroupRule} />
          </View>
          {group.entries.map((entry, entryIndex) => (
            <View key={entryIndex} style={styles.indexRow}>
              <Text style={styles.indexRowTitle}>{entry.title}</Text>
              <View style={styles.indexLeader} />
              <Text style={styles.indexPageNumber}>{entry.page ?? ''}</Text>
            </View>
          ))}
        </View>
      ))}
    </>
  )
}

function IndexPage({
  songbookName,
  groups,
  footerText,
}: {
  songbookName: string
  groups: IndexGroup[]
  footerText: string
}) {
  const [left, right] = splitGroupsIntoColumns(groups)

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.indexHeader}>
        <Text style={styles.indexTitle}>Index</Text>
        <Text style={styles.indexSongbookName}>{songbookName}</Text>
      </View>

      <View style={styles.indexColumns}>
        <View style={styles.indexColumnLeft}>
          <IndexColumn groups={left} />
        </View>
        <View style={styles.indexColumn}>
          <IndexColumn groups={right} />
        </View>
      </View>

      <Footer footerText={footerText} />
    </Page>
  )
}

/** A song's three link slots, empty ones dropped, order kept. */
function linksOf(song: BookletSong): string[] {
  return [song.link1, song.link2, song.link3].filter((link) => link !== null)
}

/**
 * Everything the booklet needs to print this reader's own comments on this song — or
 * null when they asked for the written key's silence on the matter (see
 * `includeComments` on `BookletPanel`) or simply never annotated this particular song.
 *
 * `anchorsByLine` is keyed on the `Line` object itself rather than on an index, because
 * `paginateSong`/`splitByRows` slice `parsed.sections` into pages and columns by taking
 * sub-arrays, never by cloning — the same `Line` reference that lived in the whole song
 * still lives in whichever page and column it lands in, so an identity-keyed map built
 * once, before any slicing, keeps answering correctly after it.
 */
interface BookletNotes {
  anchorsByLine: Map<Line, PartAnchor[][]>
  /** In reading order — every number printed, on a marker or in the footnote list, is a
   *  position in this list, never recomputed some other way. */
  comments: SongComment[]
  numberById: Map<string, number>
}

function buildNotes(song: BookletSong, sections: Section[]): BookletNotes | null {
  if (song.comments.length === 0) return null

  const comments = inReadingOrder(song.comments)
  const numberById = new Map(comments.map((comment, index) => [comment.id, index + 1]))

  // The map is flat over the whole song's lyrics lines, in source order — the same
  // counter `SongSheet` keeps, kept here across every section before any page or
  // column split touches them, since the map's indices assume nothing has yet.
  const anchorMap = buildAnchorMap(song.body)
  const anchorsByLine = new Map<Line, PartAnchor[][]>()
  let lyricLine = -1
  for (const section of sections) {
    for (const line of section.lines) {
      if (line.kind !== 'lyrics') continue
      lyricLine += 1
      anchorsByLine.set(line, anchorMap[lyricLine] ?? [])
    }
  }

  return { anchorsByLine, comments, numberById }
}

/**
 * One song's parsed body, ready to lay out — computed once and reused for every line.
 *
 * `song.personal` is null both when the reader chose the written key for this download
 * and when they asked for their own settings but never saved any for this particular
 * song — either way `shift` comes out 0 and `spellingKey` comes out `written`, so this
 * does not need to tell the two apart. `transposeNote` does still tell them apart: it is
 * built straight from `song.personal`, never from `shift`, precisely so the one case
 * where a capo and a transposition cancel on the page (`shift === 0` with a real capo
 * set) still gets its sentence — see this file's own top comment.
 */
function prepare(song: BookletSong, notation: Notation) {
  const parsed = parseChordPro(song.body)
  const written = estimateKey(chordTokens(parsed)) ?? C_MAJOR

  const personal = song.personal
  const shift = personal === null ? 0 : readShift(personal.semitones, personal.capo)
  const spellingKey = personal === null ? written : readKey(written, personal.semitones, personal.capo)
  const transposeNote = personal === null ? null : transposeNoteText(personal.capo, personal.semitones)

  const chordLabel = (raw: string | null): string | null => {
    if (raw === null) return null
    const chord = parseChord(raw)
    if (chord === null) return raw
    return formatChord(transposeChord(chord, shift, spellingKey), notation)
  }

  const roomForChords = parsed.sections.some((section) =>
    section.lines.some((line) => line.kind === 'lyrics' && line.hasChords),
  )

  const notes = buildNotes(song, parsed.sections)

  return { parsed, chordLabel, roomForChords, transposeNote, notes }
}

/** The footnote numbers a marker carries — more than one when several notes are
 *  stacked on the exact same point, since a printed page has no tap to expand them
 *  the way the reading screen's one badge does. */
function markerNumbers(ids: string[], numberById: Map<string, number>): string {
  return ids.map((id) => numberById.get(id) ?? '?').join(',')
}

function BookletLine({
  line,
  chordLabel,
  roomForChords,
  notes,
}: {
  line: Line
  chordLabel: (raw: string | null) => string | null
  roomForChords: boolean
  /** Null when the reader printed with no comments — see `BookletNotes`'s own comment. */
  notes: BookletNotes | null
}) {
  if (line.kind === 'comment') {
    return <Text style={styles.comment}>{line.text}</Text>
  }

  if (line.kind === 'tab') {
    return (
      <>
        {line.rows.map((row, index) => (
          <Text key={index} style={styles.tabRow}>
            {row}
          </Text>
        ))}
      </>
    )
  }

  const anchorsForLine = notes?.anchorsByLine.get(line)

  return (
    <View style={styles.line}>
      {line.words.map((word, wordIndex) => (
        <View key={wordIndex} style={styles.word}>
          {word.parts.map((part, partIndex) => {
            const label = chordLabel(part.chord)
            const anchor = anchorsForLine?.[wordIndex]?.[partIndex]
            const lyricNote = notes !== null && anchor !== undefined ? notesAt(notes.comments, anchor, 'lyric') : null
            const chordNote = notes !== null && anchor !== undefined ? notesAt(notes.comments, anchor, 'chord') : null

            return (
              <View key={partIndex} style={styles.part}>
                {roomForChords && (
                  <Text style={label === null ? styles.chord : [styles.chord, styles.chordGap]}>
                    {label ?? ' '}
                    {chordNote !== null && chordNote.ids.length > 0 && (
                      <Text style={styles.noteMarker}> {markerNumbers(chordNote.ids, notes!.numberById)}</Text>
                    )}
                  </Text>
                )}
                <Text style={styles.lyric}>
                  {part.text === '' ? ' ' : part.text}
                  {lyricNote !== null && lyricNote.ids.length > 0 && (
                    <Text style={styles.noteMarker}> {markerNumbers(lyricNote.ids, notes!.numberById)}</Text>
                  )}
                </Text>
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

function Stanzas({
  sections,
  chordLabel,
  roomForChords,
  notes,
}: {
  sections: Section[]
  chordLabel: (raw: string | null) => string | null
  roomForChords: boolean
  notes: BookletNotes | null
}) {
  return (
    <>
      {sections.map((section, sectionIndex) => (
        <View
          key={sectionIndex}
          /*
           * No text ever names a section — a chorus and a bridge tell
           * themselves apart by their own rule and fill (or italics), the
           * same graphical-only distinction the reading screen's own
           * `is-chorus`/`is-bridge` styling makes, never a printed word.
           */
          style={
            section.kind === 'chorus'
              ? [styles.stanza, styles.stanzaChorus]
              : section.kind === 'bridge'
                ? [styles.stanza, styles.stanzaBridge]
                : styles.stanza
          }
          /*
           * Never split, on a column or a page break alike: print convention
           * keeps a verse or chorus whole, and it also happens to be the
           * simplest way to guarantee a chord is never stranded apart from
           * its own lyric — nothing inside an unbreakable block can be torn.
           */
          wrap={false}
        >
          {section.lines.map((line, lineIndex) => (
            <View key={lineIndex} style={lineIndex > 0 ? styles.lineSpacing : undefined}>
              <BookletLine line={line} chordLabel={chordLabel} roomForChords={roomForChords} notes={notes} />
            </View>
          ))}
        </View>
      ))}
    </>
  )
}

/**
 * Splits a song's sections into two roughly even halves, by line count rather
 * than by section count — a song of one long verse and one short chorus would
 * split unevenly by section alone. Never mid-section: a stanza stays whole
 * (see the `stanza` style's own `wrap={false}`), but sections stay in the
 * order they were written, half in one column, the rest continuing in the
 * other.
 */
function splitByRows(sections: Section[]): [Section[], Section[]] {
  const totalLines = sections.reduce((sum, section) => sum + section.lines.length, 0)
  const half = totalLines / 2

  const left: Section[] = []
  const right: Section[] = []
  let seen = 0

  for (const section of sections) {
    if (seen < half) {
      left.push(section)
    } else {
      right.push(section)
    }
    seen += section.lines.length
  }

  return [left, right]
}

/**
 * One physical page of a song: its own slice of sections, already known (by
 * `paginateSong`) to fit here, split into columns by `splitByRows`. That split
 * leaves the right column empty exactly when the last section alone already
 * carries at least half the page's own lines — in practice, a page trailing
 * off with just one or two short stanzas left. Rather than sit that lone
 * content in a half-width column next to a blank one, the page renders it as
 * a single full-width column instead.
 */
function BookletSongPage({
  title,
  artist,
  links,
  sectionName,
  sections,
  chordLabel,
  roomForChords,
  transposeNote,
  notes,
  isFirstPage,
  footerText,
}: {
  title: string
  artist: string | null
  /** The song's own links, in their fixed slots — empty ones already dropped. */
  links: string[]
  /** The songbook section this song lives in — shown as a running header on every page. */
  sectionName: string
  sections: Section[]
  chordLabel: (raw: string | null) => string | null
  roomForChords: boolean
  /** `TransposeNote`'s sentence for this song, or null when printed in the written key. */
  transposeNote: string | null
  notes: BookletNotes | null
  isFirstPage: boolean
  footerText: string
}) {
  const [left, right] = splitByRows(sections)

  return (
    <Page size="A4" style={styles.page} wrap>
      {isFirstPage ? (
        <View style={styles.songHeader}>
          <Text style={styles.songHeaderLabel}>{sectionName}</Text>
          <Text style={styles.songTitle}>{title}</Text>
          {artist !== null && <Text style={styles.songArtist}>{artist}</Text>}
          {transposeNote !== null && <Text style={styles.personalNote}>{transposeNote}</Text>}
          {links.length > 0 && (
            <View style={styles.songLinks}>
              {links.map((link) => (
                <Link key={link} src={link} style={styles.songLink}>
                  {link.replace(/^https?:\/\//, '')}
                </Link>
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={styles.continuationHeader}>
          <Text style={styles.continuationTitle}>
            {title} <Text style={styles.continuationSuffix}>— continues</Text>
          </Text>
          <Text style={styles.songHeaderLabel}>{sectionName}</Text>
        </View>
      )}

      {right.length === 0 ? (
        <View style={styles.columnsSingle}>
          <Stanzas sections={left} chordLabel={chordLabel} roomForChords={roomForChords} notes={notes} />
        </View>
      ) : (
        <View style={styles.columns}>
          <View style={styles.columnLeft}>
            <Stanzas sections={left} chordLabel={chordLabel} roomForChords={roomForChords} notes={notes} />
          </View>
          <View style={styles.column}>
            <Stanzas sections={right} chordLabel={chordLabel} roomForChords={roomForChords} notes={notes} />
          </View>
        </View>
      )}

      <Footer footerText={footerText} />
    </Page>
  )
}

/**
 * Every one of this reader's own comments on a song, at the foot of it — the numbers
 * printed here are exactly the ones a marker carries in the lyrics above, so a page torn
 * out of the booklet still reads on its own.
 *
 * Its own page(s) rather than sharing the song's last one: `paginateSong`'s binary
 * search already measures the tightest fit for the lyrics alone, and asking it to also
 * account for a footnote block only on whichever prefix turns out to be the last would
 * mean measuring two different things at once. A dedicated page, measured the same way
 * the cover and the index already are (`countPages`, once, reused for the real render),
 * keeps that measurement honest without touching the lyrics' own.
 *
 * Left in `@react-pdf/renderer`'s own hands if the list itself overflows one page — the
 * same trade-off `IndexPage`'s own comment already accepts, and for the same reason: a
 * songbook's own notes rarely run past a page or two.
 */
function BookletFootnotesPage({
  title,
  comments,
  footerText,
}: {
  title: string
  /** In reading order — row N is footnote number N + 1. */
  comments: SongComment[]
  footerText: string
}) {
  const anchored = comments.filter((comment) => comment.anchor !== null)
  const orphaned = comments.filter((comment) => comment.anchor === null)

  const row = (comment: SongComment) => (
    <View key={comment.id} style={styles.footnoteRow} wrap={false}>
      <Text style={styles.footnoteNumber}>{comments.indexOf(comment) + 1}</Text>
      <Text style={styles.footnoteBody}>{comment.body}</Text>
    </View>
  )

  return (
    <Page size="A4" style={styles.page} wrap>
      <View style={styles.continuationHeader}>
        <Text style={styles.continuationTitle}>
          {title} <Text style={styles.continuationSuffix}>— notes</Text>
        </Text>
      </View>

      <View style={styles.footnotesGroup}>{anchored.map(row)}</View>

      {orphaned.length > 0 && (
        <View style={styles.footnotesGroup}>
          <Text style={styles.footnotesOrphanLabel}>
            {orphaned.length === 1
              ? 'No longer anchored to the words:'
              : `${orphaned.length} notes no longer anchored to the words:`}
          </Text>
          {orphaned.map(row)}
        </View>
      )}

      <Footer footerText={footerText} />
    </Page>
  )
}

/** Every song, flattened in order, each remembering which section it belongs to. */
function flatten(booklet: Booklet): { song: BookletSong; sectionName: string }[] {
  const flat: { song: BookletSong; sectionName: string }[] = []
  for (const section of booklet.sections) {
    for (const song of section.songs) {
      flat.push({ song, sectionName: section.name })
    }
  }
  return flat
}

/**
 * How many physical pages one `<Page>` element takes, by rendering it alone and
 * reading the result back with `pdf-lib` — the only reliable way to ask
 * `@react-pdf/renderer` "how long is this", since it lays a page out as long as
 * its own content makes it, not to a fixed slot this function could compute by
 * itself.
 */
async function countPages(page: React.ReactElement): Promise<number> {
  const blob = await pdf(<Document>{page}</Document>).toBlob()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const rendered = await PDFDocument.load(bytes)
  return rendered.getPageCount()
}

/**
 * The largest prefix of `remaining` that still renders onto a single
 * physical page, by binary search over `countPages` — trusting a real render
 * rather than a line-count estimate, since a stanza's actual height depends
 * on word-wrap and chorus padding that counting lines can't see. Always
 * returns at least 1, so a single stanza taller than a page still makes
 * progress on the next page rather than looping forever.
 *
 * The binary search assumes a longer prefix never fits in fewer pages than a
 * shorter one — true for the lines themselves, but not exactly true of
 * `render`'s own output: `BookletSongPage` switches between a full-width and
 * a half-width column depending on how a prefix happens to split (see its own
 * comment), and text wraps more in the narrower one. So this can occasionally
 * settle for a shorter page than the tallest one that would still fit — never
 * a page that overflows, since every `lo` is a prefix actually measured to
 * fit — just an occasional missed few lines of capacity.
 */
async function sectionsPerPage(
  remaining: Section[],
  render: (sections: Section[]) => React.ReactElement,
): Promise<number> {
  if (remaining.length === 1) return 1
  if ((await countPages(render(remaining))) <= 1) return remaining.length

  let lo = 1
  let hi = remaining.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const pageCount = await countPages(render(remaining.slice(0, mid)))
    if (pageCount <= 1) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return lo
}

/**
 * Splits one song into the physical pages it will actually take, finding
 * each page break by measurement (see `sectionsPerPage`) instead of
 * splitting the whole song once by line count and hoping `@react-pdf/renderer`'s
 * own pagination lines the two columns up sensibly across a page break — it
 * doesn't (see this file's own top comment for the failure that caused).
 */
async function paginateSong(
  song: BookletSong,
  sectionName: string,
  notation: Notation,
  footerText: string,
): Promise<{
  pages: Section[][]
  chordLabel: (raw: string | null) => string | null
  roomForChords: boolean
  transposeNote: string | null
  notes: BookletNotes | null
  /** The song's own notes, at its foot — rendered once here and reused as-is for the
   *  real document, the same reason `IndexPage`'s own element is (see `countPages`'
   *  own comment): a second render of the same props could only ever agree. */
  footnotes: { element: React.ReactElement; pageCount: number } | null
}> {
  const { parsed, chordLabel, roomForChords, transposeNote, notes } = prepare(song, notation)

  const links = linksOf(song)

  const renderCandidate = (sections: Section[], isFirstPage: boolean) => (
    <BookletSongPage
      title={song.title}
      artist={song.artist}
      links={links}
      sectionName={sectionName}
      sections={sections}
      chordLabel={chordLabel}
      roomForChords={roomForChords}
      transposeNote={transposeNote}
      notes={notes}
      isFirstPage={isFirstPage}
      footerText={footerText}
    />
  )

  const pages: Section[][] = []
  let remaining = parsed.sections
  while (remaining.length > 0) {
    const isFirstPage = pages.length === 0
    const count = await sectionsPerPage(remaining, (sections) => renderCandidate(sections, isFirstPage))
    pages.push(remaining.slice(0, count))
    remaining = remaining.slice(count)
  }
  // An empty song body still gets one (empty) page, so the index has somewhere to point.
  if (pages.length === 0) pages.push([])

  let footnotes: { element: React.ReactElement; pageCount: number } | null = null
  if (notes !== null) {
    const element = <BookletFootnotesPage title={song.title} comments={notes.comments} footerText={footerText} />
    footnotes = { element, pageCount: await countPages(element) }
  }

  return { pages, chordLabel, roomForChords, transposeNote, notes, footnotes }
}

/** Renders the booklet to a downloadable blob — the one thing the export panel needs. */
export async function bookletToBlob(booklet: Booklet, notation: Notation, footerText: string): Promise<Blob> {
  const entries = flatten(booklet)

  // Every song starts a fresh page and shares no flow with its neighbours, so
  // how it paginates depends only on its own words — safe to do in parallel,
  // before any page number exists.
  const songPagination = await Promise.all(
    entries.map((entry) => paginateSong(entry.song, entry.sectionName, notation, footerText)),
  )

  // The index's own length turns on how many songs and sections there are,
  // never on the digits printed next to them — a row is exactly as tall
  // whether it says "3" or "103" — so it can be measured with no real page
  // numbers in hand yet.
  const measureGroups: IndexGroup[] = booklet.sections.map((section) => ({
    sectionName: section.name,
    entries: section.songs.map((song) => ({ title: song.title, page: null })),
  }))
  const indexPageCount = await countPages(
    <IndexPage songbookName={booklet.songbookName} groups={measureGroups} footerText={footerText} />,
  )

  // Page 1 is the cover, the index follows it, and every song starts right
  // where the one before it left off. A song's own notes, when it has any, are
  // pages of its own right after its last lyrics page (see `BookletFootnotesPage`'s
  // own comment) — counted here so the *next* song's index entry still points at
  // the right page, even though nothing ever links to the notes pages themselves.
  let page = 1 + indexPageCount + 1
  const startPages: number[] = songPagination.map((songPages) => {
    const startsAt = page
    page += songPages.pages.length + (songPages.footnotes?.pageCount ?? 0)
    return startsAt
  })

  let i = 0
  const indexGroups: IndexGroup[] = booklet.sections.map((section) => ({
    sectionName: section.name,
    entries: section.songs.map((song) => {
      const entry: IndexEntry = { title: song.title, page: startPages[i] }
      i += 1
      return entry
    }),
  }))

  const document = (
    <Document title={booklet.songbookName}>
      <CoverPage booklet={booklet} footerText={footerText} />
      <IndexPage songbookName={booklet.songbookName} groups={indexGroups} footerText={footerText} />
      {entries.map((entry, index) => (
        <Fragment key={index}>
          {songPagination[index].pages.map((sections, pageIndex) => (
            <BookletSongPage
              key={pageIndex}
              title={entry.song.title}
              artist={entry.song.artist}
              links={linksOf(entry.song)}
              sectionName={entry.sectionName}
              sections={sections}
              chordLabel={songPagination[index].chordLabel}
              roomForChords={songPagination[index].roomForChords}
              transposeNote={songPagination[index].transposeNote}
              notes={songPagination[index].notes}
              isFirstPage={pageIndex === 0}
              footerText={footerText}
            />
          ))}
          {songPagination[index].footnotes?.element}
        </Fragment>
      ))}
    </Document>
  )

  return pdf(document).toBlob()
}
