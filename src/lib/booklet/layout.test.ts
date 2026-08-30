import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  type FlatRow,
  balancedCut,
  flattenGroups,
  flattenSections,
  fragmentSections,
  lastPageCut,
  lineWeight,
  regroupRows,
  sectionWeight,
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

test('flattening a song keeps every line, in order, remembering its stanza', () => {
  const a = verse(2)
  const b = verse(3)
  const flat = flattenSections([a, b])
  assert.equal(flat.length, 5)
  assert.deepEqual(
    flat.map((item) => item.section),
    [a, a, b, b, b],
  )
  assert.deepEqual(
    flat.map((item) => item.line),
    [...a.lines, ...b.lines],
  )
})

test('fragments regroup a run of lines under their stanzas, sharing the Line objects', () => {
  const a = verse(2)
  const b: Section = { kind: 'chorus', lines: Array.from({ length: 3 }, () => lyrics()) }
  const flat = flattenSections([a, b])
  const fragments = fragmentSections(flat)
  assert.equal(fragments.length, 2)
  assert.equal(fragments[0].kind, 'verse')
  assert.equal(fragments[1].kind, 'chorus')
  // Shared by identity, never cloned — the comment markers' anchor map depends on it.
  assert.equal(fragments[0].lines[0], a.lines[0])
  assert.equal(fragments[1].lines[2], b.lines[2])
})

test('a slice that starts mid-stanza becomes a fragment that keeps the stanza kind', () => {
  const chorus: Section = { kind: 'chorus', lines: Array.from({ length: 6 }, () => lyrics()) }
  const flat = flattenSections([chorus])
  const fragments = fragmentSections(flat.slice(4))
  assert.equal(fragments.length, 1)
  assert.equal(fragments[0].kind, 'chorus', 'the continuation keeps its tint and rule')
  assert.equal(fragments[0].lines.length, 2)
})

test('a stanza divided across a slice boundary is two fragments of the same kind', () => {
  const a = verse(4)
  const b = verse(4)
  const flat = flattenSections([a, b])
  // A column bottom falling mid-`b`: lines 0..5 = all of a and half of b.
  const fragments = fragmentSections(flat.slice(0, 6))
  assert.equal(fragments.length, 2)
  assert.equal(fragments[1].lines.length, 2)
})

test('the last page cut divides a one-stanza song evenly', () => {
  const flat = flattenSections([verse(31)])
  const cut = lastPageCut(flat, true)
  assert.equal(cut, 16)
})

test('the last page cut prefers a stanza boundary when it costs little', () => {
  // 7 + 6 lines: the boundary at 7 is one line off perfect balance — close enough to win.
  const flat = flattenSections([verse(7), verse(6)])
  assert.equal(lastPageCut(flat, true), 7)
})

test('the last page cut breaks a stanza when the boundary is too lopsided', () => {
  // 20 + 4 lines: cutting at the boundary leaves 20 against 4; the even cut wins.
  const flat = flattenSections([verse(20), verse(4)])
  assert.equal(lastPageCut(flat, true), 12)
})

test('the last page cut never empties either column', () => {
  for (const sections of [[verse(2)], [verse(1), verse(1)], [verse(50)]]) {
    const flat = flattenSections(sections)
    const cut = lastPageCut(flat, true)
    assert.ok(cut >= 1 && cut < flat.length, `${flat.length} lines cut at ${cut}`)
  }
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
