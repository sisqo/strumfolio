import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { strToU8, zipSync } from 'fflate'

import { readSongbookProBackup } from './songbookpro'

const BODY = '{soc}\n[G]Amazing [C]grace how sweet the sound\nThat saved a wretch like me\n{eoc}'

/** A `.sbpbackup` as the format is documented: `1.0\r\n` then one line of JSON. */
function backup(library: unknown, extras: Record<string, string> = {}): Uint8Array {
  return zipSync({
    'dataFile.txt': strToU8(`1.0\r\n${JSON.stringify(library)}`),
    'dataFile.hash': strToU8('d41d8cd98f00b204e9800998ecf8427e'),
    ...Object.fromEntries(Object.entries(extras).map(([name, text]) => [name, strToU8(text)])),
  })
}

describe('a SongbookPro backup', () => {
  it('reads past the version line to the JSON', () => {
    const result = readSongbookProBackup(backup({ songs: [{ title: 'Grace', content: BODY }] }))

    assert.ok(result.ok)
    assert.equal(result.files.length, 1)
    assert.ok(result.files[0].text.includes('{title: Grace}'))
    assert.ok(result.files[0].text.includes('[G]Amazing'))
  })

  it('writes the metadata it finds as directives, so deduce reads them', () => {
    const result = readSongbookProBackup(
      backup({ songs: [{ title: 'Grace', artist: 'John Newton', key: 'G', capo: '2', content: BODY }] }),
    )

    assert.ok(result.ok)
    const text = result.files[0].text
    assert.ok(text.includes('{artist: John Newton}'))
    assert.ok(text.includes('{key: G}'))
    assert.ok(text.includes('{capo: 2}'))
  })

  it('files a song under its collection', () => {
    const result = readSongbookProBackup(
      backup({ songs: [{ title: 'Grace', collection: 'Hymns', content: BODY }] }),
    )

    assert.ok(result.ok)
    assert.equal(result.files[0].folder, 'Hymns')
  })

  it('finds the body by its shape when the key is not one we guessed', () => {
    // No source documents which key holds the song. A field holding a song is not
    // subtle — several lines, or ChordPro brackets — so it is found by that instead.
    const result = readSongbookProBackup(
      backup({ songs: [{ title: 'Grace', someUndocumentedName: BODY, note: 'short' }] }),
    )

    assert.ok(result.ok)
    assert.ok(result.files[0].text.includes('[G]Amazing'))
  })

  it('does not mistake a title or a key for the body', () => {
    const result = readSongbookProBackup(
      backup({ songs: [{ title: 'A Fairly Long Song Title Indeed', key: 'Gm', content: BODY }] }),
    )

    assert.ok(result.ok)
    assert.ok(result.files[0].text.includes('That saved a wretch'))
  })

  it('finds the songs even when they are nested under something else', () => {
    const result = readSongbookProBackup(backup({ library: { v: 2, items: [{ title: 'Grace', content: BODY }] } }))

    assert.ok(result.ok)
    assert.equal(result.files.length, 1)
  })

  it('counts a song held only as a PDF instead of failing over it', () => {
    const result = readSongbookProBackup(
      backup(
        { songs: [{ title: 'Grace', content: BODY }, { title: 'Scanned', file: 'sheet.pdf' }] },
        { 'sheet.pdf': '%PDF-1.4' },
      ),
    )

    assert.ok(result.ok)
    assert.equal(result.files.length, 1)
    assert.equal(result.skipped, 1)
  })

  it('says what to do when the zip is not a SongbookPro backup at all', () => {
    const result = readSongbookProBackup(zipSync({ 'something.txt': strToU8('nope') }))

    assert.equal(result.ok, false)
    assert.match(result.ok === false ? result.message : '', /Backup Library/)
  })

  it('refuses a damaged library file without pretending it read one', () => {
    const broken = zipSync({ 'dataFile.txt': strToU8('1.0\r\n{ this is not json') })
    const result = readSongbookProBackup(broken)

    assert.equal(result.ok, false)
    assert.match(result.ok === false ? result.message : '', /damaged/)
  })

  it('says so when the backup holds only PDFs', () => {
    const result = readSongbookProBackup(backup({ songs: [{ title: 'Scanned', file: 'sheet.pdf' }] }))
    assert.equal(result.ok, false)
  })
})
