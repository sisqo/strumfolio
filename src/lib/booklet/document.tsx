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
 * What each `<Page>` element measured travels with it (`largestPrefixThatFits` returns
 * the page count beside the prefix, and `paginateSong` keeps it), because one page
 * element is not always one sheet. Assuming it was is what used to walk the index off:
 * an oversized stanza printed on two sheets, was counted as one, and every song after it
 * carried a page number one too low — a wrong number in the index, with nothing in the
 * types or the tests able to see it.
 *
 * A section never splits across the column divide (see `splitByRows` in `layout.ts`), and
 * a stanza never splits across a column or page break either (see the `stanza` style's
 * own comment) — with exactly one exception, made where the alternative was worse. A
 * stanza too tall to fit a page even by itself cannot be honoured whole: `wrap={false}`
 * means react-pdf pushes the entire block to a page of its own, leaving the page before
 * it holding nothing but the song's title and dropping whatever ran past the paper's
 * bottom edge. `paginateSong` divides such a stanza by line instead, evenly, so each
 * piece is a real page with its own header. It is the only place a stanza breaks.
 *
 * A page renders as one full-width column, rather than a half-width one beside empty
 * space, exactly when it carries a single indivisible stanza with nothing to balance
 * against; see `BookletSongPage` and `balancedCut`.
 *
 * The index gets the same measurement treatment (`paginateIndex`), on a smaller unit: the
 * row, not the group. A group is as long as a songbook section and renders `wrap={false}`,
 * so leaving its overflow to `@react-pdf/renderer`'s own pagination — which is what this
 * file used to do — meant a single-section songbook of a hundred songs printed as one
 * column of compressed, overlapping rows beside a blank one, plus a stray blank page. Rows
 * are small and uniform, so pages built from them always fit; a group whose rows continue
 * across a column or page break gets its header repeated there (`regroupRows`).
 */

import { Fragment } from 'react'

import { Document, Font, Link, Page, Path, StyleSheet, Svg, Text, View, pdf } from '@react-pdf/renderer'
import { PDFDocument } from 'pdf-lib'

import type { Booklet, BookletSong } from './actions'
import { type ColumnGroup, type FlatRow, flattenGroups, regroupRows, splitByRows, splitRowsForColumns } from './layout'
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
  /**
   * The account's own footer line, which is the only text down here a reader writes and
   * therefore the only one that can be too long for the strip it sits in. It shrinks
   * before the page number does, and `Footer` holds it to a single line — see there.
   */
  footerOwnLine: {
    flexShrink: 1,
    marginRight: 12,
    maxLines: 1,
    textOverflow: 'ellipsis',
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
 * `largestPrefixThatFits`), so a footer that changed height between the measured document
 * and the printed one would shift every song's page number in the index — silently, with
 * nothing for the compiler to catch and no test in this repo able to see it.
 *
 * The `maxLines: 1` on `footerOwnLine` — a style, not a prop, which is where react-pdf
 * reads it from — is the same invariant defended against the one string here a reader
 * writes. The strip is only as tall as the page's own bottom padding leaves room for, and
 * a footer long enough to wrap grows *upwards* into the words — it is absolutely
 * positioned, so nothing pushes back. A character cap cannot prevent that on its own,
 * since 140 narrow letters fit on the line and 140 wide ones do not, so the clamp belongs
 * here where the text is actually measured. `saveBookletFooter`'s own limit stays what it
 * is: a bound on what gets stored, not a promise about what fits.
 */
function Footer({ footerText, bordered = true }: { footerText: string; bordered?: boolean }) {
  return (
    <View style={[styles.footer, bordered ? styles.footerBordered : undefined]} fixed>
      <Text style={[styles.footerCaption, styles.footerOwnLine]}>{footerText}</Text>
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

type IndexGroup = ColumnGroup<IndexEntry>

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

/**
 * One physical page of the index: its own slice of rows, already known (by
 * `paginateIndex`) to fit here, divided between the two columns by
 * `splitRowsForColumns` and regrouped under their headers — a group whose rows continue
 * into the second column, or onto the next index page, gets its header repeated there
 * (see `regroupRows`), the way a printed index repeats a letter heading across a break.
 */
function IndexPage({
  songbookName,
  rows,
  footerText,
}: {
  songbookName: string
  rows: FlatRow<IndexEntry>[]
  footerText: string
}) {
  const [leftRows, rightRows] = splitRowsForColumns(rows)

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.indexHeader}>
        <Text style={styles.indexTitle}>Index</Text>
        <Text style={styles.indexSongbookName}>{songbookName}</Text>
      </View>

      <View style={styles.indexColumns}>
        <View style={styles.indexColumnLeft}>
          <IndexColumn groups={regroupRows(leftRows)} />
        </View>
        <View style={styles.indexColumn}>
          <IndexColumn groups={regroupRows(rightRows)} />
        </View>
      </View>

      <Footer footerText={footerText} />
    </Page>
  )
}

