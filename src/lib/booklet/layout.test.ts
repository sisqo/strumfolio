import assert from 'node:assert/strict'
import { test } from 'node:test'

import { balancedCut, lineRows, sectionRows, splitByRows, splitGroupsIntoColumns } from './layout'
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

test('index groups divide by their own rows, header included', () => {
  const groups = [
    { sectionName: 'First', entries: ['a', 'b'] },
    { sectionName: 'Second', entries: ['c', 'd', 'e', 'f', 'g', 'h'] },
  ]
  const [left, right] = splitGroupsIntoColumns(groups)
  assert.deepEqual(
    left.map((group) => group.sectionName),
    ['First'],
  )
  assert.deepEqual(
    right.map((group) => group.sectionName),
    ['Second'],
  )
})

test('a big final index group does not drag every group into the left column', () => {
  const groups = [
    { sectionName: 'One', entries: ['a'] },
    { sectionName: 'Two', entries: ['b'] },
    { sectionName: 'Three', entries: Array.from({ length: 20 }, (_, i) => `s${i}`) },
  ]
  const [left, right] = splitGroupsIntoColumns(groups)
  assert.equal(right.length, 1, 'the right column must not be empty')
  assert.deepEqual(
    left.map((group) => group.sectionName),
    ['One', 'Two'],
  )
})

test('a single index group has nothing to divide against, and says so', () => {
  const [left, right] = splitGroupsIntoColumns([{ sectionName: 'Only', entries: ['a', 'b', 'c'] }])
  assert.equal(left.length, 1)
  assert.equal(right.length, 0)
})
