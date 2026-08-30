import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { deduce } from '../deduce'
import { decodeEntities, elementText, openSongLyricsToChordPro, sectionName, xmlToChordPro } from './opensong'

const OPENSONG = `<?xml version="1.0" encoding="UTF-8"?>
<song>
  <title>Amazing Grace</title>
  <author>John Newton</author>
  <key>G</key>
  <tempo>76</tempo>
  <timesig>3/4</timesig>
  <ccli>22025</ccli>
  <lyrics>[V1]
.G       G7    C
 Amazing grace how sweet the sound
.G          D
 That saved a wretch like me
[C]
.G    C     G
 How sweet the sound
</lyrics>
</song>`

describe('OpenSong XML', () => {
  it('reads the metadata into directives', () => {
    const out = xmlToChordPro(OPENSONG) ?? ''

    assert.ok(out.includes('{title: Amazing Grace}'))
    assert.ok(out.includes('{artist: John Newton}'))
    assert.ok(out.includes('{key: G}'))
    assert.ok(out.includes('{tempo: 76}'))
    assert.ok(out.includes('{time: 3/4}'))
    assert.ok(out.includes('{ccli: 22025}'))
  })

  it('puts each chord over the syllable its column names', () => {
    const out = xmlToChordPro(OPENSONG) ?? ''
    assert.ok(out.includes('[G]Amazing [G7]grace [C]how sweet the sound'), out)
  })

  it('expands a section marker rather than leaving it looking like a chord', () => {
    // `[C]` as a marker means Chorus; left alone it would be read as a C chord by
    // every later pass over this text, `looksLikeChordPro` included.
    const out = xmlToChordPro(OPENSONG) ?? ''
    assert.ok(out.includes('{comment: Verse 1}'), out)
    assert.ok(out.includes('{comment: Chorus}'), out)
  })

  it('honours the markers instead of guessing, so «la la la» survives', () => {
    // A lyric line of nothing but note names is what defeats `isChordLine`'s
    // heuristic. Here the leading space says it is words, and that is the end of it.
    const source = '<song><lyrics>.Do Re\n La la la la la\n</lyrics></song>'
    const out = xmlToChordPro(source) ?? ''

    assert.ok(out.includes('[Do]La [Re]la la la la'), out)
  })

  it('writes a chord line with no words under it as bare chords', () => {
    const source = '<song><lyrics>.G  C  D\n\n.Am\n Words here\n</lyrics></song>'
    const out = xmlToChordPro(source) ?? ''

    assert.ok(out.includes('[G] [C] [D]'), out)
    assert.ok(out.includes('[Am]Words here'), out)
  })

  it('drops OpenSong’s own «;» comment lines', () => {
    const out = openSongLyricsToChordPro('; a note to self\n.G\n Words')
    assert.equal(out, '[G]Words')
  })

  it('says nothing rather than inventing a song, when there are no lyrics', () => {
    assert.equal(xmlToChordPro('<song><title>Empty</title></song>'), null)
    assert.equal(xmlToChordPro('<song><lyrics>   </lyrics></song>'), null)
  })

  it('feeds straight into deduce, which is the whole point of producing ChordPro', () => {
    const result = deduce(xmlToChordPro(OPENSONG) ?? '')

    assert.equal(result.title, 'Amazing Grace')
    assert.equal(result.artist, 'John Newton')
    assert.ok(result.body.startsWith('{comment: Verse 1}'), result.body)
  })
})

describe('OpenLyrics XML', () => {
  const OPENLYRICS = `<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" ccliNo="22025">
  <properties>
    <titles><title>Amazing Grace</title></titles>
    <authors><author>John Newton</author></authors>
  </properties>
  <lyrics>
    <verse name="v1">
      <lines><chord root="G"/>Amazing <chord root="G7"/>grace how <chord root="C"/>sweet<br/>That saved a wretch</lines>
    </verse>
  </lyrics>
</song>`

  it('turns each chord element into a bracket where it sat', () => {
    const out = xmlToChordPro(OPENLYRICS) ?? ''
    assert.ok(out.includes('[G]Amazing [G7]grace how [C]sweet'), out)
  })

  it('breaks a line on <br/>', () => {
    const out = xmlToChordPro(OPENLYRICS) ?? ''
    assert.ok(out.includes('\nThat saved a wretch'), out)
  })

  it('reads the title, the author and the CCLI number off the attributes', () => {
    const out = xmlToChordPro(OPENLYRICS) ?? ''
    assert.ok(out.includes('{title: Amazing Grace}'), out)
    assert.ok(out.includes('{artist: John Newton}'), out)
    assert.ok(out.includes('{ccli: 22025}'), out)
  })

  it('names the verse', () => {
    assert.ok((xmlToChordPro(OPENLYRICS) ?? '').includes('{comment: Verse 1}'))
  })
})

describe('the pieces', () => {
  it('decodes entities, ampersand last', () => {
    assert.equal(decodeEntities('Rock &amp; Roll'), 'Rock & Roll')
    assert.equal(decodeEntities('&lt;tag&gt;'), '<tag>')
    // An escaped escape must survive as text, not decode twice.
    assert.equal(decodeEntities('&amp;lt;'), '&lt;')
    assert.equal(decodeEntities('&#233;&#x e9;'.replace('&#x e9;', '&#xe9;')), 'éé')
  })

  it('reads an element that spans many lines', () => {
    assert.equal(elementText('<a>\n one\n two\n</a>', 'a'), 'one\n two')
    assert.equal(elementText('<a></a>', 'a'), null)
    assert.equal(elementText('<b>x</b>', 'a'), null)
  })

  it('expands the section markers it knows and leaves the rest alone', () => {
    assert.equal(sectionName('V1'), 'Verse 1')
    assert.equal(sectionName('c'), 'Chorus')
    assert.equal(sectionName('B2'), 'Bridge 2')
    assert.equal(sectionName('Instrumental'), 'Instrumental')
  })
})