/**
 * Splits the index into the physical pages it takes, the same way `paginateSong` splits a
 * song: by measuring real renders (`largestPrefixThatFits`), never by trusting the
 * renderer's own pagination — which could not have worked here anyway, since every group
 * renders `wrap={false}` and a songbook section can hold more songs than a page holds
 * rows. Before this, a long enough index compressed its rows into an illegible column and
 * grew a stray blank page; now each page carries exactly the rows measured to fit it.
 *
 * Returns row-count slices rather than elements because it runs twice over the same
 * shape: once with `page: null` to learn how many pages the index needs (the numbers
 * cannot exist before the songs are placed, and a row is exactly as tall saying "3" as
 * "103"), and the real render then reuses the same slices with the numbers filled in.
 */
async function paginateIndex(
  rows: FlatRow<IndexEntry>[],
  render: (rows: FlatRow<IndexEntry>[]) => React.ReactElement,
): Promise<number[]> {
  const slices: number[] = []
  let remaining = rows
  while (remaining.length > 0) {
    const fit = await largestPrefixThatFits(remaining, render)
    let count = fit.count
    // A header as a page's last row belongs with its entries on the next page — one row
    // fewer than measured to fit can only fit too.
    if (count > 1 && remaining[count - 1].kind === 'header') count -= 1
    slices.push(count)
    remaining = remaining.slice(count)
  }
  // A songbook with no songs at all still gets its one (empty) index page.
  if (slices.length === 0) slices.push(0)
  return slices
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
 * One physical page of a song: its own slice of sections, already known (by
 * `paginateSong`) to fit here, split into columns by `splitByRows`. That split
 * leaves the right column empty only when the page carries one indivisible
 * stanza and there is nothing to balance it against — and rather than sit that
 * lone content in a half-width column next to a blank one, the page renders it
 * as a single full-width column instead.
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
  numberById,
  footerText,
}: {
  title: string
  /** In reading order — see `BookletNotes.comments`. */
  comments: SongComment[]
  /** The same map the markers in the lyrics read, rather than a position recomputed from
   *  `comments` here: two ways of arriving at the same number are two things to keep in
   *  step, and the marker on the page is the one a reader matches this row against. */
  numberById: Map<string, number>
  footerText: string
}) {
  const anchored = comments.filter((comment) => comment.anchor !== null)
  const orphaned = comments.filter((comment) => comment.anchor === null)

  const row = (comment: SongComment) => (
    <View key={comment.id} style={styles.footnoteRow} wrap={false}>
      <Text style={styles.footnoteNumber}>{numberById.get(comment.id) ?? '?'}</Text>
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
 * The largest prefix of `items` that still renders onto a single physical page, by binary
 * search over `countPages` — trusting a real render rather than a line-count estimate,
 * since a stanza's actual height depends on word-wrap and chorus padding that counting
 * lines can't see.
 *
 * `pages` is what that answer actually measured, and it is the whole reason this returns
 * a pair rather than a count. Every prefix the search *accepts* was measured at one page,
 * but the floor of 1 is not accepted, it is conceded: an item too tall to share a page
 * with the header above it has nowhere smaller to go, and the search still has to hand it
 * back so the caller makes progress instead of looping forever. Reporting `pages` is what
 * lets the caller tell those two answers apart — the old version returned the bare count
 * and every caller assumed one page, which is how a stanza that overflowed silently
 * shifted every following song's page number in the index.
 *
 * The binary search assumes a longer prefix never fits in fewer pages than a shorter one.
 * That is now very nearly exact: `BookletSongPage` renders full-width instead of
 * two-column only for a lone indivisible block (see `splitByRows`), so the layout no
 * longer flips back and forth between widths as the prefix grows.
 */
async function largestPrefixThatFits<T>(
  items: T[],
  render: (prefix: T[]) => React.ReactElement,
  /** What rendering all of `items` already measured, when a caller has just measured it —
   *  the whole-run render is this function's first step, and a caller that divides an
   *  oversized block re-enters with exactly the run it has already paid for. */
  measuredWhole?: number,
): Promise<{ count: number; pages: number }> {
  if (items.length === 0) return { count: 0, pages: 1 }
  if (items.length === 1) return { count: 1, pages: measuredWhole ?? (await countPages(render(items))) }

  const whole = measuredWhole ?? (await countPages(render(items)))
  if (whole <= 1) return { count: items.length, pages: whole }

  let lo = 1
  let hi = items.length - 1
  /** The page count measured for the current `lo`, or null while `lo` is still the
   *  untested floor the search started from. */
  let loPages: number | null = null
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const pageCount = await countPages(render(items.slice(0, mid)))
    if (pageCount <= 1) {
      lo = mid
      loPages = pageCount
    } else {
      hi = mid - 1
    }
  }

  return { count: lo, pages: loPages ?? (await countPages(render(items.slice(0, lo)))) }
}

/**
 * Splits one song into the physical pages it will actually take, finding
 * each page break by measurement (see `largestPrefixThatFits`) instead of
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
  /** One entry per `<Page>` element, with the physical pages that element measured —
   *  normally 1, and more only for the conceded case `largestPrefixThatFits` describes. */
  pages: { sections: Section[]; pageCount: number }[]
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

  const pages: { sections: Section[]; pageCount: number }[] = []
  let remaining = parsed.sections
  while (remaining.length > 0) {
    const isFirstPage = pages.length === 0
    const fit = await largestPrefixThatFits(remaining, (sections) => renderCandidate(sections, isFirstPage))

    /*
     * One stanza that will not fit this page even on its own. `wrap={false}` means
     * react-pdf cannot break it, so left alone it shoves the whole block onto a page of
     * its own and leaves this one holding nothing but the song's title — the orphaned
     * title page — with the lyrics then landing on a page that has no header at all, and
     * whatever ran past the bottom edge drawn off the paper where it does not print.
     *
     * So the stanza is divided here instead, by line and by measurement, and each piece
     * becomes a real page with its own header. Print convention keeps a stanza whole and
     * this is the one case that cannot honour it: the alternative is not an unbroken
     * stanza, it is a stanza with its end missing.
     */
    if (fit.pages > 1 && fit.count === 1 && remaining[0].lines.length > 1) {
      const oversized = remaining[0]
      const lines = await largestPrefixThatFits(
        oversized.lines,
        (prefix) => renderCandidate([{ ...oversized, lines: prefix }], isFirstPage),
        // Every line of it is the page just measured above, so don't render it twice.
        fit.pages,
      )
      if (lines.count < oversized.lines.length) {
        /*
         * Divided evenly rather than greedily. Filling this page to its last line and
         * pushing the rest over leaves whatever is left — one line, often — alone under a
         * "continues" header on the next page, which reads as a mistake rather than as a
         * stanza too long for one page. Spreading the same lines over the same number of
         * pages costs nothing and leaves both halves looking deliberate.
         */
        const spread = Math.ceil(oversized.lines.length / Math.ceil(oversized.lines.length / lines.count))
        pages.push({
          sections: [{ ...oversized, lines: oversized.lines.slice(0, spread) }],
          // Fewer lines than the prefix just measured to fit can only fit too; the
          // measured count carries over only when nothing was given back.
          pageCount: spread === lines.count ? lines.pages : 1,
        })
        remaining = [{ ...oversized, lines: oversized.lines.slice(spread) }, ...remaining.slice(1)]
        continue
      }
    }

    pages.push({ sections: remaining.slice(0, fit.count), pageCount: fit.pages })
    remaining = remaining.slice(fit.count)
  }
  // An empty song body still gets one (empty) page, so the index has somewhere to point.
  if (pages.length === 0) pages.push({ sections: [], pageCount: 1 })

  let footnotes: { element: React.ReactElement; pageCount: number } | null = null
  if (notes !== null) {
    const element = (
      <BookletFootnotesPage
        title={song.title}
        comments={notes.comments}
        numberById={notes.numberById}
        footerText={footerText}
      />
    )
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
  // whether it says "3" or "103" — so it can be paginated with no real page
  // numbers in hand yet, and the very same slices reused once they exist.
  const measureGroups: IndexGroup[] = booklet.sections.map((section) => ({
    sectionName: section.name,
    entries: section.songs.map((song) => ({ title: song.title, page: null })),
  }))
  const indexSlices = await paginateIndex(flattenGroups(measureGroups), (rows) => (
    <IndexPage songbookName={booklet.songbookName} rows={rows} footerText={footerText} />
  ))
  const indexPageCount = indexSlices.length

  // Page 1 is the cover, the index follows it, and every song starts right
  // where the one before it left off. A song's own notes, when it has any, are
  // pages of its own right after its last lyrics page (see `BookletFootnotesPage`'s
  // own comment) — counted here so the *next* song's index entry still points at
  // the right page, even though nothing ever links to the notes pages themselves.
  let page = 1 + indexPageCount + 1
  const startPages: number[] = songPagination.map((songPages) => {
    const startsAt = page
    // Each `<Page>`'s own measured height, never one-per-element: a page element that
    // conceded to an oversized stanza prints as more than one sheet, and counting it as
    // one is what used to walk every following song's index entry off by that much.
    page += songPages.pages.reduce((sum, songPage) => sum + songPage.pageCount, 0)
    page += songPages.footnotes?.pageCount ?? 0
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

  // The measured slices, re-cut over the rows that now carry real numbers — same section
  // names, same titles, same row count, so the same slice boundaries hold by construction.
  const indexRows = flattenGroups(indexGroups)
  const indexPages: FlatRow<IndexEntry>[][] = []
  let taken = 0
  for (const slice of indexSlices) {
    indexPages.push(indexRows.slice(taken, taken + slice))
    taken += slice
  }

  const document = (
    <Document title={booklet.songbookName}>
      <CoverPage booklet={booklet} footerText={footerText} />
      {indexPages.map((rows, index) => (
        <IndexPage key={index} songbookName={booklet.songbookName} rows={rows} footerText={footerText} />
      ))}
      {entries.map((entry, index) => (
        <Fragment key={index}>
          {songPagination[index].pages.map((songPage, pageIndex) => (
            <BookletSongPage
              key={pageIndex}
              title={entry.song.title}
              artist={entry.song.artist}
              links={linksOf(entry.song)}
              sectionName={entry.sectionName}
              sections={songPage.sections}
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
