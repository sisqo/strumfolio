/**
 * Rebuilds a `.chopro` file from a stored song.
 *
 * The metadata directives are written fresh from the columns rather than trusted
 * from the body: an imported song's body may never have had them, and one that
 * came from a file may have been edited since. Writing them from the row is what
 * makes a restore reproduce the row.
 */

import type { Song } from '../data/types'
import { METADATA_DIRECTIVE } from './deduce'

export interface ExportedFile {
  name: string
  content: string
}

/**
 * The section is written too, and it is not symmetry for its own sake: without that
 * line an export and a re-import would lose how every songbook is divided, and the
 * export *is* what this repo calls a restore.
 */
export function toChoproFile(
  song: Song,
  songbookName: string | null,
  sectionName: string | null,
): string {
  const head: string[] = [`{title: ${song.title}}`]

  if (song.artist !== null && song.artist !== '') head.push(`{artist: ${song.artist}}`)
  if (song.tags.length > 0) head.push(`{tags: ${song.tags.join(', ')}}`)
  if (songbookName !== null) head.push(`{songbook: ${songbookName}}`)
  if (sectionName !== null) head.push(`{division: ${sectionName}}`)

  const body = song.body
    .split(/\r?\n/)
    .filter((line) => !METADATA_DIRECTIVE.test(line))
    .join('\n')
    .replace(/^\n+/, '')
    .trimEnd()

  return `${head.join('\n')}\n\n${body}\n`
}

/** `Certe notti` becomes `certe-notti.chopro`, matching how the seed reads slugs. */
export function choproFilename(slug: string): string {
  return `${slug}.chopro`
}

/**
 * A title as a name a filesystem will accept: the organized export builds its own
 * folders and file names from song, section and songbook titles rather than from a
 * slug, so this is not a URL — it is a name a person will see in a file manager on
 * whichever of Windows, macOS or Linux they unzip onto. `/` gets the same treatment
 * as the others rather than passing through: it is this archive's own folder
 * separator, and a title that happened to contain one would otherwise invent a
 * folder nobody asked for.
 *
 * `fallback` covers the name that sanitizes away to nothing — a title of only dots
 * and spaces passes the "not empty" check every name is created under, since that
 * check runs before this trims trailing ones away. A section or a song is still safe
 * with the default: each is numbered ahead of its name, so two empty ones next to
 * each other are still two different paths. A songbook folder carries no number, so
 * its caller passes its slug instead — unique by construction, unlike a constant
 * that two differently-named songbooks could both fall back to and collide under.
 */
export function sanitizeFilename(name: string, fallback = 'Untitled'): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim()
    .replace(/[. ]+$/, '')

  return cleaned === '' ? fallback : cleaned
}

/** `3, "Chorus"` becomes `"03 - Chorus"` — the numbering the organized export uses throughout. */
export function numbered(position: number, name: string): string {
  return `${String(position).padStart(2, '0')} - ${sanitizeFilename(name)}`
}

/** One song, already placed in its songbook and section — what the organized export groups by. */
export interface ExportRow {
  song: Song
  songbookName: string
  sectionName: string
}

export type ExportGranularity = 'song' | 'section'

interface SectionGroup {
  name: string
  songs: Song[]
}

interface SongbookGroup {
  name: string
  slug: string
  sections: SectionGroup[]
}

/**
 * Rows arrive already ordered — songbook, then section, then song — so grouping is
 * one pass: a new songbook or section starts the moment its key changes. A songbook
 * or section with no songs never reaches this function at all (nothing joins to it
 * in the query this feeds from), which is what keeps an empty one from producing a
 * folder or a file — there is nothing here to skip on purpose.
 */
function groupBySongbookAndSection(rows: ExportRow[]): SongbookGroup[] {
  const songbooks: SongbookGroup[] = []
  let songbook: SongbookGroup | null = null
  let section: SectionGroup | null = null
  let lastSongbookSlug: string | null = null
  let lastSectionId: number | null = null

  for (const row of rows) {
    if (row.song.songbookSlug !== lastSongbookSlug) {
      songbook = { name: row.songbookName, slug: row.song.songbookSlug, sections: [] }
      songbooks.push(songbook)
      lastSongbookSlug = row.song.songbookSlug
      lastSectionId = null
    }

    if (row.song.sectionId !== lastSectionId) {
      section = { name: row.sectionName, songs: [] }
      songbook?.sections.push(section)
      lastSectionId = row.song.sectionId
    }

    section?.songs.push(row.song)
  }

  return songbooks
}

/**
 * The organized export: one folder per songbook (named, not numbered — only the
 * songs and sections inside it are), holding either one numbered `.chopro` per song
 * inside a numbered section subfolder, or one numbered `.chopro` per section with
 * every one of its songs pasted in behind it, separated by `{new_song}` — the
 * standard ChordPro mark the import side already knows how to cut a paste on.
 *
 * The numbers are dense — 1..N over what is actually here, not each row's own
 * `position` — for the same reason an empty songbook or section produces nothing:
 * this is what a person sees, and a gap in it would look like a mistake rather than
 * a songbook nobody has played from yet.
 *
 * Unlike the plain backup (`toChoproFile`'s other caller), this is not the restore
 * path: nothing here is read back by `npm run seed`, so there is no slug to keep
 * stable and no flat layout to preserve.
 */
export function organizeExport(rows: ExportRow[], mode: ExportGranularity): ExportedFile[] {
  const files: ExportedFile[] = []

  for (const songbook of groupBySongbookAndSection(rows)) {
    const songbookFolder = sanitizeFilename(songbook.name, songbook.slug)

    songbook.sections.forEach((section, sectionIndex) => {
      const sectionLabel = numbered(sectionIndex + 1, section.name)

      if (mode === 'section') {
        const content = section.songs
          .map((song) => toChoproFile(song, songbook.name, section.name))
          .join('\n{new_song}\n\n')

        files.push({ name: `${songbookFolder}/${sectionLabel}.chopro`, content })
        return
      }

      section.songs.forEach((song, songIndex) => {
        const songLabel = numbered(songIndex + 1, song.title)

        files.push({
          name: `${songbookFolder}/${sectionLabel}/${songLabel}.chopro`,
          content: toChoproFile(song, songbook.name, section.name),
        })
      })
    })
  }

  return files
}
