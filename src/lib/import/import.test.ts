import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseChordPro, plainLyrics } from '../chordpro'
import { convert, isChordLine, isTabRow, looksLikeChordPro } from './convert'

describe('isChordLine', () => {
  it('accepts a line of nothing but chords', () => {
    assert.equal(isChordLine('Am      F       C'), true)
    assert.equal(isChordLine('  Bb/D   Gm7'), true)
  })

  it('rejects a lyric line, even one starting with a note name', () => {
    assert.equal(isChordLine('La macchina sembra una donna'), false)
    assert.equal(isChordLine('Certe notti'), false)
  })

  it('rejects sung note words, which are all valid Italian chords', () => {
    // Every token here parses as a chord. Spacing is what says these are lyrics.
    assert.equal(isChordLine('la la la la'), false)
    assert.equal(isChordLine('La la la, la la'), false)
    assert.equal(isChordLine('do re mi fa sol'), false)
  })

  it('accepts a positioned line of Italian chords', () => {
    assert.equal(isChordLine('La      Sol      Re'), true)
    assert.equal(isChordLine('re    la    mi'), true)
    // A suffix or an accidental is enough on its own: nobody sings "la7".
    assert.equal(isChordLine('la7 mi si-'), true)
    assert.equal(isChordLine('sib fa'), true)
  })

  it('rejects a mixed line', () => {
    assert.equal(isChordLine('Am Certe notti'), false)
  })

  it('rejects annotations and section labels', () => {
    assert.equal(isChordLine('Ritornello'), false)
    assert.equal(isChordLine('x2'), false)
    assert.equal(isChordLine(''), false)
    assert.equal(isChordLine('   '), false)
  })
})

describe('isTabRow', () => {
  it('accepts a row of guitar tablature', () => {
    assert.equal(isTabRow('e|------------------3-3----------------3-3---------|'), true)
    assert.equal(isTabRow('A|-----0h2-----------------------------2-2---------|'), true)
    assert.equal(isTabRow('D|---------0--2-----2-2---2-----2--0---0-0---------| x2'), true)
    assert.equal(isTabRow('E|-(3)---------------------------------3-3---------|'), true)
  })

  it('rejects a chord or lyric line, even one starting with a string letter', () => {
    assert.equal(isTabRow('Em7                G'), false)
    assert.equal(isTabRow('A cold steel rail'), false)
    assert.equal(isTabRow('  (omit 1st time)'), false)
  })
})

describe('looksLikeChordPro', () => {
  it('sees inline chords', () => {
    assert.equal(looksLikeChordPro('[Am]Certe notti'), true)
  })

  it('is not fooled by brackets that are not chords', () => {
    assert.equal(looksLikeChordPro('[Verse 1]\nCerte notti'), false)
    assert.equal(looksLikeChordPro('Certe notti [x2]'), false)
  })
})

describe('convert', () => {
  it('passes ChordPro through untouched', () => {
    const source = '{title: X}\n\n[Am]Certe [F]notti'
    const result = convert(source)
    assert.equal(result.format, 'chordpro')
    assert.equal(result.body, source)
  })

  it('places chords over the syllable they sit above', () => {
    // F starts at column 10 and C at column 20, which fall inside "notti" and
    // "macchina" — mid-word chords are normal and the renderer keeps the word whole.
    const result = convert(['Am        F         C', 'Certe notti la macchina'].join('\n'))
    assert.equal(result.format, 'chords-above')
    assert.equal(result.body, '[Am]Certe nott[F]i la macch[C]ina')
  })

  it('keeps a chord that hangs past the end of the words', () => {
    // G sits at column 11, one past the ten characters of the lyric, so it lands
    // after them as a chord of its own rather than being dropped.
    const result = convert(['C          G', 'Fino a qui'].join('\n'))
    assert.equal(result.body, '[C]Fino a qui [G]')
  })

  it('emits a chord line with no lyrics as chords of its own', () => {
    const result = convert(['Am  F  C  G', '', 'Certe notti'].join('\n'))
    assert.equal(result.body, '[Am] [F] [C] [G]\n\nCerte notti')
  })

  it('turns section labels into comments', () => {
    const result = convert(['[Verse 1]', 'Am', 'Certe notti', 'Ritornello:', 'C', 'Resta'].join('\n'))
    assert.equal(
      result.body,
      ['{comment: Verse 1}', '[Am]Certe notti', '{comment: Ritornello}', '[C]Resta'].join('\n'),
    )
  })

  it('keeps directives that are already there', () => {
    const result = convert(['{title: Prova}', 'Am', 'Certe notti'].join('\n'))
    assert.equal(result.body, '{title: Prova}\n[Am]Certe notti')
  })

  it('reports lyrics with no chords at all', () => {
    const result = convert('Certe notti la macchina\nsembra una donna')
    assert.equal(result.format, 'lyrics-only')
    assert.equal(result.body, 'Certe notti la macchina\nsembra una donna')
  })

  it('normalises line endings and tabs', () => {
    const result = convert('Am\tF\r\nCerte notti')
    assert.equal(result.format, 'chords-above')
    assert.ok(result.body.includes('[Am]'))
    assert.ok(result.body.includes('[F]'))
  })

  it('collapses runs of blank lines to one separator', () => {
    const result = convert('Am\nCerte notti\n\n\n\nC\nResta')
    assert.equal(result.body, '[Am]Certe notti\n\n[C]Resta')
  })

  it('produces something the parser can read back', () => {
    const result = convert(['Am        F', 'Certe notti la', '', 'C     G', 'macchina'].join('\n'))
    const parsed = parseChordPro(result.body)

    assert.equal(parsed.sections.length, 2)
    assert.equal(plainLyrics(parsed), 'Certe notti la\nmacchina')
  })

  it('wraps a tab block in start_of_tab/end_of_tab instead of merging the chord line into it', () => {
    const result = convert(
      [
        '                    Em7                G',
        'e|------------------3-3----------------3-3---------|',
        'B|------------------3-3----------------3-3---------|',
        'A|-----0h2-----------------------------2-2---------|',
      ].join('\n'),
    )
    assert.equal(result.format, 'chords-above')
    assert.equal(
      result.body,
      [
        '[Em7] [G]',
        '{start_of_tab}',
        'e|------------------3-3----------------3-3---------|',
        'B|------------------3-3----------------3-3---------|',
        'A|-----0h2-----------------------------2-2---------|',
        '{end_of_tab}',
      ].join('\n'),
    )
  })

  it('keeps a lone tab block verbatim even with no chord line above it', () => {
    const result = convert(
      ['e|------------------3-3---------|', 'A|-----0h2--------------------- |'].join('\n'),
    )
    assert.equal(result.format, 'chords-above')
    assert.equal(
      result.body,
      [
        '{start_of_tab}',
        'e|------------------3-3---------|',
        'A|-----0h2--------------------- |',
        '{end_of_tab}',
      ].join('\n'),
    )
  })

  it('loses no lyrics in the round trip', () => {
    const lyrics = 'Certe notti la macchina sembra una donna'
    const result = convert(['Am        F         C', lyrics].join('\n'))
    assert.equal(plainLyrics(parseChordPro(result.body)), lyrics)
  })
})
