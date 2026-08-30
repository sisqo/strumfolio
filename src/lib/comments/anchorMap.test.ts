import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { parseChordPro } from '../chordpro'
import { fromSource } from '../editor/document'
import { buildAnchorMap } from './anchorMap'

test('a part anchor points at the very text the part shows', () => {
  const source = '[G]A[C]mazing [G]grace, how [D]sweet the sound'
  const map = buildAnchorMap(source)
  const { text } = fromSource(source).blocks[0] as { text: string }

  const [line] = map
  const [amazing, grace, how] = line
  assert.equal(text.slice(amazing[0].charOffset, amazing[0].charOffset + 1), 'A')
  assert.equal(text.slice(amazing[1].charOffset, amazing[1].charOffset + 6), 'mazing')
  assert.equal(text.slice(grace[0].charOffset, grace[0].charOffset + 6), 'grace,')
  assert.equal(text.slice(how[0].charOffset, how[0].charOffset + 3), 'how')
})

test('extra spacing in the source does not shift the anchors off the words', () => {
  // The reader collapses this to single spaces; the offsets must follow the source.
  const source = 'uno   due     tre'
  const map = buildAnchorMap(source)
  const { text } = fromSource(source).blocks[0] as { text: string }

  const [[uno, due, tre]] = map
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

  const rendered = parseChordPro(source)
    .sections.flatMap((section) => section.lines)
    .filter((line) => line.kind === 'lyrics')

  assert.equal(buildAnchorMap(source).length, rendered.length)
})

test('every real song in content/ maps one-to-one, and every anchor lands on its own letters', () => {
  const dir = path.join(process.cwd(), 'content')
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.txt') || f.endsWith('.pro') || f.endsWith('.chopro'))

  assert.ok(files.length > 0, 'expected the repertoire to be readable from content/')

  for (const file of files) {
    const source = readFileSync(path.join(dir, file), 'utf8')
    const map = buildAnchorMap(source)
    const blocks = fromSource(source).blocks
    const rendered = parseChordPro(source)
      .sections.flatMap((section) => section.lines)
      .filter((line) => line.kind === 'lyrics')

    assert.equal(map.length, rendered.length, `${file}: line counts disagree`)

    map.forEach((words, lineIndex) => {
      const line = rendered[lineIndex]
      if (line.kind !== 'lyrics') return
      words.forEach((parts, wordIndex) => {
        parts.forEach((anchor, partIndex) => {
          const block = blocks[anchor.blockIndex]
          assert.equal(block.kind, 'lyrics', `${file}: anchor points at a non-lyrics block`)
          if (block.kind !== 'lyrics') return
          const expected = line.words[wordIndex].parts[partIndex].text
          assert.equal(
            block.text.slice(anchor.charOffset, anchor.charOffset + expected.length),
            expected,
            `${file}: anchor ${lineIndex}/${wordIndex}/${partIndex} does not sit on its own text`,
          )
        })
      })
    })
  }
})
