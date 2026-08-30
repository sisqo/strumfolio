import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { fieldFor, readOnSongMetatags, sniffDialect } from './dialect'

describe('sniffing which app wrote a file', () => {
  it('knows OnSong by its opening metatag block', () => {
    const source = 'Title: Amazing Grace\nArtist: John Newton\nKey: G\n\n[G]Amazing [C]grace'
    assert.equal(sniffDialect(source), 'onsong')
  })

  it('does not call a section label a metatag', () => {
    // `Ritornello:` is a label `convert.ts` already reads as a section — it has no
    // value after the colon, and it is not a name OnSong defines.
    const source = 'Ritornello:\nDo             Sol\nLa la la la la'
    assert.equal(sniffDialect(source), 'chordpro')
  })

  it('does not call a lyric line with a colon a metatag', () => {
    const source = 'And then she said: come back home\nAnd I did'
    assert.equal(sniffDialect(source), 'chordpro')
  })

  it('knows SongbookPro and MobileSheets by directives only they define', () => {
    assert.equal(sniffDialect('{textfill}\n[C]Grace'), 'songbookpro')
    assert.equal(sniffDialect('{su: John Newton}\n[C]Grace'), 'mobilesheets')
    assert.equal(sniffDialect('{gc: capo 2}\n[C]Grace'), 'mobilesheets')
  })

  it('falls back to plain ChordPro when nothing identifies the source', () => {
    assert.equal(sniffDialect('{title: Grace}\n\n[C]Amazing [G]grace'), 'chordpro')
    assert.equal(sniffDialect(''), 'chordpro')
  })
})

describe('the collisions, one test each', () => {
  it('{a:} is the artist in OnSong and the album in MobileSheets', () => {
    assert.equal(fieldFor('a', 'onsong'), 'artist')
    // Understood, and dropped: nothing here holds an album. Emphatically not `artist`.
    assert.equal(fieldFor('a', 'mobilesheets'), null)
    // Unknown provenance: left alone rather than guessed either way.
    assert.equal(fieldFor('a', 'chordpro'), null)
  })

  it('{book:} names the songbook in OnSong and the album in MobileSheets', () => {
    assert.equal(fieldFor('book', 'onsong'), 'songbookName')
    assert.equal(fieldFor('book', 'mobilesheets'), null)
    assert.equal(fieldFor('book', 'chordpro'), null)
  })

  it('{k:} is a key in OnSong and not an abbreviation at all in the specification', () => {
    assert.equal(fieldFor('k', 'onsong'), 'key')
    assert.equal(fieldFor('k', 'chordpro'), null)
    // `{key:}` itself is unambiguous everywhere.
    for (const dialect of ['chordpro', 'onsong', 'mobilesheets', 'songbookpro'] as const) {
      assert.equal(fieldFor('key', dialect), 'key', dialect)
    }
  })

  it('{cb} is a comment in every dialect, whichever kind of comment it names', () => {
    // `comment_bold` in OnSong, `comment_box` elsewhere — one thing to render here.
    for (const dialect of ['chordpro', 'onsong', 'mobilesheets', 'songbookpro'] as const) {
      assert.equal(fieldFor('cb', dialect), 'comment', dialect)
    }
  })

  it('{su:} and {gc:} exist only in MobileSheets', () => {
    assert.equal(fieldFor('gc', 'mobilesheets'), 'comment')
    assert.equal(fieldFor('su', 'mobilesheets'), null)
    assert.equal(fieldFor('gc', 'chordpro'), null)
    assert.equal(fieldFor('su', 'chordpro'), null)
  })

  it('leaves {st:} to the base table, which this app has always read as the artist', () => {
    // Deliberately absent from every override: `chordpro.ts` maps `st` and `subtitle`
    // onto `artist` and has since long before dialects existed. Correcting it to the
    // specification here would change how files that import correctly today are read.
    for (const dialect of ['chordpro', 'onsong', 'mobilesheets', 'songbookpro'] as const) {
      assert.equal(fieldFor('st', dialect), undefined, dialect)
      assert.equal(fieldFor('subtitle', dialect), undefined, dialect)
    }
  })

  it('tells a directive it drops on purpose from one it does not know', () => {
    // `null` — understood, nothing holds it.
    assert.equal(fieldFor('album', 'chordpro'), null)
    assert.equal(fieldFor('flow', 'onsong'), null)
    // `undefined` — not ours; falls through to the base table in `chordpro.ts`.
    assert.equal(fieldFor('title', 'chordpro'), undefined)
    assert.equal(fieldFor('soc', 'chordpro'), undefined)
    assert.equal(fieldFor('nonsense', 'chordpro'), undefined)
  })

  it('reads the fields every dialect agrees on without needing to know the source', () => {
    for (const dialect of ['chordpro', 'onsong', 'mobilesheets', 'songbookpro'] as const) {
      assert.equal(fieldFor('capo', dialect), 'capo', dialect)
      assert.equal(fieldFor('tempo', dialect), 'tempo', dialect)
      assert.equal(fieldFor('duration', dialect), 'duration', dialect)
      assert.equal(fieldFor('copyright', dialect), 'copyright', dialect)
      assert.equal(fieldFor('ccli', dialect), 'ccli', dialect)
      assert.equal(fieldFor('time', dialect), 'timeSignature', dialect)
    }
  })
})

describe('OnSong’s metatag block', () => {
  it('reads the tags and says how many lines they took', () => {
    const source = 'Title: Amazing Grace\nArtist: John Newton\nKey: G\nCapo: 2\n\n[G]Amazing grace'
    const { tags, consumed } = readOnSongMetatags(source)

    assert.equal(consumed, 4)
    assert.deepEqual(tags, [
      { field: 'title', value: 'Amazing Grace' },
      { field: 'artist', value: 'John Newton' },
      { field: 'key', value: 'G' },
      { field: 'capo', value: '2' },
    ])
  })

  it('drops the tags nothing here holds, without dropping the block', () => {
    const source = 'Title: Grace\nFlow: V1 C V2\nAlbum: Hymns\n\n[G]Amazing'
    const { tags, consumed } = readOnSongMetatags(source)

    assert.equal(consumed, 3)
    assert.deepEqual(tags, [{ field: 'title', value: 'Grace' }])
  })

  it('takes nothing when the opening block is not entirely metatags', () => {
    // One `Name: Value` line among lyrics is a lyric line with a colon in it.
    const source = 'Amazing grace how sweet the sound\nAnd then she said: come home\n\n[G]That saved'
    assert.deepEqual(readOnSongMetatags(source), { tags: [], consumed: 0 })
  })

  it('takes nothing from a plain ChordPro file', () => {
    assert.deepEqual(readOnSongMetatags('{title: Grace}\n{artist: Newton}\n\n[G]Amazing'), {
      tags: [],
      consumed: 0,
    })
  })

  it('takes nothing from an empty file', () => {
    assert.deepEqual(readOnSongMetatags(''), { tags: [], consumed: 0 })
  })
})
