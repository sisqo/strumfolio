import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseChordPro } from '../chordpro'
import {
  type ChordAt,
  chordVocabulary,
  fromSource,
  readLyricLine,
  sectionsOf,
  shiftChords,
  toSource,
  writeLyricLine,
} from './document'

/**
 * Every structural feature the real repertoire uses, in one file.
 *
 * Taken from the songs actually in the database rather than invented: the long form
 * of the chorus directives, a `{new_song}` the reader ignores, `{subtitle}` rather
 * than `{artist}`, lines of bare chords, lines with none, and — in nineteen places —
 * trailing spaces. An editor that tidies those away rewrites the file behind the
 * user's back, so they are part of the contract.
 */
const REAL = [
  '{new_song}',
  '{title: La spada di king Arthur}',
  '{subtitle: I Cavalieri del Re}',
  '[mi]',
  "[la]C'è un gran castello ",
  'nella contea di [si-]Camelot',
  '',
  '{start_of_chorus}',
  '[la]Spada del [mi]re',
  '{end_of_chorus}',
  '',
  '{c: assolo}',
  '[re] [la] [re] [sol]',
  'una riga senza accordi',
].join('\n')

describe('a source survives being read and written', () => {
  it('gives back exactly what it was given', () => {
    assert.equal(toSource(fromSource(REAL)), REAL)
  })

  it('keeps a line of only spaces, and one that ends in them', () => {
    const source = 'prima riga   \n   \n[la]terza'
    assert.equal(toSource(fromSource(source)), source)
  })

  it('keeps directives it knows nothing about', () => {
    const source = '{new_song}\n{capo: 3}\n{x_custom: qualcosa}\ntesto'
    assert.equal(toSource(fromSource(source)), source)
  })

  it('keeps the spelling of the directives it does know', () => {
    for (const source of ['{soc}\n[la]x\n{eoc}', '{start_of_chorus}\n[la]x\n{end_of_chorus}']) {
      assert.equal(toSource(fromSource(source)), source)
    }
  })

  it('keeps windows line endings rather than rewriting the whole file', () => {
    const source = '{title: X}\r\n\r\n[la]prima\r\n[mi]seconda'
    assert.equal(toSource(fromSource(source)), source)
  })

  it('is stable: reading its own output changes nothing', () => {
    const once = toSource(fromSource(REAL))
    assert.equal(toSource(fromSource(once)), once)
  })

  it('does not disturb what the reader makes of it', () => {
    // The real check on a round trip: the rendered song is identical.
    assert.deepEqual(parseChordPro(toSource(fromSource(REAL))), parseChordPro(REAL))
  })
})

describe('a tab', () => {
  const TAB_SOURCE = [
    '{start_of_tab}',
    'e|-5--------5-6-8-6-5-6-5---------------',
    'B|---8-6------------------8-------------',
    '{end_of_tab}',
  ].join('\n')

  it('survives being read and written, dashes and all', () => {
    assert.equal(toSource(fromSource(TAB_SOURCE)), TAB_SOURCE)
  })

  it('is one block, not one per row', () => {
    const { blocks } = fromSource(TAB_SOURCE)
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].kind, 'tab')
  })

  it('keeps a blank-looking row as a row of the tab, not a break between blocks', () => {
    const source = ['{sot}', 'e|---', '', 'B|---', '{eot}'].join('\n')
    const { blocks } = fromSource(source)

    assert.equal(blocks.length, 1)
    assert.deepEqual(blocks[0].kind === 'tab' ? blocks[0].rows : null, ['e|---', '', 'B|---'])
    assert.equal(toSource(fromSource(source)), source)
  })

  it('keeps the short alias spelling on both directives', () => {
    const source = ['{sot}', 'e|---', '{eot}'].join('\n')
    assert.equal(toSource(fromSource(source)), source)
  })

  it('closes a tab the source never did, rather than swallowing what follows it', () => {
    const source = ['{start_of_tab}', 'e|-5-', 'una riga dopo, mai raggiunta'].join('\n')
    const { blocks } = fromSource(source)

    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].kind, 'tab')
    assert.equal(
      toSource(fromSource(source)),
      ['{start_of_tab}', 'e|-5-', 'una riga dopo, mai raggiunta', '{end_of_tab}'].join('\n'),
    )
  })
})

