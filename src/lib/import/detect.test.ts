import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { detectSource, extensionOf, isIRealPro, looksLikeXml, xmlFlavour } from './detect'

describe('what a dropped file is', () => {
  it('takes every extension that holds ChordPro or chords-above text', () => {
    for (const name of [
      'song.txt',
      'song.cho',
      'song.crd',
      'song.chopro',
      'song.chord',
      'song.chordpro',
      'song.cpm',
      'song.pro',
      'song.onsong',
      'song.tab',
    ]) {
      assert.deepEqual(detectSource(name), { kind: 'text' }, name)
    }
  })

  it('ignores the case of the extension', () => {
    assert.deepEqual(detectSource('SONG.CHOPRO'), { kind: 'text' })
    assert.deepEqual(detectSource('Backup.PDF'), { kind: 'pdf' })
  })

  it('reads an extensionless file as text, which is OpenSong’s own convention', () => {
    assert.deepEqual(detectSource('Amazing Grace'), { kind: 'text' })
    assert.deepEqual(detectSource('Amazing Grace'), { kind: 'text' })
  })

  it('does not mistake a dot inside the name for an extension', () => {
    // «Mr. Bojangles» has no extension: the parser must not read « bojangles» as one.
    assert.deepEqual(detectSource('Mr. Bojangles.cho'), { kind: 'text' })
    assert.deepEqual(detectSource('.hidden'), { kind: 'text' })
  })

  it('routes each container to its own opener', () => {
    assert.deepEqual(detectSource('library.sbpbackup'), { kind: 'songbookpro' })
    assert.deepEqual(detectSource('songs.zip'), { kind: 'zip' })
    assert.deepEqual(detectSource('song.docx'), { kind: 'docx' })
    assert.deepEqual(detectSource('song.pdf'), { kind: 'pdf' })
    assert.deepEqual(detectSource('song.xml'), { kind: 'xml' })
  })

  it('refuses the formats we deliberately do not open, and says what to do instead', () => {
    for (const name of ['OnSong.backup', 'library.onsongarchive', 'library.msb', 'song.gp5', 'chart.irealb']) {
      const source = detectSource(name)
      assert.equal(source.kind, 'refused', name)
      assert.ok(source.kind === 'refused' && source.advice.length > 0, name)
    }
  })

  it('refuses OnSong’s backup before it can be read as a plain zip', () => {
    // `.backup` is a zip, and the zip branch would happily open it — the refusal has
    // to win, or the advice never gets shown.
    const source = detectSource('OnSong.backup')
    assert.equal(source.kind, 'refused')
    assert.match(source.kind === 'refused' ? source.advice : '', /ChordPro/)
  })

  it('leaves .html undecided until its content has been read', () => {
    // iReal Pro writes one — but so does every «save this page», which is the only way
    // anything ever leaves Ultimate Guitar. Refusing all of them with iReal Pro's
    // advice («no lyrics at all») would be plainly false far more often than not.
    assert.deepEqual(detectSource('chart.html'), { kind: 'html' })
    assert.deepEqual(detectSource('tab.htm'), { kind: 'html' })
  })

  it('tells an iReal Pro page from an ordinary saved one, by content', () => {
    assert.equal(isIRealPro('<a href="irealbook://Blue%20Bossa=Silver">Blue Bossa</a>'), true)
    assert.equal(isIRealPro('<html><body><pre>[ch]C[/ch] Amazing grace</pre></body></html>'), false)
  })

  it('says it does not know, rather than guessing', () => {
    assert.deepEqual(detectSource('photo.jpg'), { kind: 'unknown' })
    assert.deepEqual(detectSource('track.mp3'), { kind: 'unknown' })
  })
})

describe('the extension', () => {
  it('is lowercased, with its dot', () => {
    assert.equal(extensionOf('Song.CHO'), '.cho')
  })

  it('is empty when there is none', () => {
    assert.equal(extensionOf('Amazing Grace'), '')
    // A leading dot is a hidden file, not an extension.
    assert.equal(extensionOf('.gitignore'), '')
  })
})

describe('telling XML from song text', () => {
  it('recognises a declaration or a root element we know', () => {
    assert.equal(looksLikeXml('<?xml version="1.0"?>\n<song>'), true)
    assert.equal(looksLikeXml('<song>\n  <title>Grace</title>'), true)
    assert.equal(looksLikeXml('  \n<lyrics>'), true)
  })

  it('does not call a lyric line XML because it opens with a bracket', () => {
    assert.equal(looksLikeXml('<< back to the chorus'), false)
    assert.equal(looksLikeXml('[C]Amazing [G]grace'), false)
    assert.equal(looksLikeXml('{title: Grace}'), false)
  })

  it('tells OpenSong from OpenLyrics', () => {
    assert.equal(xmlFlavour('<song><title>Grace</title><lyrics>.C\n Amazing</lyrics></song>'), 'opensong')
    assert.equal(
      xmlFlavour('<song xmlns="http://openlyrics.info/namespace/2009/song"><properties/></song>'),
      'openlyrics',
    )
    assert.equal(xmlFlavour('<catalog><book/></catalog>'), 'unknown')
  })
})
