/**
 * One dropped file to the songs it holds.
 *
 * Everything about *which* parser and *how* lives behind this one call, so the screen
 * never grows a branch per format. What the screen keeps is the part that is genuinely
 * its own: showing what was understood before anything is written.
 *
 * Nothing here reaches the server. That is a property the pasting pipeline has always
 * had — `prepareSongs` and everything under it are pure functions running in the
 * browser — and it is worth keeping deliberately rather than by accident: a person
 * importing their life's repertoire from another app has not agreed to upload it
 * anywhere, and until they press save, they have not.
 *
 * Heavy parsers arrive by `await import()` at the moment their format is dropped, so
 * somebody pasting ChordPro never downloads a PDF engine. `/booklet` in this repo is
 * already 655 kB of first load; a second route like it would not be an accident twice.
 */

import { detectSource, looksLikeXml } from './detect'
import { type PreparedSong, type SourceFile, prepareFiles, prepareSongs } from './prepare'

export type ReadResult =
  | {
      ok: true
      songs: PreparedSong[]
      /** Files in an archive that were not songs — reported as a count, never as a list. */
      skipped: number
      /**
       * The source text, when there was a single one.
       *
       * Null for an archive, and that is what it means: the screen puts this back in the
       * paste box so «start over» returns somebody to what they dropped, and for two
       * hundred files there is no such thing.
       */
      text: string | null
    }
  | { ok: false; message: string }

/** Turns XML into ChordPro; anything else passes through as the text it already is. */
async function asChordPro(text: string): Promise<string | null> {
  if (!looksLikeXml(text)) return text

  const { xmlToChordPro } = await import('./formats/opensong')
  return xmlToChordPro(text)
}

export async function readSongFile(file: File): Promise<ReadResult> {
  const source = detectSource(file.name)

  /*
   * A refusal is a real songbook file we deliberately do not open, and it carries the
   * sentence saying what to do instead. Worth its own branch because OnSong's `.backup`
   * is the *first* file somebody migrating reaches for — it is what that app's own
   * «back up everything» button produces — so it is the likeliest thing to land here,
   * and «that doesn't look like a song file» would be true and useless.
   */
  if (source.kind === 'refused') return { ok: false, message: source.advice }

  if (source.kind === 'zip' || source.kind === 'songbookpro') {
    const bytes = new Uint8Array(await file.arrayBuffer())

    if (source.kind === 'songbookpro') {
      const { readSongbookProBackup } = await import('./formats/songbookpro')
      const result = readSongbookProBackup(bytes)
      if (!result.ok) return result

      return { ok: true, songs: prepareFiles(result.files), skipped: result.skipped, text: null }
    }

    const { readArchive } = await import('./formats/archive')
    const { entries, skipped } = readArchive(bytes)

    const files: SourceFile[] = []
    let unreadable = skipped

    for (const entry of entries) {
      const text = await asChordPro(entry.text)
      if (text === null || text.trim() === '') {
        unreadable++
        continue
      }
      files.push({ text, folder: entry.folder })
    }

    if (files.length === 0) return { ok: false, message: 'No songs found in that archive.' }

    return { ok: true, songs: prepareFiles(files), skipped: unreadable, text: null }
  }

  if (source.kind === 'text' || source.kind === 'xml') {
    const raw = await file.text()
    if (raw.trim() === '') return { ok: false, message: 'That file is empty.' }

    const text = await asChordPro(raw)
    if (text === null) {
      return { ok: false, message: 'That XML file doesn’t hold a song this can read.' }
    }

    return { ok: true, songs: prepareSongs(text), skipped: 0, text }
  }

  return {
    ok: false,
    message: 'That doesn’t look like a song file. Try a .txt, .cho or .chordpro export, or a zip of them.',
  }
}
