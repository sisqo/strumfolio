import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { strToU8, zipSync } from 'fflate'

import { prepareFiles } from '../prepare'
import { folderOf, readArchive } from './archive'

/** Builds a real zip, so the test exercises the same `fflate` path the browser will. */
function zip(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])))
}

describe('reading a zip of songs', () => {
  it('takes every song file and says which folder held it', () => {
    const { entries, skipped } = readArchive(
      zip({
        'Worship/grace.cho': '{title: Amazing Grace}\n[G]Amazing',
        'Worship/holy.chopro': '{title: Holy Holy}\n[D]Holy',
        'Christmas/silent.cho': '{title: Silent Night}\n[C]Silent',
      }),
    )

    assert.equal(skipped, 0)
    assert.deepEqual(
      entries.map((entry) => entry.folder),
      ['Worship', 'Worship', 'Christmas'],
    )
  })

  it('skips what is not a song, and counts it rather than complaining about it', () => {
    // A real archive from another app carries its database, its PDFs and its audio
    // beside the songs. Listing each as a failure would bury the songs.
    const { entries, skipped } = readArchive(
      zip({
        'song.cho': '{title: One}\n[C]x',
        'library.sqlite3': 'binary-ish',
        'sheet.pdf': '%PDF-1.4',
        'backing.mp3': 'audio',
      }),
    )

    assert.equal(entries.length, 1)
    assert.equal(skipped, 3)
  })

  it('ignores what a Mac adds to a zip without being asked', () => {
    const { entries } = readArchive(
      zip({
        '__MACOSX/._song.cho': 'junk',
        '.DS_Store': 'junk',
        'Worship/.DS_Store': 'junk',
        'song.cho': '{title: One}\n[C]x',
      }),
    )

    assert.equal(entries.length, 1)
    assert.equal(entries[0].path, 'song.cho')
  })

  it('skips a file that holds nothing', () => {
    const { entries, skipped } = readArchive(zip({ 'empty.cho': '   \n\n', 'real.cho': '{title: One}\n[C]x' }))

    assert.equal(entries.length, 1)
    assert.equal(skipped, 1)
  })

  it('takes an XML song too', () => {
    const { entries } = readArchive(zip({ 'Hymns/grace.xml': '<song><lyrics>.G\n Amazing</lyrics></song>' }))
    assert.equal(entries.length, 1)
    assert.equal(entries[0].folder, 'Hymns')
  })
})

describe('which folder a path names', () => {
  it('is the last one, not the whole path', () => {
    // Sections do not nest, and «Advent» is the name a person goes looking for.
    assert.equal(folderOf('Worship/2024/Advent/song.cho'), 'Advent')
    assert.equal(folderOf('Worship/song.cho'), 'Worship')
  })

  it('is nothing at the root', () => {
    assert.equal(folderOf('song.cho'), null)
    assert.equal(folderOf('/song.cho'), null)
  })
})

describe('an archive becoming songs', () => {
  it('files each song under the folder that held it', () => {
    const songs = prepareFiles([
      { text: '{title: Grace}\n[G]Amazing', folder: 'Worship' },
      { text: '{title: Silent}\n[C]Silent', folder: 'Christmas' },
    ])

    assert.deepEqual(
      songs.map((song) => [song.title, song.declaresSection]),
      [
        ['Grace', 'Worship'],
        ['Silent', 'Christmas'],
      ],
    )
  })

  it('lets the song’s own {division:} win over the folder that held it', () => {
    // One was typed on purpose; the other is a consequence of where a file was dragged.
    const songs = prepareFiles([
      { text: '{title: Grace}\n{division: Hymns}\n[G]Amazing', folder: 'Worship' },
    ])

    assert.equal(songs[0].declaresSection, 'Hymns')
  })

  it('cuts a file that holds several songs, keeping ids unique across the run', () => {
    // «One file per section, songs separated by {new_song}» is exactly what this
    // repo's own organized export writes.
    const songs = prepareFiles([
      { text: '{title: One}\n[C]a\n{new_song}\n{title: Two}\n[D]b', folder: 'Worship' },
      { text: '{title: Three}\n[E]c', folder: 'Christmas' },
    ])

    assert.deepEqual(
      songs.map((song) => song.title),
      ['One', 'Two', 'Three'],
    )
    assert.deepEqual(
      songs.map((song) => song.id),
      [0, 1, 2],
    )
    assert.deepEqual(
      songs.map((song) => song.declaresSection),
      ['Worship', 'Worship', 'Christmas'],
    )
  })

  it('leaves a song at the archive root to the section chosen on screen', () => {
    const songs = prepareFiles([{ text: '{title: Grace}\n[G]Amazing', folder: null }])
    assert.equal(songs[0].declaresSection, null)
  })
})
