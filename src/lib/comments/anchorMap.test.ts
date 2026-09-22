import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { type Line, parseChordPro } from '../chordpro'
import { fromSource } from '../editor/document'
import { buildAnchorMap } from './anchorMap'

test('a part anchor points at the very text the part shows', () => {
  const source = '[G]A[C]mazing [G]grace, how [D]sweet the sound'
  const map = buildAnchorMap(parseChordPro(source).sections, source)
  const { text } = fromSource(source).blocks[0] as { text: string }

  const [line] = [...map.values()]
  const [amazing, grace, how] = line
  assert.equal(text.slice(amazing[0].charOffset, amazing[0].charOffset + 1), 'A')
  assert.equal(text.slice(amazing[1].charOffset, amazing[1].charOffset + 6), 'mazing')
  assert.equal(text.slice(grace[0].charOffset, grace[0].charOffset + 6), 'grace,')
  assert.equal(text.slice(how[0].charOffset, how[0].charOffset + 3), 'how')
})

test('extra spacing in the source does not shift the anchors off the words', () => {
  // The reader collapses this to single spaces; the offsets must follow the source.
  const source = 'uno   due     tre'
  const map = buildAnchorMap(parseChordPro(source).sections, source)
  const { text } = fromSource(source).blocks[0] as { text: string }

  const [[uno, due, tre]] = [...map.values()]
  assert.equal(text.slice(uno[0].charOffset, uno[0].charOffset + 3), 'uno')
  assert.equal(text.slice(due[0].charOffset, due[0].charOffset + 3), 'due')
  assert.equal(text.slice(tre[0].charOffset, tre[0].charOffset + 3), 'tre')
})

test('the map has one entry per lyrics line the reader renders, in the same order', () => {
  const source = [
    '{title: T}',
    '',
    '{c: una nota}',
    'prima riga',
    '{soc}',
    'seconda riga',
    '{eoc}',
    '{start_of_tab}',
    'e|--0--|',
    '{end_of_tab}',
    'terza riga',
  ].join('\n')

  // One parse, used for both — the map is keyed on these very objects.
  const parsed = parseChordPro(source)
  const rendered = parsed.sections
    .flatMap((section) => section.lines)
    .filter((line): line is Extract<Line, { kind: 'lyrics' }> => line.kind === 'lyrics')

  const map = buildAnchorMap(parsed.sections, source)
  assert.equal(map.size, rendered.length)
  // Stronger than the counts agreeing: every line the reader draws is a key, so no drawn
  // line can be missing and no stale entry can be hiding among them.
  for (const line of rendered) assert.ok(map.has(line), 'a drawn line has no entry')
})

test('every real song in content/ maps one-to-one, and every anchor lands on its own letters', () => {
  const dir = path.join(process.cwd(), 'content')
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.txt') || f.endsWith('.pro') || f.endsWith('.chopro'))

  assert.ok(files.length > 0, 'expected the repertoire to be readable from content/')

  for (const file of files) {
    const source = readFileSync(path.join(dir, file), 'utf8')
    const parsed = parseChordPro(source)
    const map = buildAnchorMap(parsed.sections, source)
    const blocks = fromSource(source).blocks
    const rendered = parsed.sections
      .flatMap((section) => section.lines)
      .filter((line): line is Extract<Line, { kind: 'lyrics' }> => line.kind === 'lyrics')

    assert.equal(map.size, rendered.length, `${file}: line counts disagree`)

    /*
     * The key *is* the drawn line, so this no longer pairs two lists by position and hopes
     * they were built the same way — which is exactly the assumption that used to make a
     * repeated stanza or a joined line put every note below it on the wrong row.
     */
    map.forEach((words, line) => {
      if (line.kind !== 'lyrics') return
      assert.ok(rendered.includes(line), `${file}: an entry belongs to no drawn line`)

      words.forEach((parts, wordIndex) => {
        parts.forEach((anchor, partIndex) => {
          const block = blocks[anchor.blockIndex]
          assert.equal(block.kind, 'lyrics', `${file}: anchor points at a non-lyrics block`)
          if (block.kind !== 'lyrics') return
          const expected = line.words[wordIndex].parts[partIndex].text
          assert.equal(
            block.text.slice(anchor.charOffset, anchor.charOffset + expected.length),
            expected,
            `${file}: an anchor does not sit on its own text`,
          )
        })
      })
    })
  }
})

