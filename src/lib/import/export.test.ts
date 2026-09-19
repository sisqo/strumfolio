import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseChordPro } from '../chordpro'
import type { Song } from '../data/types'
import {
  choproFilename,
  type ExportRow,
  numbered,
  organizeExport,
  sanitizeFilename,
  toChoproFile,
} from './export'

const song: Song = {
  slug: 'certe-notti',
  title: 'Certe notti',
  artist: 'Ligabue',
  tags: ['lento'],
  link1: 'https://example.com/video',
  link2: null,
  link3: null,
  songbookSlug: 'repertorio',
  sectionId: 3,
  body: '{title: Vecchio titolo}\n{key: G}\n\n[Am]Certe notti',
  // An export is a file: nothing in it says which version it came from.
  updatedAt: '2026-08-11T06:00:00.000Z',
}

describe('toChoproFile', () => {
  it('writes the directives from the columns, not from the body', () => {
    const file = toChoproFile(song, 'Repertorio', 'Prima parte')

    assert.ok(file.startsWith('{title: Certe notti}\n'))
    assert.ok(file.includes('{artist: Ligabue}'))
    assert.ok(file.includes('{tags: lento}'))
    assert.ok(file.includes('{link1: https://example.com/video}'))
    assert.ok(file.includes('{songbook: Repertorio}'))
    assert.ok(file.includes('{division: Prima parte}'))
  })

  /*
   * `link2` sits null between two filled slots — see `songs.link1`'s own comment in
   * `db/schema.ts` for why that gap has to survive rather than close up.
   */
  it('writes only the link slots that are filled, leaving the gap between them', () => {
    const file = toChoproFile({ ...song, link2: null, link3: 'https://example.com/tab' }, null, null)

    assert.ok(file.includes('{link1: https://example.com/video}'))
    assert.ok(!file.includes('{link2:'))
    assert.ok(file.includes('{link3: https://example.com/tab}'))
  })

  /*
   * A directive whose value a column holds is written fresh from that column, so the stale
   * copy left in the body has to go — an old title handed back beside the current one would
   * make the export disagree with itself.
   *
   * `{key:}` is the opposite case and used to be dropped here too: no column holds it, so
   * dropping it deleted the only copy and an export stopped being a restore. It is handed
   * back exactly as it was written.
   */
  it('drops a stale copy of a column, and hands back what no column holds', () => {
    const file = toChoproFile(song, 'Repertorio', 'Prima parte')
    assert.ok(!file.includes('Vecchio titolo'), 'old title survived')
    assert.ok(file.includes('{key: G}'), 'the key directive was dropped')
  })

  it('keeps the music', () => {
    assert.ok(toChoproFile(song, 'Repertorio', 'Prima parte').includes('[Am]Certe notti'))
  })

  it('omits directives with nothing to say', () => {
    const bare = toChoproFile({ ...song, artist: null, tags: [], link1: null }, null, null)
    assert.ok(!bare.includes('{artist:'))
    assert.ok(!bare.includes('{tags:'))
    assert.ok(!bare.includes('{link1:'))
    assert.ok(!bare.includes('{link2:'))
    assert.ok(!bare.includes('{link3:'))
    assert.ok(!bare.includes('{songbook:'))
    assert.ok(!bare.includes('{division:'))
  })

  it('round trips: the parser reads back what the columns said', () => {
    const parsed = parseChordPro(toChoproFile(song, 'Repertorio', 'Prima parte'))

    assert.equal(parsed.title, 'Certe notti')
    assert.equal(parsed.artist, 'Ligabue')
    assert.deepEqual(parsed.tags, ['lento'])
    assert.equal(parsed.link1, 'https://example.com/video')
    assert.equal(parsed.songbookName, 'Repertorio')
    assert.equal(parsed.sectionName, 'Prima parte')
    assert.equal(parsed.sections.length, 1)
  })

  /**
   * The one directive an exported file must *not* carry back: a stale `{sezione}` — the
   * directive's own name before the rename to English — in the body would be read as
   * filing, and the head is written from the columns regardless.
   */
  it('strips a stale sezione directive that was in the body', () => {
    const file = toChoproFile(
      { ...song, body: '{sezione: Vecchia}\n\n[Am]Certe notti' },
      'Repertorio',
      'Prima parte',
    )

    assert.equal(file.match(/\{division:/g)?.length, 1)
    assert.ok(!file.includes('{sezione:'))
    assert.ok(!file.includes('Vecchia'))
  })
})

describe('choproFilename', () => {
  it('names the file after the slug, which is how the seed reads it back', () => {
    assert.equal(choproFilename('certe-notti'), 'certe-notti.chopro')
  })
})

describe('sanitizeFilename', () => {
  it('leaves an ordinary title alone', () => {
    assert.equal(sanitizeFilename('Nel blu dipinto di blu'), 'Nel blu dipinto di blu')
  })

  it('replaces characters no filesystem accepts, slashes included', () => {
    // `/` gets no special pass: it is this archive's own folder separator, and a
    // title that contained one would otherwise invent a folder nobody asked for.
    assert.equal(sanitizeFilename('Rock/Pop: Coro?'), 'Rock-Pop- Coro-')
  })

  it('trims the trailing dots and spaces Windows refuses to keep', () => {
    assert.equal(sanitizeFilename('Titolo... '), 'Titolo')
  })

  it('never returns an empty name', () => {
    assert.equal(sanitizeFilename('...'), 'Untitled')
  })

  it('takes a caller-given fallback instead, for a name with no number ahead of it to tell it apart', () => {
    // A songbook folder carries no number (only the sections and songs inside it
    // do), so two songbooks that both sanitize away to nothing would otherwise
    // collide on the same constant — the slug a caller passes here is unique by
    // construction, unlike 'Untitled'.
    assert.equal(sanitizeFilename('...', 'cartoni-animati'), 'cartoni-animati')
  })
})

describe('numbered', () => {
  it('pads to two digits and sanitizes the name', () => {
    assert.equal(numbered(3, 'Coro'), '03 - Coro')
    assert.equal(numbered(12, 'Coro'), '12 - Coro')
  })
})

describe('organizeExport', () => {
  const row = (over: Partial<Song> & { songbookName: string; sectionName: string }): ExportRow => ({
    songbookName: over.songbookName,
    sectionName: over.sectionName,
    song: {
      slug: over.slug ?? 'song',
      title: over.title ?? 'Song',
      artist: null,
      tags: [],
      link1: null,
      link2: null,
      link3: null,
      songbookSlug: over.songbookSlug ?? 'canzoniere',
      sectionId: over.sectionId ?? 1,
      body: over.body ?? '[Am]Testo',
      updatedAt: '2026-08-11T06:00:00.000Z',
    },
  })

  it('names one file per song, inside a numbered section inside the songbook', () => {
    const rows: ExportRow[] = [
      row({
        songbookName: 'Repertorio',
        sectionName: 'Strofe',
        sectionId: 1,
        slug: 'uno',
        title: 'Uno',
      }),
      row({
        songbookName: 'Repertorio',
        sectionName: 'Strofe',
        sectionId: 1,
        slug: 'due',
        title: 'Due',
      }),
      row({
        songbookName: 'Repertorio',
        sectionName: 'Ritornelli',
        sectionId: 2,
        slug: 'tre',
        title: 'Tre',
      }),
    ]

    const files = organizeExport(rows, 'song')

    assert.deepEqual(
      files.map((file) => file.name),
      [
        'Repertorio/01 - Strofe/01 - Uno.chopro',
        'Repertorio/01 - Strofe/02 - Due.chopro',
        'Repertorio/02 - Ritornelli/01 - Tre.chopro',
      ],
    )
  })

  it('restarts section numbering at 1 in the next songbook', () => {
    const rows: ExportRow[] = [
      row({ songbookName: 'Uno', sectionName: 'Coro', sectionId: 1, songbookSlug: 'uno' }),
      row({ songbookName: 'Due', sectionName: 'Coro', sectionId: 2, songbookSlug: 'due' }),
    ]

    const files = organizeExport(rows, 'song')

    assert.deepEqual(
      files.map((file) => file.name),
      ['Uno/01 - Coro/01 - Song.chopro', 'Due/01 - Coro/01 - Song.chopro'],
    )
  })

  it('pastes every song of a section into its one file, separated by {new_song}', () => {
    const rows: ExportRow[] = [
      row({ songbookName: 'Repertorio', sectionName: 'Strofe', sectionId: 1, title: 'Uno' }),
      row({ songbookName: 'Repertorio', sectionName: 'Strofe', sectionId: 1, title: 'Due' }),
    ]

    const files = organizeExport(rows, 'section')

    assert.deepEqual(
      files.map((file) => file.name),
      ['Repertorio/01 - Strofe.chopro'],
    )

    const [content] = files.map((file) => file.content)
    assert.ok(content.includes('{title: Uno}'))
    assert.ok(content.includes('{title: Due}'))
    assert.ok(/\{title: Uno\}[\s\S]*\{new_song\}[\s\S]*\{title: Due\}/.test(content))
  })

  it('produces nothing for an empty songbook or section, since neither ever reaches it', () => {
    assert.deepEqual(organizeExport([], 'song'), [])
    assert.deepEqual(organizeExport([], 'section'), [])
  })

  it('tells two songbooks apart by slug when both of their names sanitize away to nothing', () => {
    // Neither name is empty (both pass the "not empty" check a songbook is created
    // under), but both are only dots — the one thing left of each after this file's
    // own trailing-dot rule runs. A folder carries no number to tell them apart, so
    // without the slug fallback both would become the same `Untitled` folder and one
    // songbook's songs would land inside the other's.
    const rows: ExportRow[] = [
      row({ songbookName: '...', songbookSlug: 'uno', sectionName: 'Coro', sectionId: 1 }),
      row({ songbookName: '..', songbookSlug: 'due', sectionName: 'Coro', sectionId: 2 }),
    ]

    const files = organizeExport(rows, 'song')

    assert.deepEqual(
      files.map((file) => file.name),
      ['uno/01 - Coro/01 - Song.chopro', 'due/01 - Coro/01 - Song.chopro'],
    )
  })
})
