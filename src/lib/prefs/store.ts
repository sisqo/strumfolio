/**
 * Local read cache for preferences.
 *
 * The database stays the single source of truth, but it cannot be the only
 * place preferences are read from, for two reasons the architecture forces:
 *
 * 1. Offline — the whole point of precaching the songs — there is no database
 *    to read. Without a local copy every song would open in its original key
 *    with no memory of the transposition you set last night.
 * 2. A network read cannot finish before the first paint, so the sheet would
 *    render in the wrong key and visibly jump. Reading this cache in a layout
 *    effect is synchronous, so it lands before anything is painted.
 *
 * This is a cache, not a second source of truth: the server's value wins on
 * conflict, and nothing here is ever authoritative.
 */

import {
  DEFAULT_GLOBAL_PREFS,
  DEFAULT_SONG_PREFS,
  type GlobalPrefs,
  type SongPrefs,
  clampCapo,
  clampSemitones,
  clampSpeed,
  clampZoom,
  readAccidentals,
  readChordDisplay,
  readChordShapes,
  readInstrument,
  readNotation,
} from './types'

const GLOBAL_KEY = 'songs:prefs'
const SONG_KEY_PREFIX = 'songs:song:'

function read(key: string): unknown {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    // Private-mode browsers and disabled storage both throw; a missing cache is
    // not an error, it just means we fall back to defaults.
    return null
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Nothing to do: the cache is optional by design.
  }
}

export function readGlobalPrefs(): GlobalPrefs {
  const cached = read(GLOBAL_KEY) as Partial<GlobalPrefs> | null
  if (!cached) return DEFAULT_GLOBAL_PREFS

  return {
    zoomStep:
      typeof cached.zoomStep === 'number' ? clampZoom(cached.zoomStep) : DEFAULT_GLOBAL_PREFS.zoomStep,
    notation: readNotation(cached.notation),
    instrument: readInstrument(cached.instrument),
    chordDisplay: readChordDisplay(cached.chordDisplay),
    accidentals: readAccidentals(cached.accidentals),
  }
}

export function writeGlobalPrefs(prefs: GlobalPrefs): void {
  write(GLOBAL_KEY, prefs)
}

export function readSongPrefs(slug: string): SongPrefs {
  const cached = read(SONG_KEY_PREFIX + slug) as Partial<SongPrefs> | null
  if (!cached) return DEFAULT_SONG_PREFS

  return {
    semitones:
      typeof cached.semitones === 'number'
        ? clampSemitones(cached.semitones)
        : DEFAULT_SONG_PREFS.semitones,
    scrollSpeed:
      typeof cached.scrollSpeed === 'number'
        ? clampSpeed(cached.scrollSpeed)
        : DEFAULT_SONG_PREFS.scrollSpeed,
    capo: typeof cached.capo === 'number' ? clampCapo(cached.capo) : DEFAULT_SONG_PREFS.capo,
    chordShapes: readChordShapes(cached.chordShapes),
    favorite: cached.favorite === true,
  }
}

export function writeSongPrefs(slug: string, prefs: SongPrefs): void {
  write(SONG_KEY_PREFIX + slug, prefs)
}

/**
 * Every song this device has a cached answer about, and whether that answer is starred.
 *
 * The lists need the star for songs nobody has opened in this tab, which is the one thing
 * `readSongPrefs` cannot give them: it answers about one slug at a time and the caller
 * would have to already know which slugs to ask about. So this walks the cache instead —
 * the same entries `writeSongPrefs` leaves behind, either because `loadPrefs` brought the
 * server's answer back or because the reader tapped the star here.
 *
 * The prefix test is exact and has to be: `songs:prefs`, `songs:sections`, `songs:edits`
 * and `songs:comments:` all share this namespace, and a looser match would hand back
 * their contents as if they were songs.
 *
 * A slug absent from the result is not "not starred" — it is "this device has no opinion",
 * which is a different answer and the one `resolveFavorites` needs to tell apart.
 */
export function readCachedFavorites(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}

  const found: Record<string, boolean> = {}
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key === null || !key.startsWith(SONG_KEY_PREFIX)) continue

      const cached = read(key) as Partial<SongPrefs> | null
      if (cached === null || typeof cached !== 'object') continue

      found[key.slice(SONG_KEY_PREFIX.length)] = cached.favorite === true
    }
  } catch {
    // Same as `read` above: a browser refusing storage is not an error here, it just
    // means this device remembers nothing and the server's answer stands alone.
  }
  return found
}

/**
 * Whether the note above the seeded example songbook has been closed.
 *
 * Deliberately here and not in the `user_prefs` table the rest of this module caches:
 * this is a hint shown once at the very start of an account's life, and the cost of
 * getting it wrong in either direction is one line of text. A column and a migration
 * would buy "dismissed on the phone stays dismissed on the tablet" for a note that,
 * on the second device, is being read for the first time anyway — and is arguably
 * still worth showing there.
 *
 * Keyed by the songbook's own slug so an account that later deletes the example and
 * takes it again from the empty state gets the note again with it, which is the same
 * answer `addSampleSongbook` gives that gesture.
 */
const SAMPLE_NOTE_PREFIX = 'songs:sample-note-closed:'

export function sampleNoteClosed(slug: string): boolean {
  return read(SAMPLE_NOTE_PREFIX + slug) === true
}

export function closeSampleNote(slug: string): void {
  write(SAMPLE_NOTE_PREFIX + slug, true)
}