/*
 * The two shapes Phase 3 introduced, and the two the old counting map could not survive.
 */
test('a joined line resolves each half into the source line it really sits in', () => {
  const source = 'uno due \\\nquattro cinque'
  const parsed = parseChordPro(source)
  const map = buildAnchorMap(parsed.sections, source)
  const blocks = fromSource(source).blocks

  const [line] = [...map.keys()]
  assert.ok(line.kind === 'lyrics')
  const [words] = [...map.values()]

  // Four words on one drawn line, built from two source lines — so the anchors must name
  // two different blocks, and each must sit on its own letters.
  assert.equal(words.length, 4)
  assert.deepEqual(
    words.map((parts) => parts[0].blockIndex),
    [0, 0, 1, 1],
  )

  words.forEach((parts, wordIndex) => {
    const anchor = parts[0]
    const block = blocks[anchor.blockIndex]
    assert.ok(block.kind === 'lyrics')
    const expected = line.words[wordIndex].parts[0].text
    assert.equal(block.text.slice(anchor.charOffset, anchor.charOffset + expected.length), expected)
  })
})

test('a repeated chorus carries no anchors, so no note can land on it', () => {
  const source = ['{soc}', 'prima riga', '{eoc}', 'seconda riga', '{chorus}'].join('\n')
  const parsed = parseChordPro(source)
  const map = buildAnchorMap(parsed.sections, source)

  const drawn = parsed.sections
    .flatMap((section) => section.lines)
    .filter((line): line is Extract<Line, { kind: 'lyrics' }> => line.kind === 'lyrics')

  // Three drawn lines: the chorus, the verse, and the chorus again.
  assert.equal(drawn.length, 3)
  assert.equal(map.size, 3)

  assert.ok((map.get(drawn[0]) ?? []).every((parts) => parts.length > 0))
  assert.deepEqual(map.get(drawn[2]), [[], []])
})

/*
 * A line of chords with no words under them. The text walk had nothing to walk — three spaces —
 * and every chord after the first anchored at offset 0, so a note on one showed on all of them.
 * Two files in `content/` have such a line, and 422 lines of the songs on dev did.
 */
test('anchors each chord of a wordless line where the editor puts it', () => {
  for (const [source, expected] of [
    ['[C] [F] [G]', [0, 1, 2]],
    ['x [C] [G]', [0, 2, 3]],
    ['[C]la [G]  [D]', [0, 3, 5]],
  ] as const) {
    const parsed = parseChordPro(source)
    const line = parsed.sections.flatMap((section) => section.lines).find((one) => one.kind === 'lyrics')!
    const anchors = buildAnchorMap(parsed.sections, source).get(line)!
    assert.deepEqual(
      anchors.flat().map((anchor) => anchor?.charOffset),
      expected,
      source,
    )
  }
})

/* A chord over words keeps the word's position — the reader moves `del[sol] grande`'s chord onto
   «grande», and notes already stored on such lines are anchored there. */
test('keeps a chord over words at the start of its words', () => {
  const source = 'del[sol] grande'
  const parsed = parseChordPro(source)
  const line = parsed.sections.flatMap((section) => section.lines).find((one) => one.kind === 'lyrics')!
  const anchors = buildAnchorMap(parsed.sections, source).get(line)!
  assert.deepEqual(anchors.flat().map((anchor) => anchor?.charOffset), [0, 4])
})
