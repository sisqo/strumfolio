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
 * How many rows one parsed line prints as.
 *
 * One for lyrics — a chord row plus a words row, but every lyrics line in a song with any
 * chords at all gets both (see `roomForChords`), so they are all the same height and the
 * ratio is what matters here. One for a comment, which is shorter than a lyrics line but
 * not by enough to rank a split differently.
 *
 * A tab block is the exception worth counting properly: it is a single `Line` that prints
 * one row per string, so counting it as 1 told a split that six rows of tablature were
 * the same size as one line of words.
 */
export function lineRows(line: Line): number {
  return line.kind === 'tab' ? Math.max(1, line.rows.length) : 1
}

export function sectionRows(section: Section): number {
  return section.lines.reduce((sum, line) => sum + lineRows(line), 0)
}

/**
 * How many of these blocks belong in the left column: the cut whose two sides come out
 * closest in weight.
 *
 * This replaces a running `seen < half` test that compared the weight accumulated
 * *before* the current block against the half-way mark — judging a block by what preceded
 * it rather than by what it would make of the column it joined. The visible failure was a
 * final block larger than everything before it, which always landed left: a page of two
 * short stanzas and one long one put all three in the left column, leaving the right one
 * empty and the whole page rendering as a single full-width column. `layout.test.ts` pins
 * exactly that shape.
 *
 * Returns `weights.length` — everything left, nothing right — only when there is at most
 * one block to place. For two or more, leaving the last block on the right is always
 * closer to balanced than an empty column, so a page or an index only renders
 * single-column when it genuinely has one indivisible block on it.
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
 * Splits a song's sections between the two columns of one page, by row count rather than
 * by section count — a page of one long verse and one short chorus would divide unevenly
 * by section alone. Never mid-section: a stanza stays whole (see the `stanza` style's own
 * `wrap={false}`), and sections keep the order they were written in, some in one column
 * and the rest continuing in the other.
 *
 * A section too tall to fit a page even alone is not this function's problem — it is
 * divided by line before it ever gets here, by `paginateSong`.
 */
export function splitByRows(sections: Section[]): [Section[], Section[]] {
  const cut = balancedCut(sections.map(sectionRows))
  return [sections.slice(0, cut), sections.slice(cut)]
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
