import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  type FlatRow,
  balancedCut,
  flattenGroups,
  lineRows,
  regroupRows,
  sectionRows,
  splitByRows,
  splitRowsForColumns,
} from './layout'
import type { Line, Section } from '../chordpro'

/** A lyrics line of `n` words — the words themselves never matter to a row count. */
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

function rowsOf(sections: Section[]): number {
  return sections.reduce((sum, section) => sum + sectionRows(section), 0)
}

test('a lyrics line and a comment each count as one row', () => {
  assert.equal(lineRows(lyrics(6)), 1)
  assert.equal(lineRows({ kind: 'comment', text: 'a long spoken aside that still prints as one line' }), 1)
})

test('a tab block counts its own rows, not one', () => {
  assert.equal(lineRows({ kind: 'tab', rows: ['e|--0--', 'B|--1--', 'G|--0--', 'D|--2--', 'A|--3--', 'E|-----'] }), 6)
})

test('an empty tab block still counts as one row rather than none', () => {
  assert.equal(lineRows({ kind: 'tab', rows: [] }), 1)
})

/**
 * The regression this file was written for. The old running `seen < half` test asked
 * whether the rows *before* a section had already passed half, so a final section bigger
 * than everything before it always joined the left column — and `BookletSongPage` renders
 * an empty right column as one full-width column, so the whole page silently stopped
 * being a two-column page.
 */
test('a long final section goes right, instead of dragging the whole page into one column', () => {
  const [left, right] = splitByRows([verse(1), verse(1), verse(20)])
  assert.equal(right.length, 1, 'the right column must not be empty')
  assert.equal(rowsOf(left), 2)
  assert.equal(rowsOf(right), 20)
})

test('a long first section goes left and the short one still gets its own column', () => {
  const [left, right] = splitByRows([verse(20), verse(1)])
  assert.equal(rowsOf(left), 20)
  assert.equal(rowsOf(right), 1)
})

test('a short first section does not swallow the long one behind it', () => {
  const [left, right] = splitByRows([verse(1), verse(20)])
  assert.equal(rowsOf(left), 1)
  assert.equal(rowsOf(right), 20)
})

test('even sections divide down the middle', () => {
  const [left, right] = splitByRows([verse(5), verse(5), verse(5), verse(5)])
  assert.equal(left.length, 2)
  assert.equal(right.length, 2)
  assert.equal(rowsOf(left), rowsOf(right))
})

test('sections keep their written order across the divide', () => {
  const sections = [verse(3), verse(4), verse(3), verse(4)]
  const [left, right] = splitByRows(sections)
  assert.deepEqual([...left, ...right], sections)
})

/**
 * The one case that still renders single-column, and the reason `BookletSongPage` keeps
 * that branch at all: one indivisible stanza has no second column to balance against.
 */
test('a lone section leaves the right column empty, which is what makes the page full-width', () => {
  const [left, right] = splitByRows([verse(9)])
  assert.equal(left.length, 1)
  assert.equal(right.length, 0)
})

test('no sections at all divides into nothing, without throwing', () => {
  assert.deepEqual(splitByRows([]), [[], []])
})

test('a tab-heavy section is weighed by its rows, so it is not mistaken for a short one', () => {
  const tab: Section = {
    kind: 'verse',
    lines: [{ kind: 'tab', rows: ['e|--', 'B|--', 'G|--', 'D|--', 'A|--', 'E|--'] }],
  }
  // Counted line-by-line the tab is 1 against the verse's 6, and the cut would fall the
  // other way; counted by rows the two sides are even.
  const [left, right] = splitByRows([tab, verse(6)])
  assert.equal(left.length, 1)
  assert.equal(right.length, 1)
  assert.equal(rowsOf(left), rowsOf(right))
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
  const [left, right] = splitByRows([verse(2), verse(2), verse(2)])
  assert.ok(rowsOf(left) >= rowsOf(right), 'the left column carries at least as much as the right')
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
