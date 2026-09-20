import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { chordTokens, parseChordPro, plainLyrics } from '../chordpro'
import { estimateKey } from '../music/key'
import { fileRepository } from './files'

describe('fileRepository', () => {
  it('reads every song in content/', async () => {
    const songs = await fileRepository.listSongs()
    assert.ok(songs.length >= 4, `expected at least 4 songs, got ${songs.length}`)
  })

  it('takes metadata from the directives', async () => {
    const song = await fileRepository.getSong('le-luci-di-via-ostiense')
    assert.equal(song?.title, 'Le luci di via Ostiense')
    assert.equal(song?.artist, 'Placeholder')
    // From the body now: `{tag:}` is where a tag lives since the column was dropped.
    assert.deepEqual(parseChordPro(song?.body ?? '').tags, ['lento'])
    assert.equal(song?.songbookSlug, 'repertorio')
  })

  it('returns null for an unknown slug', async () => {
    assert.equal(await fileRepository.getSong('non-esiste'), null)
  })

  /**
   * Section first, then title — the same order the database reads.
   *
   * It used to be title alone, and the change is the point rather than a detail: the
   * arrows inside a song step through this list, so a songbook divided into sections
   * has to come out section by section. Within a section there is nothing on disk that
   * could say where a song sits, so it stays alphabetical.
   */
  it('sorts songs by section, then by title', async () => {
    const songs = await fileRepository.listSongs()
    const sections = await fileRepository.listSections()

    for (const section of sections) {
      const titles = songs
        .filter((song) => song.sectionId === section.id)
        .map((song) => song.title)

      assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b, 'it')))
    }

    const placeOf = new Map(sections.map((section) => [section.id, section.position]))
    const places = songs.map((song) => placeOf.get(song.sectionId ?? -1) ?? 0)
    assert.deepEqual(places, [...places].sort((a, b) => a - b), 'sections came out interleaved')
  })
})

describe('sections from the files', () => {
  it('derives the declared ones, and «Songs» where no file says', async () => {
    const sections = await fileRepository.listSections()

    assert.deepEqual(
      sections.map((section) => [section.songbookSlug, section.name, section.position]),
      [
        ['da-imparare', 'Songs', 1],
        ['repertorio', 'Prima parte', 1],
        ['repertorio', 'Seconda parte', 2],
      ],
    )
  })

  it('gives every song a section of its own songbook', async () => {
    const sections = await fileRepository.listSections()
    const byId = new Map(sections.map((section) => [section.id, section]))

    for (const song of await fileRepository.listSongs()) {
      const section = byId.get(song.sectionId ?? -1)
      assert.ok(section, `${song.slug} has no section`)
      assert.equal(section?.songbookSlug, song.songbookSlug, `${song.slug} points elsewhere`)
    }
  })

  it('files each song where its own directive says', async () => {
    const byId = new Map(
      (await fileRepository.listSections()).map((section) => [section.id, section.name]),
    )
    const songs = await fileRepository.listSongs()
    const sectionOf = (slug: string) =>
      byId.get(songs.find((song) => song.slug === slug)?.sectionId ?? -1)

    assert.equal(sectionOf('ferma-il-tram'), 'Prima parte')
    assert.equal(sectionOf('le-luci-di-via-ostiense'), 'Seconda parte')
    assert.equal(sectionOf('novembre-in-cortile'), 'Songs')
  })
})

describe('songbooks from the files', () => {
  it('derives one entry per distinct directive', async () => {
    const list = await fileRepository.listSongbooks()
    assert.deepEqual(
      list.map((entry) => entry.slug),
      ['da-imparare', 'repertorio'],
    )
    assert.deepEqual(
      list.map((entry) => entry.name),
      ['Da imparare', 'Repertorio'],
    )
  })

  it('invents a 1..N position from the alphabetical order, with no database to have dragged one into', async () => {
    const list = await fileRepository.listSongbooks()
    assert.deepEqual(
      list.map((entry) => entry.position),
      [1, 2],
    )
  })

  it('assigns every song to a songbook', async () => {
    const known = new Set((await fileRepository.listSongbooks()).map((entry) => entry.slug))
    for (const song of await fileRepository.listSongs()) {
      assert.ok(song.songbookSlug, `${song.slug} has no songbook`)
      assert.ok(known.has(song.songbookSlug!), `${song.slug} points outside the list`)
    }
  })

  it('splits the fixtures the way the tags did', async () => {
    const songs = await fileRepository.listSongs()
    const bySlug = new Map(songs.map((song) => [song.slug, song.songbookSlug]))

    assert.equal(bySlug.get('ferma-il-tram'), 'repertorio')
    assert.equal(bySlug.get('le-luci-di-via-ostiense'), 'repertorio')
    assert.equal(bySlug.get('novembre-in-cortile'), 'da-imparare')
    assert.equal(bySlug.get('quasi-domenica'), 'da-imparare')
  })

  it('no longer carries the tags that became songbooks', async () => {
    for (const song of await fileRepository.listSongs()) {
      const { tags } = parseChordPro(song.body)
      assert.ok(!tags.includes('repertorio'), `${song.slug} still tagged repertorio`)
      assert.ok(!tags.includes('da imparare'), `${song.slug} still tagged da imparare`)
    }
  })
})

describe('the fixtures exercise the engine', () => {
  /**
   * Asked of the chords rather than of a column, which is where the answer lives now.
   *
   * Still worth asserting: the two spelling paths need a song each, or a bug in one of
   * them would never show up in a fixture.
   */
  it('covers both flat and sharp keys', async () => {
    const keys = (await fileRepository.listSongs()).map((song) =>
      estimateKey(chordTokens(parseChordPro(song.body))),
    )

    assert.ok(
      keys.some((key) => key?.flats === true),
      'no flat-key fixture',
    )
    assert.ok(
      keys.some((key) => key?.flats === false),
      'no sharp-key fixture',
    )
  })

  it('parses every fixture without losing lyrics', async () => {
    for (const song of await fileRepository.listSongs()) {
      const parsed = parseChordPro(song.body)
      assert.ok(parsed.sections.length > 0, `${song.slug} parsed to nothing`)
      assert.ok(plainLyrics(parsed).length > 40, `${song.slug} lost its lyrics`)
    }
  })
})
