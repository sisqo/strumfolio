import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  type FlatRow,
  balancedCut,
  flattenGroups,
  lineWeight,
  regroupRows,
  sectionWeight,
  splitByRows,
  splitLinesForColumns,
  splitRowsForColumns,
} from './layout'
import type { Line, Section } from '../chordpro'

/** A lyrics line of `n` words — the words themselves never matter to a weight. */
function lyrics(words = 1): Line {
  return {
    kind: 'lyrics',
    hasChords: false,
    words: Array.from({ length: words }, () => ({ parts: [{ chord: null, text: 'la' }] })),
  }
}

function verse(lines: number): Section {
  return { kind: 'verse', lines: Array.from({ length: lines }, () => lyrics()) }
}

function weightOf(sections: Section[]): number {
  return sections.reduce((sum, section) => sum + sectionWeight(section, true), 0)
}

test('a lyrics line weighs the same however many words it has, and less with no chord row', () => {
  assert.equal(lineWeight(lyrics(6), true), lineWeight(lyrics(1), true))
  assert.ok(lineWeight(lyrics(1), false) < lineWeight(lyrics(1), true))
})

test('a tab block weighs its own rows, each much shorter than a line of words', () => {
  const tab: Line = { kind: 'tab', rows: ['e|--0--', 'B|--1--', 'G|--0--', 'D|--2--', 'A|--3--', 'E|-----'] }
  const perRow = lineWeight(tab, true) / 6
  assert.ok(perRow < lineWeight(lyrics(1), true) / 2, 'a tab row is well under half a lyrics line')
})

test('an empty tab block still carries some weight rather than none', () => {
  assert.ok(lineWeight({ kind: 'tab', rows: [] }, true) > 0)
})

test('a chorus weighs more than a verse of the same lines, for its padding and rule', () => {
  const lines = Array.from({ length: 4 }, () => lyrics())
  assert.ok(sectionWeight({ kind: 'chorus', lines }, true) > sectionWeight({ kind: 'verse', lines }, true))
})

/**
 * The regression this file was written for. The old running `seen < half` test asked
 * whether the weight *before* a section had already passed half, so a final section
 * bigger than everything before it always joined the left column — and `BookletSongPage`
 * renders an empty right column as one full-width column, so the whole page silently
 * stopped being a two-column page.
 */
test('a long final section goes right, instead of dragging the whole page into one column', () => {
  const [left, right] = splitByRows([verse(1), verse(1), verse(20)], true)
  assert.equal(right.length, 1, 'the right column must not be empty')
  assert.equal(left.length, 2)
})

test('a long first section goes left and the short one still gets its own column', () => {
  const [left, right] = splitByRows([verse(20), verse(1)], true)
  assert.equal(left.length, 1)
  assert.equal(right.length, 1)
})

test('a short first section does not swallow the long one behind it', () => {
  const [left, right] = splitByRows([verse(1), verse(20)], true)
  assert.equal(left.length, 1)
  assert.equal(right.length, 1)
})

test('even sections divide down the middle', () => {
  const [left, right] = splitByRows([verse(5), verse(5), verse(5), verse(5)], true)
  assert.equal(left.length, 2)
  assert.equal(right.length, 2)
  assert.equal(weightOf(left), weightOf(right))
})

test('sections keep their written order across the divide', () => {
  const sections = [verse(3), verse(4), verse(3), verse(4)]
  const [left, right] = splitByRows(sections, true)
  assert.deepEqual([...left, ...right], sections)
})

/**
 * The one case that still renders single-column, and the reason `BookletSongPage` keeps
 * that branch at all: one indivisible stanza has no second column to balance against.
 * (A stanza too tall for a page never gets here whole — `paginateSong` divides it into
 * column pairs first.)
 */
test('a lone section leaves the right column empty, which is what makes the page full-width', () => {
  const [left, right] = splitByRows([verse(9)], true)
  assert.equal(left.length, 1)
  assert.equal(right.length, 0)
})

test('no sections at all divides into nothing, without throwing', () => {
  assert.deepEqual(splitByRows([], true), [[], []])
})

/**
 * The Bandabardò regression: a page of [six-string tab, stanza] was balanced as if the
 * tab were six lines of words, so the lyric column came out three times as tall as the
 * tab column and the page broke with both half-empty.
 */
