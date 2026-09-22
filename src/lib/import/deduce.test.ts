import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { convert } from './convert'
import { parseChordPro } from '../chordpro'
import { deduce } from './deduce'

describe('deduce', () => {
  it('prefers the directives when they are there', () => {
    const result = deduce('{title: Certe notti}\n{artist: Ligabue}\n{key: G}\n\n[Am]testo')

    assert.equal(result.title, 'Certe notti')
    assert.equal(result.artist, 'Ligabue')
    /*
     * Title and artist have columns, so their copies in the body are redundant —
     * `export.ts` rewrites them from the row anyway — and are stripped rather than left as
     * directive chips with nothing behind them in the visual editor.
     *
     * `{key:}` is the counter-example and used to be stripped beside them, which deleted the
     * only copy anybody had: nothing stores a key. It stays now, and the reader reads it off
     * the body — see `KEPT_IN_BODY`.
     */
    assert.equal(result.body, '{key: G}\n\n[Am]testo')
  })

  /*
   * The songbook and the section are consumed into columns, so their lines go. The tags are
   * not: since 2026-09-20 no column holds them and `{tag:}` in the body is where they live,
   * so stripping the line would delete the only copy — the rule `KEPT_IN_BODY` already
   * states for the key, the capo and the tempo.
   */
  it('strips a songbook or section a re-import declares, and keeps the tags', () => {
    const result = deduce('{title: Uno}\n{songbook: Cartoni animati}\n{division: Sigle}\n{tags: rock}\n[C]testo')

    assert.equal(result.songbookName, 'Cartoni animati')
    assert.equal(result.sectionName, 'Sigle')
    assert.equal(result.body, '{tags: rock}\n[C]testo')
    assert.deepEqual(parseChordPro(result.body).tags, ['rock'])
  })

  /*
   * The half of that the test above could not see, because `{tags:}` is a name the *reader*
   * knows and these two are names only a dialect knows.
   *
   * `{keywords: …}` and `{topic: …}` map to the `tags` field, so while `songs.tags` existed
   * the importer read them, filled the column and dropped the line — correctly. Dropping the
   * column on 2026-09-20 turned that into deletion with nothing catching the value, which is
   * the `{copyright:}` failure exactly: understood, and therefore destroyed. Measured, not
   * feared — `{keywords: rock}` really did come back as `[C]testo` alone.
   *
   * They are kept as written rather than rewritten into `{tag: rock}`: nothing here edits
   * somebody's file on the way in. So the value survives an import and an export, and only
   * `{tag:}`/`{tags:}` are read as tags — the bargain `{album:}` already makes.
   */
  it('keeps a dialect name for the tags, now that no column catches it', () => {
    for (const line of ['{keywords: rock}', '{topic: live}']) {
      const result = deduce(`{title: Uno}\n${line}\n[C]testo`)
      assert.equal(result.body, `${line}\n[C]testo`, `${line} was deleted`)
    }
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
    // The key has no column, so it goes back into the body as a directive rather than away.
    assert.equal(result.body, '{key: G}\n\n[G]Amazing [C]grace')
  })

  /* Understood must never mean deleted: everything the block said that no column takes comes
     back as the directive this app reads, copyright above all. */
  it('keeps what the metatag block said that no column takes', () => {
    const result = deduce(
      'Title: Amazing Grace\nArtist: John Newton\nKey: G\nCapo: 2\nTempo: 72\nTime: 3/4\n' +
        'Copyright: Public Domain\nCCLI: 22025\nKeywords: hymn, gospel\nNumber: 12\n\n[G]Amazing [C]grace',
    )
    assert.equal(
      result.body,
      '{key: G}\n{capo: 2}\n{tempo: 72}\n{time: 3/4}\n{copyright: Public Domain}\n{ccli: 22025}\n' +
        '{tag: hymn}\n{tag: gospel}\n\n[G]Amazing [C]grace',
    )
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

  /*
   * The mirror of the album case above, and a directive that used to be lost exactly
   * where it was understood: `{tempo:}` maps to a field of this importer's own, so it was
   * stripped from the body — and then dropped, because nothing stores a tempo beside the
   * song. The metronome reads it straight off the body (`ParsedSong.tempo`), so the body
   * is the only copy there is, and both apps that write it — SongbookPro and OpenSong —
   * hand it over on exactly this line.
   */
  it('keeps the tempo and the time signature in the body, where the metronome reads them', () => {
    const result = deduce('{title: Prova}\n{tempo: 96}\n{time: 3/4}\n\n[C]parola')
    assert.ok(result.body.includes('{tempo: 96}'))
    assert.ok(result.body.includes('{time: 3/4}'))
  })

  /*
   * The same trap, walked into again on 2026-09-19 with `{capo:}`: it is a `Field` here, so
   * it was stripped as «read into a column», and no column takes it. The Capo menu was
   * taught to state the fret the same day, which made the feature work on a song typed into
   * the editor and never on an imported one — the only way the directive ever arrives.
   */
  /* `{cb}` is a column break in a plain ChordPro file, and a comment has no column in any
     dialect — read as a field nothing stores, both were deleted from the only copy. */
  it('keeps a column break and a comment, which no column holds', () => {
    const result = deduce('{title: Prova}\n{cb}\n{comment: forte}\n\n[C]parola')

    assert.ok(result.body.includes('{cb}'))
    assert.ok(result.body.includes('{comment: forte}'))
  })

  it('keeps the capo in the body, where the Capo menu reads it', () => {
    const result = deduce('{title: Prova}\n{capo: 3}\n\n[C]parola')
    assert.ok(result.body.includes('{capo: 3}'))
    assert.equal(parseChordPro(result.body).capo, 3)
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
