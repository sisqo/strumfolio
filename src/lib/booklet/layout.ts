/**
 * Where the booklet's two columns divide — the arithmetic part of `document.tsx`, kept
 * here so it can be tested.
 *
 * A plain module rather than living beside the components that use it, for the reason
 * this repo's `CLAUDE.md` gives about `testCard.ts`: `document.tsx` renders real PDFs to
 * measure itself, so nothing in it can be checked by `node:test`, while these are
 * synchronous functions over plain arrays and every interesting case is a three-element
 * list. The bug they were extracted to fix (see `balancedCut`) had been shipping
 * invisibly precisely because it lived where no test could reach it.
 *
 * Every weight here is **ordinal, not metric**: it ranks two candidate splits against
 * each other, and is never asked how tall anything is in points. Real height is measured
 * by rendering (`countPages` in `document.tsx`), which is the only thing that knows what
 * a chorus's padding, a wrapped line or a font's metrics actually cost. Adding estimates
 * of those here would make these numbers look authoritative without making them true.
 */

import type { Line, Section } from '../chordpro'

/**
 * Roughly how tall one parsed line prints, in points — estimated from the styles in
 * `document.tsx`, and used only to rank splits (see this file's top comment), never to
 * decide whether something fits.
 *
 * A lyrics line in a chorded song is a chord row over a words row (~29pt with its
 * spacing); in a song with no chords at all it is the words row alone (~17pt) — that
 * choice is song-wide (`roomForChords`), mirroring the reading screen's own documented
 * decision, which is why it travels in as a flag rather than reading `line.hasChords`. A
 * tab prints one Courier row per string at ~10.5pt each. Counting a six-string tab as one
 * unit — what this function's first version did — told a split that a whole tab block was
 * the size of one line of words, and the column carrying it came out a third as tall as
 * its neighbour.
 */
export function lineWeight(line: Line, roomForChords: boolean): number {
  if (line.kind === 'tab') return Math.max(1, line.rows.length) * 10.5
  if (line.kind === 'comment') return 16
  return roomForChords ? 29 : 17
}

/** The section's lines plus its own framing: every stanza carries a bottom margin, and a
 *  chorus or bridge adds its padding and rule. */
export function sectionWeight(section: Section, roomForChords: boolean): number {
  const framing = section.kind === 'verse' ? 12 : 29
  return framing + section.lines.reduce((sum, line) => sum + lineWeight(line, roomForChords), 0)
}

/**
 * How many of these blocks belong in the left column: the cut whose two sides come out
 * closest in weight. Used by the index's column split (`splitRowsForColumns`) — a song's
 * columns are filled by measurement instead, and only its final page balances, via
 * `lastPageCut`.
 *
 * This replaces a running `seen < half` test that compared the weight accumulated
 * *before* the current block against the half-way mark — judging a block by what preceded
 * it rather than by what it would make of the column it joined. The visible failure was a
 * final block larger than everything before it, which always landed left, leaving the
 * right column empty. `layout.test.ts` pins exactly that shape.
 *
 * Returns `weights.length` — everything left, nothing right — only when there is at most
 * one block to place.
 *
 * Ties go to the fuller left column; see the comparison's own comment below.
 */
export function balancedCut(weights: number[]): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0)

  let bestCut = weights.length
  let bestGap = Infinity
  let left = 0

  for (let cut = 1; cut <= weights.length; cut += 1) {
    left += weights[cut - 1]
    const gap = Math.abs(left - (total - left))
    // `<=`, so a tie goes to the later cut — the fuller left column. Two columns are read
    // left to right, and a pair that leans to the short side reads as though the writer
    // ran out rather than balanced. It cannot empty the right column by accident: the
    // all-left cut's own gap is the whole weight, which nothing else ties unless every
    // block after the cut weighs nothing at all.
    if (gap <= bestGap) {
      bestGap = gap
      bestCut = cut
    }
  }

  return bestCut
}

/**
 * One printable line of a song with the stanza it came from — the unit the whole layout
 * flows in. The line is the only thing that never breaks: a lyrics `Line` renders its
 * chord row and its words row as one block, so a chord can never end a column with its
 * syllable at the top of the next. Everything larger — a verse, a chorus, a tab block's
 * neighbourhood — may divide wherever a column bottom falls: a column is filled as far as
 * it can be, newspaper-style, and the stanza continues in the next column or on the next
 * page. Stanza identity travels with each line so the renderer can regroup a column's
 * lines into styled fragments (`fragmentSections`) — a chorus's tint and rule follow its
 * lines into whichever column they land in.
 */
export interface FlatLine {
  section: Section
  line: Line
}

export function flattenSections(sections: Section[]): FlatLine[] {
  return sections.flatMap((section) => section.lines.map((line) => ({ section, line })))
}

/**
 * A run of flat lines back into renderable sections: consecutive lines of the same stanza
 * become one fragment carrying that stanza's kind, so a chorus divided across a column
 * break is two tinted fragments rather than one tinted and one bare. `Line` objects are
 * shared, never cloned — the identity the comment markers' anchor map is keyed on.
 */
