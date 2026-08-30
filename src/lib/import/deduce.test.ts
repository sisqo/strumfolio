import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { convert } from './convert'
import { deduce } from './deduce'

describe('deduce', () => {
  it('prefers the directives when they are there', () => {
    const result = deduce('{title: Certe notti}\n{artist: Ligabue}\n{key: G}\n\n[Am]testo')

    assert.equal(result.title, 'Certe notti')
    assert.equal(result.artist, 'Ligabue')
    // Read into their own fields, so the copies in the body are redundant —
    // `export.ts` rewrites them from the row anyway — and stripped here rather than
    // left as directive chips with nothing behind them in the visual editor.
    assert.equal(result.body, '[Am]testo')
  })

  it('strips a songbook or section a re-import declares, and stray tags', () => {
    const result = deduce('{title: Uno}\n{songbook: Cartoni animati}\n{division: Sigle}\n{tags: rock}\n[C]testo')

    assert.equal(result.songbookName, 'Cartoni animati')
    assert.equal(result.sectionName, 'Sigle')
    assert.deepEqual(result.tags, ['rock'])
    assert.equal(result.body, '[C]testo')
  })

  it('reads the three links and strips them from the body, gap included', () => {
    const result = deduce('{title: Uno}\n{link1: https://a}\n{link3: https://c}\n[C]testo')

    assert.equal(result.link1, 'https://a')
    assert.equal(result.link2, null)
    assert.equal(result.link3, 'https://c')
    assert.equal(result.body, '[C]testo')
  })

  it('reads a two-line heading and removes it from the body', () => {
    const result = deduce('Certe notti\nLigabue\n\n[Am]Certe notti la [F]macchina')

    assert.equal(result.title, 'Certe notti')
    assert.equal(result.artist, 'Ligabue')
    assert.equal(result.body, '[Am]Certe notti la [F]macchina')
    assert.ok(!result.body.includes('Ligabue'), 'the artist stayed in the lyrics')
  })

  it('reads a one-line heading', () => {
    const result = deduce('Certe notti\n\n[Am]testo')
    assert.equal(result.title, 'Certe notti')
    assert.equal(result.artist, null)
    assert.equal(result.body, '[Am]testo')
  })

  it('treats a heading running straight into more plain lines as lyrics', () => {
    // Three plain lines in a row are verses, not a title and an artist.
    const result = deduce('prima riga\nseconda riga\nterza riga')
    assert.equal(result.title, '')
    assert.equal(result.body, 'prima riga\nseconda riga\nterza riga')
  })

  it('stops the heading at the first line carrying chords', () => {
    const result = deduce('Certe notti\n[Am]subito il testo')
    assert.equal(result.title, 'Certe notti')
    assert.equal(result.body, '[Am]subito il testo')
  })

  it('reads an OnSong file’s metatag block instead of taking it for a heading', () => {
    // Without this the title would be the literal string «Title: Amazing Grace», and
    // `Key: G` would render as the first line of the lyrics.
    const result = deduce('Title: Amazing Grace\nArtist: John Newton\nKey: G\n\n[G]Amazing [C]grace')

    assert.equal(result.dialect, 'onsong')
    assert.equal(result.title, 'Amazing Grace')
    assert.equal(result.artist, 'John Newton')
    assert.equal(result.body, '[G]Amazing [C]grace')
  })

  it('reads {a:} as the artist in an OnSong file and leaves it alone in an unplaced one', () => {
    const onsong = deduce('Title: Grace\nCapo: 2\n\n{a: John Newton}\n[G]Amazing')
    assert.equal(onsong.dialect, 'onsong')
    assert.equal(onsong.artist, 'John Newton')

    // The same directive, in a file nothing identifies: it is as likely to be
    // MobileSheets' album as OnSong's artist, so it becomes neither.
    const unplaced = deduce('{title: Grace}\n{a: Hymns Vol. 2}\n\n[G]Amazing')
    assert.equal(unplaced.dialect, 'chordpro')
    assert.equal(unplaced.artist, null)
  })

  it('never lets a dialect overrule a standard directive', () => {
    // `{artist:}` means the same thing in every app; `{a:}` does not. The unambiguous
    // one wins, whichever order they appear in.
    const result = deduce('Title: Grace\n\n{a: Wrong}\n{artist: John Newton}\n[G]Amazing')
    assert.equal(result.artist, 'John Newton')
  })

  it('keeps a directive it understood but has nowhere to store', () => {
    // Nothing here holds an album, and deleting the line would destroy the only copy
    // of it this person has.
    const result = deduce('{title: Grace}\n{album: Hymns Vol. 2}\n\n[G]Amazing')
    assert.ok(result.body.includes('{album: Hymns Vol. 2}'))
  })

  it('reports plain ChordPro as the dialect when nothing identifies the source', () => {
    assert.equal(deduce('{title: Grace}\n\n[G]Amazing').dialect, 'chordpro')
  })

  it('works on the output of the converter', () => {
    const pasted = [
      'Certe notti',
      'Ligabue',
      '',
      'Am        F',
      'Certe notti la',
      'C         G      Am',
      'macchina sembra una donna',
    ].join('\n')
    const result = deduce(convert(pasted).body)

    assert.equal(result.title, 'Certe notti')
    assert.equal(result.artist, 'Ligabue')
    assert.ok(result.body.startsWith('[Am]'))
  })
})