describe('reading one line', () => {
  it('separates the words from the chords above them', () => {
    const { text, chords } = readLyricLine("[la]C'è un gran [mi]castello")

    assert.equal(text, "C'è un gran castello")
    assert.deepEqual(chords, [
      { at: 0, name: 'la' },
      { at: 12, name: 'mi' },
    ])
  })

  it('takes a bracket with no closing one as text, like the reader does', () => {
    const { text, chords } = readLyricLine('una [nota a margine')

    assert.equal(text, 'una [nota a margine')
    assert.deepEqual(chords, [])
  })

  it('handles two chords in the same place, and one at the very end', () => {
    const line = '[la][mi]corri[re]'
    const { text, chords } = readLyricLine(line)

    assert.equal(text, 'corri')
    assert.deepEqual(chords, [
      { at: 0, name: 'la' },
      { at: 0, name: 'mi' },
      { at: 5, name: 're' },
    ])
    assert.equal(writeLyricLine(text, chords), line)
  })

  it('writes a chord past the end of the text at the end instead of losing it', () => {
    assert.equal(writeLyricLine('corri', [{ at: 99, name: 'la' }]), 'corri[la]')
  })
})

describe('chords follow the words they sit above', () => {
  const chords: ChordAt[] = [
    { at: 0, name: 'la' },
    { at: 4, name: 'mi' },
    { at: 9, name: 're' },
  ]

  it('stay put when the change is after them', () => {
    assert.deepEqual(shiftChords(chords, 'roma capitale', 'roma capitale!'), chords)
  })

  it('move along when text is inserted before them', () => {
    // "roma" → "la roma": everything shifts by three.
    assert.deepEqual(shiftChords(chords, 'roma capitale', 'la roma capitale'), [
      { at: 3, name: 'la' },
      { at: 7, name: 'mi' },
      { at: 12, name: 're' },
    ])
  })

  it('move when the insertion is exactly where one sits', () => {
    // A chord belongs to the syllable after it, and that syllable moved.
    assert.deepEqual(shiftChords([{ at: 0, name: 'la' }], 'roma', 'Xroma'), [
      { at: 1, name: 'la' },
    ])
  })

  it('survive a deletion that swallows one, landing where the gap opened', () => {
    // "roma capitale" → "roma tale": the chord at 9 was inside what went.
    assert.deepEqual(shiftChords(chords, 'roma capitale', 'roma tale'), [
      { at: 0, name: 'la' },
      { at: 4, name: 'mi' },
      { at: 5, name: 're' },
    ])
  })

  it('survive a selection being replaced by something longer', () => {
    const replaced = shiftChords(chords, 'roma capitale', 'roma bellissima capitale')

    assert.equal(replaced.length, chords.length)
    assert.ok(replaced.every((chord) => chord.at >= 0 && chord.at <= 'roma bellissima capitale'.length))
    assert.deepEqual(replaced[0], { at: 0, name: 'la' })
  })

  it('never leave the text they belong to', () => {
    const wiped = shiftChords(chords, 'roma capitale', '')
    assert.deepEqual(wiped, [
      { at: 0, name: 'la' },
      { at: 0, name: 'mi' },
      { at: 0, name: 're' },
    ])
  })

  it('keep every chord, whatever the edit', () => {
    const edits: [string, string][] = [
      ['roma capitale', 'roma'],
      ['roma capitale', 'ROMA CAPITALE'],
      ['roma capitale', 'r'],
      ['roma capitale', 'roma capitale roma capitale'],
    ]

    for (const [before, after] of edits) {
      assert.equal(shiftChords(chords, before, after).length, 3, `${before} → ${after}`)
    }
  })
})

describe('which section a line is in', () => {
  it('follows the explicit boundaries, and the blank line otherwise', () => {
    const { blocks } = fromSource(
      ['[la]strofa', '', '{soc}', '[la]coro', '{eoc}', '[la]dopo'].join('\n'),
    )

    assert.deepEqual(sectionsOf(blocks), ['verse', 'verse', 'chorus', 'chorus', 'chorus', 'verse'])
  })

  it('marks a bridge as a bridge', () => {
    const { blocks } = fromSource(['{sob}', '[la]ponte', '{eob}'].join('\n'))
    assert.deepEqual(sectionsOf(blocks), ['bridge', 'bridge', 'bridge'])
  })

  it('agrees with the reader about an unclosed chorus', () => {
    const source = ['{soc}', '[la]coro', '', '[la]ancora coro'].join('\n')
    const { blocks } = fromSource(source)

    // A blank line does not close an explicit section, in either place.
    assert.deepEqual(sectionsOf(blocks), ['chorus', 'chorus', 'chorus', 'chorus'])
    assert.deepEqual(
      parseChordPro(source).sections.map((section) => section.kind),
      ['chorus'],
    )
  })
})

describe('the chords a song already uses', () => {
  it('comes back most frequent first, ties in order of first appearance', () => {
    const { blocks } = fromSource(['[la]uno [mi]due', '[mi]tre [re]quattro', '{c: [sol]ignorato}'].join('\n'))

    assert.deepEqual(chordVocabulary(blocks), ['mi', 'la', 're'])
  })

  it('skips the chord still being named', () => {
    const { blocks } = fromSource('[la]uno [] due')
    assert.deepEqual(chordVocabulary(blocks), ['la'])
  })
})