export function fragmentSections(items: FlatLine[]): Section[] {
  const fragments: Section[] = []
  let source: Section | null = null

  for (const item of items) {
    if (item.section !== source) {
      source = item.section
      fragments.push({ kind: source.kind, lines: [] })
    }
    fragments[fragments.length - 1].lines.push(item.line)
  }

  return fragments
}

/**
 * Where a song's final page divides its lines between the two columns: the balanced cut
 * over estimated heights, preferring a stanza boundary when one costs little.
 *
 * Only the final page is balanced at all — every other column is simply filled to the
 * bottom, and its cut is found by measurement, not here. On the final page nothing is
 * gained by filling (the songs after it start fresh pages regardless), so the leftover
 * lines divide evenly instead of leaving the right column a stub. Within `tolerance`
 * (roughly three lines) of the best gap, a cut where one stanza ends and another begins
 * wins over a cut mid-stanza: a stanza unbroken for free is kept whole, but never at the
 * price of columns more than a few lines apart — dense first, tidy second.
 */
export function lastPageCut(items: FlatLine[], roomForChords: boolean, tolerance = 90): number {
  const weights = items.map((item) => lineWeight(item.line, roomForChords))
  const total = weights.reduce((sum, weight) => sum + weight, 0)

  let bestGap = Infinity
  let bestCut = 1
  let left = 0
  const gaps: number[] = []
  for (let cut = 1; cut < items.length; cut += 1) {
    left += weights[cut - 1]
    const gap = Math.abs(left - (total - left))
    gaps[cut] = gap
    if (gap <= bestGap) {
      bestGap = gap
      bestCut = cut
    }
  }

  let boundaryCut: number | null = null
  let boundaryGap = Infinity
  for (let cut = 1; cut < items.length; cut += 1) {
    if (items[cut - 1].section === items[cut].section) continue
    if (gaps[cut] > bestGap + tolerance) continue
    if (gaps[cut] <= boundaryGap) {
      boundaryGap = gaps[cut]
      boundaryCut = cut
    }
  }

  return boundaryCut ?? bestCut
}

/** One songbook section's worth of index rows — a header, then a row per song. */
export interface ColumnGroup<T> {
  sectionName: string
  entries: T[]
}

/**
 * The index, flattened to the rows it actually prints — the unit its columns and pages
 * divide on. A group used to be that unit, and it could not be: a group is as long as a
 * songbook section, `wrap={false}` in the renderer means a too-long one cannot break, and
 * a single-section songbook of a hundred songs rendered as one column of overlapping,
 * illegible rows beside a blank one, with a stray blank page after. Rows are small and
 * uniform, so nothing built from them is ever too big to place.
 */
export type FlatRow<T> = { kind: 'header'; sectionName: string } | { kind: 'entry'; sectionName: string; entry: T }

export function flattenGroups<T>(groups: ColumnGroup<T>[]): FlatRow<T>[] {
  return groups.flatMap((group): FlatRow<T>[] => [
    { kind: 'header', sectionName: group.sectionName },
    ...group.entries.map((entry): FlatRow<T> => ({ kind: 'entry', sectionName: group.sectionName, entry })),
  ])
}

/**
 * Rows back into renderable groups. A slice that starts mid-group — the top of a second
 * column, or of a continuation page — starts with entries whose header stayed behind in
 * the previous slice, so the header is repeated for them, the way a printed index repeats
 * a letter heading when a letter's entries span a column break. That synthesized header
 * is one more row than the slice was cut to, which is fine everywhere this is used: a
 * column pair is balanced ordinally, and a page slice is measured by rendering exactly
 * what this returns.
 */
export function regroupRows<T>(rows: FlatRow<T>[]): ColumnGroup<T>[] {
  const groups: ColumnGroup<T>[] = []
  let current: ColumnGroup<T> | null = null

  for (const row of rows) {
    if (row.kind === 'header') {
      current = { sectionName: row.sectionName, entries: [] }
      groups.push(current)
    } else {
      if (current === null || current.sectionName !== row.sectionName) {
        current = { sectionName: row.sectionName, entries: [] }
        groups.push(current)
      }
      current.entries.push(row.entry)
    }
  }

  return groups
}

/**
 * Where one page's rows divide between its two columns: the balanced cut, nudged so a
 * header is never the last row of the left column — a heading with its entries in the
 * next column reads as a typo, and moving the cut one row forward puts its first entry
 * beside it while only making the left column the fuller one, which is the tie-breaking
 * direction `balancedCut` already leans.
 */
export function splitRowsForColumns<T>(rows: FlatRow<T>[]): [FlatRow<T>[], FlatRow<T>[]] {
  let cut = balancedCut(rows.map(() => 1))
  if (cut < rows.length && rows[cut - 1]?.kind === 'header') cut += 1
  return [rows.slice(0, cut), rows.slice(cut)]
}
