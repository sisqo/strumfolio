import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { convert } from '../import/convert'
import { collectChordTokens, transposeSheet } from './sheet'

describe('transposing a ChordPro sheet', () => {
  const SONG = `{title: The Last Bus Home}
{key: Am}

[Am]The last bus home is [F]late
and I am [C]singing any[G]way`

  it('moves every chord and leaves every word alone', () => {
    const { text, format, moved } = transposeSheet(SONG, 2, 'sharp')

    assert.equal(format, 'chordpro')
    assert.equal(moved, 4)
    assert.match(text, /\[Bm\]The last bus home is \[G\]late/)
    assert.match(text, /and I am \[D\]singing any\[A\]way/)
  })

  it('moves the key directive with the chords under it', () => {
    /* A sheet that comes back with every chord moved and `{key: Am}` still on top is a sheet
       that now lies about itself — the one directive transposition invalidates. */
    assert.match(transposeSheet(SONG, 2, 'sharp').text, /\{key: Bm\}/)
    assert.match(transposeSheet(SONG, 3, 'flat').text, /\{key: Cm\}/)
  })

  it('leaves the title alone, and every other directive it does not know', () => {
    const { text } = transposeSheet(SONG, 5, 'flat')

    assert.match(text, /\{title: The Last Bus Home\}/)
    assert.equal(text.split('\n').length, SONG.split('\n').length)
  })

  it('leaves brackets that are not chords', () => {
    const source = '{comment: Chorus}\n[Am]Sing it [x2]\n[Verse 1]'
    const { text } = transposeSheet(source, 1, 'flat')

    assert.match(text, /\[x2\]/)
    assert.match(text, /\[Verse 1\]/)
    assert.match(text, /\[Bbm\]Sing it/)
  })

  it('respells without moving, which is what the flat/sharp choice alone does', () => {
    const { text, moved } = transposeSheet('[A#]Same sound', 0, 'flat')

    assert.equal(moved, 1)
    assert.match(text, /\[Bb\]Same sound/)
  })
})

describe('transposing chords written above the words', () => {
  const SHEET = `Am                   F
The last bus home is late
    C            G
and I am singing anyway`

  it('keeps every chord over the syllable it was over', () => {
    const { text, format, crowded } = transposeSheet(SHEET, 2, 'sharp')
    const lines = text.split('\n')

    assert.equal(format, 'chords-above')
    assert.equal(crowded, false)
    /* Bm and G are the same width as Am and F, so every column survives untouched. */
    assert.equal(lines[0], 'Bm                   G')
    assert.equal(lines[2], '    D            A')
  })

  it('leaves the words exactly as they arrived', () => {
    const lines = transposeSheet(SHEET, -4, 'flat').text.split('\n')

    assert.equal(lines[1], 'The last bus home is late')
    assert.equal(lines[3], 'and I am singing anyway')
  })

  /*
   * The discriminating test, and the reason this module exists rather than a `replace` in a
   * component: a chord in this layout belongs to the syllable its *column* lands on, so the
   * only question worth asking of the output is whether the chords still attach to the same
   * syllables. Comparing padded strings tests the spacing; running the converter over both
   * orders tests the attachment, which is the thing that would be silently wrong.
   */
  it('attaches chords to the same syllables whichever order the two are done in', () => {
    for (const semitones of [-5, -2, 1, 2, 5]) {
      const first = convert(transposeSheet(SHEET, semitones, 'sharp').text).body
      const second = transposeSheet(convert(SHEET).body, semitones, 'sharp').text

      assert.equal(first, second, `transposing by ${semitones} moved a chord off its syllable`)
    }
  })

  /*
   * The case the layout cannot survive, pinned rather than left to look like a bug: a name
   * that grows from one character to two with a single space behind it has nowhere to go, so
   * the next chord loses its column. `crowded` is what the page reads to say so out loud.
   */
  it('reports the one case where a column cannot be kept', () => {
    const tight = 'A F\nlyrics here'
    const { text, crowded } = transposeSheet(tight, 1, 'flat')

    assert.equal(crowded, true)
    assert.equal(text.split('\n')[0], 'Bb Gb')
  })

  it('reads a bar-line chart, punctuation and all', () => {
    const { text, moved } = transposeSheet('| Am | F | C | G |', 2, 'sharp')

    assert.equal(moved, 4)
    assert.equal(text, '| Bm | G | D | A |')
  })

  it('reads a comma-separated list of chords, which is what people paste', () => {
    const { text, moved } = transposeSheet('Am, F, C, G', 2, 'sharp')

    assert.equal(moved, 4)
    assert.equal(text, 'Bm, G, D, A')
  })

  it('leaves a tab block alone', () => {
    const tab = 'e|---0---2---|\nB|---1---3---|'
    assert.equal(transposeSheet(tab, 2, 'sharp').text, tab)
  })

  it('says nothing happened when nothing read as a chord', () => {
    const words = 'The last bus home is late\nand I am singing anyway'
    const { format, moved, text } = transposeSheet(words, 3, 'sharp')

    assert.equal(format, 'lyrics-only')
    assert.equal(moved, 0)
    assert.equal(text, words)
  })

  /*
   * `la la la` is a line of lyrics in which every token is also a valid chord — the failure
   * `isChordLine`'s own two-space tie-break exists to prevent, checked here because the
   * normalisation this module adds in front of it could have thrown that guard away.
   */
  it('does not take the words out of a line of Italian singing', () => {
    for (const sung of ['la la la la', 'do, re, mi']) {
      assert.equal(transposeSheet(sung, 2, 'sharp').moved, 0, `«${sung}» was read as chords`)
    }
  })
})

describe('collecting the chords of a paste', () => {
  it('reads a ChordPro song through the real parser', () => {
    const song = '{title: X}\n[Am]words [F]here [Am]again'
    assert.deepEqual(collectChordTokens(song), ['Am', 'F'])
  })

  it('reads a sheet with the chords above the words', () => {
    const sheet = 'Am     F\nwords here\nC      G\nmore words'
    assert.deepEqual(collectChordTokens(sheet), ['Am', 'F', 'C', 'G'])
  })

  it('reads the bare list somebody types into a capo calculator', () => {
    assert.deepEqual(collectChordTokens('Am F C G'), ['Am', 'F', 'C', 'G'])
    assert.deepEqual(collectChordTokens('Am, F, C, G'), ['Am', 'F', 'C', 'G'])
    assert.deepEqual(collectChordTokens('| Am | F |'), ['Am', 'F'])
  })

  it('keeps the first appearance and drops the repeats', () => {
    assert.deepEqual(collectChordTokens('Am F Am G F'), ['Am', 'F', 'G'])
  })

  it('finds nothing in a page of words', () => {
    assert.deepEqual(collectChordTokens('The last bus home is late'), [])
  })
})
