/**
 * File-backed repository: reads `content/` straight from disk.
 *
 * This is the bootstrap source — the seed script loads the database from these
 * same files — and it also means local development works with no DATABASE_URL at
 * all. It is not a fallback for a database that failed: the choice is made once,
 * in `data/index.ts`, by whether DATABASE_URL is set.
 *
 * Songbooks and their sections are derived here from the `{songbook:}` and
 * `{division:}` directives, so the app looks the same before a database exists. Once one
 * does, the database owns both and these directives are only an initial value.
 */

import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { parseChordPro } from '../chordpro'
import { slugify } from '../slug'
import {
  DEFAULT_SECTION,
  type Section,
  type Song,
  type Songbook,
  type SongRepository,
  UNFILED,
} from './types'

const CONTENT_DIR = path.join(process.cwd(), 'content')

interface ParsedFile {
  /** Everything but the section, which cannot be known one file at a time. */
  song: Omit<Song, 'sectionId'>
  /** Names as written in the directives, needed to build the two lists. */
  songbookName: string
  sectionName: string
}

function toSong(slug: string, body: string): ParsedFile {
  const parsed = parseChordPro(body)
  const songbookName = parsed.songbookName ?? UNFILED.name

  return {
    song: {
      slug,
      // A file with no {title} still needs a name to show in the list.
      title: parsed.title ?? slug,
      artist: parsed.artist,
      tags: parsed.tags,
      songbookSlug: slugify(songbookName) || UNFILED.slug,
      body,
      // No versions to compare without a database, and nothing to compare them
      // against: with no database there is no runtime copy of a song either.
      updatedAt: null,
    },
    songbookName,
    sectionName: parsed.sectionName ?? DEFAULT_SECTION,
  }
}

async function readFiles(): Promise<ParsedFile[]> {
  let entries: string[]
  try {
    entries = await readdir(CONTENT_DIR)
  } catch {
    return []
  }

  return await Promise.all(
    entries
      .filter((entry) => entry.endsWith('.chopro'))
      .map(async (entry) => {
        const body = await readFile(path.join(CONTENT_DIR, entry), 'utf8')
        return toSong(entry.replace(/\.chopro$/, ''), body)
      }),
  )
}

const key = (songbookSlug: string, name: string) => `${songbookSlug}\n${name}`

/**
 * The whole library as the three lists the pages ask for, built together.
 *
 * Together because they cannot be built apart: a song's section is an id, and the ids
 * only exist once every file has been read and the sections of each songbook are
 * known. Reading the directory three times to answer three questions was already what
 * this file did; what is new is that the answers have to agree.
 *
 * **The ids are invented here.** Without a database nothing generates them and nothing
 * writes them back, so they are positions in this list — stable for as long as the files
 * are, which is exactly as long as anything in this mode lives. They never reach a
 * database: the seed matches sections by name, not by id.
 */
async function readLibrary(): Promise<{
  songs: Song[]
  songbooks: Songbook[]
  sections: Section[]
}> {
  const files = await readFiles()

  const bySongbook = new Map<string, Songbook>()
  for (const { song, songbookName } of files) {
    if (!bySongbook.has(song.songbookSlug)) {
      bySongbook.set(song.songbookSlug, { slug: song.songbookSlug, name: songbookName, position: 0 })
    }
  }
  /*
   * Alphabetical, same reasoning as a section's own invented order just below: with no
   * database there is nowhere an order could have been dragged into, so this is the
   * honest answer rather than a poor one.
   */
  const songbooks = [...bySongbook.values()].sort((a, b) => a.name.localeCompare(b.name, 'it'))
  songbooks.forEach((songbook, index) => {
    songbook.position = index + 1
  })

  const sections: Section[] = []
  const idOf = new Map<string, number>()

  /*
   * A section per distinct pair, created the first time a file names it. Written this way
   * round — the id handed out here, the positions settled afterwards — so that every song
   * gets a number rather than a lookup that might miss: the sections and the songs come
   * from the same list of files, and this is how that guarantee is expressed in the code
   * instead of in a comment.
   */
  const ensure = (songbookSlug: string, name: string): number => {
    const held = idOf.get(key(songbookSlug, name))
    if (held !== undefined) return held

    const id = sections.length + 1
    sections.push({ id, songbookSlug, name, position: 0 })
    idOf.set(key(songbookSlug, name), id)
    return id
  }

  const songs = files.map((entry) => ({
    ...entry.song,
    sectionId: ensure(entry.song.songbookSlug, entry.sectionName),
  }))

  /*
   * Then the order: alphabetical within each songbook. That is the honest answer rather
   * than a poor one — with no database there is nowhere an order could have been written,
   * so there is no order to respect.
   */
  for (const songbook of songbooks) {
    sections
      .filter((section) => section.songbookSlug === songbook.slug)
      .sort((a, b) => a.name.localeCompare(b.name, 'it'))
      .forEach((section, index) => {
        section.position = index + 1
      })
  }

  const positionOf = new Map(sections.map((section) => [section.id, section.position]))

  /*
   * Section first, then title. The same order the database reads, for the same reason:
   * the arrows inside a song step through this list, so it has to be the order the
   * pages were generated in. Nothing on disk can say where a song sits inside its
   * section — that is `position`, which only the database has — so within a section it
   * is alphabetical.
   */
  songs.sort((a, b) => {
    const place = (positionOf.get(a.sectionId) ?? 0) - (positionOf.get(b.sectionId) ?? 0)
    return place !== 0 ? place : a.title.localeCompare(b.title, 'it')
  })

  /*
   * Handed back in the same order the database hands them back — by songbook, then by
   * position — because the two implementations have to be interchangeable row by row.
   * `ensure` produced them in the order the files happened to be read, which is no order
   * at all.
   */
  sections.sort((a, b) => a.songbookSlug.localeCompare(b.songbookSlug) || a.position - b.position)

  return { songs, songbooks, sections }
}

export async function readSongFiles(): Promise<Song[]> {
  return (await readLibrary()).songs
}

/** The songbooks named by the files, in alphabetical order. */
export async function readSongbookFiles(): Promise<Songbook[]> {
  return (await readLibrary()).songbooks
}

/** The sections named by the files, with the ids this module invented for them. */
export async function readSectionFiles(): Promise<Section[]> {
  return (await readLibrary()).sections
}

export const fileRepository: SongRepository = {
  listSongs: readSongFiles,

  async getSong(slug) {
    const songs = await readSongFiles()
    return songs.find((song) => song.slug === slug) ?? null
  },

  listSongbooks: readSongbookFiles,
  listSections: readSectionFiles,
}
