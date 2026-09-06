/**
 * SongbookPro's `.sbpbackup`, which is a zip around one line of JSON.
 *
 * Confirmed structure: the archive holds `dataFile.txt` — the literal bytes `1.0\r\n`
 * followed by the whole library as a single line of JSON — plus `dataFile.hash` (an
 * MD5 of it) and any PDFs the person had imported. The version prefix and the hash are
 * both read past rather than checked: we are not writing this file back, a hash
 * mismatch would tell us nothing we could act on, and refusing to read somebody's only
 * backup over a checksum they cannot repair would be the wrong trade every time.
 *
 * ## What is *not* confirmed, and how this file behaves about it
 *
 * No public source documents which JSON key holds a song's chords and lyrics. That is
 * a real gap, recorded as such, and the honest response is not to
 * guess one name and fail silently on every other. So the body is found in two passes:
 * the names that are plausible are tried first, in order, and if none of them is there
 * the object is searched for the one string value that actually looks like a song —
 * several lines, or ChordPro brackets. A field holding a song is not subtle, and
 * recognising it by its shape is more durable than betting on its name.
 *
 * That fallback is also what makes this parser survive SongbookPro renaming the field
 * in a future release, which for a format nobody documents is not a remote risk.
 *
 * Every song still leaves here as ChordPro text and goes through `prepareSongs` like
 * everything else, so nothing about the reading of chords is re-decided here.
 */

import { strFromU8, unzipSync } from 'fflate'

import type { SourceFile } from '../prepare'

export type BackupResult =
  | { ok: true; files: SourceFile[]; skipped: number }
  | { ok: false; message: string }

/** Names worth trying before falling back to shape. Ordered most to least specific. */
const BODY_KEYS = ['content', 'lyrics', 'chordpro', 'body', 'text', 'song', 'chords', 'data']

const TITLE_KEYS = ['title', 'name', 'songTitle']
const ARTIST_KEYS = ['artist', 'author', 'artists', 'composer']
const FOLDER_KEYS = ['folder', 'collection', 'category', 'book', 'group']

type Json = Record<string, unknown>

function stringAt(song: Json, keys: string[]): string | null {
  for (const key of keys) {
    // Case-insensitively, because a format nobody documents is a format nobody
    // promises the casing of.
    const found = Object.keys(song).find((name) => name.toLowerCase() === key.toLowerCase())
    const value = found === undefined ? undefined : song[found]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return null
}

/**
 * A string that looks like a song rather than like a field.
 *
 * Several lines, or ChordPro brackets in it. A title, an artist and a key are all one
 * short line with no brackets, so the test separates the body from everything around
 * it without needing to know what anything is called.
 */
function looksLikeABody(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length < 20) return false
  return value.includes('\n') || /\[[A-G][^\]\n]{0,8}\]/.test(value)
}

function bodyOf(song: Json): string | null {
  const named = stringAt(song, BODY_KEYS)
  if (named !== null && looksLikeABody(named)) return named

  // Nothing plausible by name: take the longest value that has a song's shape.
  const candidates = Object.values(song).filter(looksLikeABody)
  if (candidates.length === 0) return named

  return candidates.reduce((longest, value) => (value.length > longest.length ? value : longest))
}

/**
 * Finds the array of songs, wherever the document keeps it.
 *
 * Top level first (`{songs: [...]}` is the shape every source implies), then one level
 * down, then — failing both — the largest array of objects anywhere in the document
 * that have a body-shaped field between them. Same reasoning as `bodyOf`: recognise
 * the thing by what it is, since nobody will tell us what it is called.
 */
function findSongs(root: unknown): Json[] {
  const arrays: Json[][] = []

  const walk = (node: unknown, depth: number) => {
    if (depth > 4 || node === null || typeof node !== 'object') return

    if (Array.isArray(node)) {
      const objects = node.filter((item): item is Json => item !== null && typeof item === 'object' && !Array.isArray(item))
      if (objects.length > 0 && objects.some((item) => bodyOf(item) !== null)) arrays.push(objects)
      for (const item of node) walk(item, depth + 1)
      return
    }

    for (const value of Object.values(node as Json)) walk(value, depth + 1)
  }

  walk(root, 0)

  if (arrays.length === 0) return []
  return arrays.reduce((biggest, array) => (array.length > biggest.length ? array : biggest))
}

function directive(name: string, value: string | null): string {
  return value === null ? '' : `{${name}: ${value}}\n`
}

export function readSongbookProBackup(bytes: Uint8Array): BackupResult {
  let unzipped: Record<string, Uint8Array>
  try {
    unzipped = unzipSync(bytes)
  } catch {
    return { ok: false, message: 'That SongbookPro backup could not be opened.' }
  }

  const dataName = Object.keys(unzipped).find((name) => /(^|\/)dataFile\.txt$/i.test(name))
  if (dataName === undefined) {
    return {
      ok: false,
      message:
        'That doesn’t look like a SongbookPro backup — it has no dataFile.txt inside. ' +
        'Make it with Backup Library in SongbookPro, and drop the .sbpbackup here.',
    }
  }

  // Past the `1.0\r\n` version line to the JSON, wherever the first brace is.
  const raw = strFromU8(unzipped[dataName])
  const start = raw.search(/[[{]/)

  let parsed: unknown
  try {
    parsed = JSON.parse(start < 0 ? raw : raw.slice(start))
  } catch {
    return { ok: false, message: 'That SongbookPro backup is damaged: its library file isn’t readable.' }
  }

  const songs = findSongs(parsed)
  if (songs.length === 0) {
    return { ok: false, message: 'No songs found in that SongbookPro backup.' }
  }

  const files: SourceFile[] = []
  let skipped = 0

  for (const song of songs) {
    const body = bodyOf(song)
    // A song held only as an imported PDF has no words here to read — SongbookPro
    // keeps those as files beside the JSON, and a PDF is not something this path can
    // turn into chords. Counted, not complained about.
    if (body === null) {
      skipped++
      continue
    }

    const head =
      directive('title', stringAt(song, TITLE_KEYS)) +
      directive('artist', stringAt(song, ARTIST_KEYS)) +
      directive('key', stringAt(song, ['key'])) +
      directive('capo', stringAt(song, ['capo'])) +
      directive('tempo', stringAt(song, ['tempo', 'bpm']))

    files.push({ text: `${head}\n${body}`, folder: stringAt(song, FOLDER_KEYS) })
  }

  if (files.length === 0) {
    return { ok: false, message: 'That SongbookPro backup holds only imported PDFs, which have no chords to read.' }
  }

  return { ok: true, files, skipped }
}