test('a tab block is weighed by printed height, so the columns come out even', () => {
  const tab: Section = {
    kind: 'verse',
    lines: [{ kind: 'tab', rows: ['e|--', 'B|--', 'G|--', 'D|--', 'A|--', 'E|--'] }],
  }
  // Six tab rows ≈ 63pt ≈ two lyrics lines: the balanced cut pairs the tab with the
  // two-line verse, not with the six-line one row-counting would have matched it to.
  const [left, right] = splitByRows([tab, verse(2)], true)
  assert.equal(left.length, 1)
  assert.equal(right.length, 1)
  assert.ok(Math.abs(weightOf(left) - weightOf(right)) < lineWeight(lyrics(), true))
})

test('a divided stanza cuts its lines into two balanced columns', () => {
  const lines = Array.from({ length: 31 }, () => lyrics())
  const [left, right] = splitLinesForColumns(lines, true)
  assert.equal(left.length, 16)
  assert.equal(right.length, 15)
})

test('one line, or none, stays a single column', () => {
  assert.deepEqual(splitLinesForColumns([], true), [[], []])
  const one = [lyrics()]
  assert.deepEqual(splitLinesForColumns(one, true), [one, []])
})

test('balancedCut leaves nothing on the right only when there is at most one block', () => {
  assert.equal(balancedCut([]), 0)
  assert.equal(balancedCut([7]), 1)
  for (const weights of [
    [1, 1],
    [1, 50],
    [50, 1],
    [1, 1, 99],
    [99, 1, 1],
  ]) {
    assert.ok(balancedCut(weights) < weights.length, `${JSON.stringify(weights)} must fill both columns`)
  }
})

test('an equally balanced tie fills the left column, not the right', () => {
  // Cutting after the first block or after the second both leave a gap of 2. The fuller
  // left column wins, so a column pair never leans to the short side.
  assert.equal(balancedCut([2, 2, 2]), 2)
  const [left, right] = splitByRows([verse(2), verse(2), verse(2)], true)
  assert.ok(weightOf(left) >= weightOf(right), 'the left column carries at least as much as the right')
})

test('flattening and regrouping round-trip: one header row, then one row per entry', () => {
  const groups = [
    { sectionName: 'First', entries: ['a', 'b'] },
    { sectionName: 'Second', entries: ['c'] },
  ]
  const rows = flattenGroups(groups)
  assert.equal(rows.length, 5)
  assert.deepEqual(
    rows.map((row) => row.kind),
    ['header', 'entry', 'entry', 'header', 'entry'],
  )
  assert.deepEqual(regroupRows(rows), groups)
})

test('a slice that starts mid-group gets its header back, repeated', () => {
  const rows = flattenGroups([{ sectionName: 'Only', entries: ['a', 'b', 'c', 'd'] }])
  // The tail of a column or page break: entries whose header stayed in the previous slice.
  const groups = regroupRows(rows.slice(3))
  assert.deepEqual(groups, [{ sectionName: 'Only', entries: ['c', 'd'] }])
})

/**
 * The single-section songbook — the shape that used to render as one compressed,
 * illegible column beside a blank one, because a group could not be divided at all.
 */
test('one big group divides between the columns, mid-group', () => {
  const rows = flattenGroups([{ sectionName: 'Tutte', entries: Array.from({ length: 20 }, (_, i) => `s${i}`) }])
  const [left, right] = splitRowsForColumns(rows)
  assert.ok(left.length > 0 && right.length > 0, 'both columns carry rows')
  assert.ok(Math.abs(left.length - right.length) <= 1, 'and they are balanced')
  // The right column starts mid-group, so regrouping it synthesizes the repeated header.
  assert.equal(regroupRows(right)[0].sectionName, 'Tutte')
  assert.equal(regroupRows(right)[0].entries.length, right.length)
})

test('a header is never the last row of the left column', () => {
  // Ten rows whose balanced cut is 5, landing exactly on the second header (row index 4).
  const rows = flattenGroups([
    { sectionName: 'First', entries: ['a', 'b', 'c'] },
    { sectionName: 'Second', entries: ['d', 'e', 'f', 'g', 'h'] },
  ])
  assert.equal(rows[4].kind, 'header', 'the second header sits where the balanced cut falls')
  const [left, right] = splitRowsForColumns(rows)
  assert.equal(left.length, 6, 'the cut moved one row forward, past the stranded header')
  assert.notEqual(left[left.length - 1].kind, 'header')
  assert.equal(right.length, 4)
})

test('a lone header-and-entry pair stays together in the left column', () => {
  const rows = flattenGroups([{ sectionName: 'Only', entries: ['a'] }])
  const [left, right] = splitRowsForColumns(rows)
  assert.equal(left.length, 2)
  assert.equal(right.length, 0)
})

test('no rows divide into two empty columns without throwing', () => {
  const [left, right] = splitRowsForColumns([] as FlatRow<string>[])
  assert.deepEqual(left, [])
  assert.deepEqual(right, [])
})
