/**
 * A zip of song files, flattened into this songbook.
 *
 * Its folders become **sections**, never songbooks. That is a product decision with a
 * rule already written down behind it: `prepare.ts` records that a `{songbook: …}` in
 * a pasted file is *shown but not obeyed*, while a `{division: …}` is obeyed — because
 * the destination is the one thing the screen around it has already asked about, and
 * an import that quietly minted three songbooks would be answering a question nobody
 * put to it. An archive's folder structure is exactly that same claim, made by a
 * directory tree instead of a directive, and it gets the same answer: it comes in
 * through `declaresSection`, and the songbook stays the one on screen.
 *
 * The practical consequence is worth stating plainly, because it is the thing a person
 * migrating will notice: somebody leaving another app with three songbooks does three
 * imports, one per songbook. That is a real cost, accepted knowingly — the alternative
 * is a screen whose «Section» control, chosen before the file was even read, silently
 * stops meaning anything.
 *
 * ## Cost
 *
 * None worth counting. `fflate` has been a dependency since the export screen learned
 * to build zips, and it exports `unzipSync` alongside the `zipSync` that was wanted
 * then. Reading an archive is therefore the cheapest whole-library win in the whole
 * import plan, which is most of why archives rank where they do in it.
 */

import { strFromU8, unzipSync } from 'fflate'

import { detectSource } from '../detect'

/** One song file lifted out of an archive, with the folder that held it. */
export interface ArchiveEntry {
  /** The full path inside the zip, kept for reporting a file that failed. */
  path: string
  /**
   * The folder that held it, or null at the root.
   *
   * Only the *last* folder, not the whole path: sections do not nest here, and
   * `Worship/2024/Advent/song.cho` files under «Advent», which is the name a person
   * would actually go looking for. A path with no folder at all is a song the archive
   * did not file, and it lands in the section chosen on screen.
   */
  folder: string | null
  text: string
}

/**
 * Paths that are never a song.
 *
 * `__MACOSX` and `.DS_Store` are what a Mac adds to a zip without being asked, and
 * they arrive in a real proportion of real archives; read as songs they produce a
 * handful of garbage rows at the top of every import. A trailing slash is a directory
 * entry, which `fflate` reports with empty contents.
 */
function isJunk(path: string): boolean {
  const name = path.split('/').pop() ?? ''
  return (
    path.endsWith('/') ||
    path.startsWith('__MACOSX/') ||
    path.includes('/__MACOSX/') ||
    name.startsWith('.') ||
    name === 'Thumbs.db'
  )
}

/** The last folder in a path, or null when the file sits at the root. */
export function folderOf(path: string): string | null {
  const parts = path.split('/').filter((part) => part !== '')
  return parts.length < 2 ? null : parts[parts.length - 2]
}

/**
 * Every song file in a zip, in the archive's own order.
 *
 * Files it cannot place are skipped rather than reported: an archive from another app
 * routinely carries PDFs, audio and its own database beside the songs, and listing
 * each one as a failure would bury the songs under a warning about material nobody
 * asked to import. What *is* reported is the count — «212 songs, 40 other files
 * skipped» — which is the honest summary without the noise.
 */
export function readArchive(bytes: Uint8Array): { entries: ArchiveEntry[]; skipped: number } {
  const unzipped = unzipSync(bytes)
  const entries: ArchiveEntry[] = []
  let skipped = 0

  for (const [path, contents] of Object.entries(unzipped)) {
    if (isJunk(path)) continue

    // Only what a song can actually live in. `refused` counts as skipped like anything
    // else here: inside an archive there is no one file to give advice about.
    const source = detectSource(path)
    if (source.kind !== 'text' && source.kind !== 'xml') {
      skipped++
      continue
    }

    const text = strFromU8(contents)
    if (text.trim() === '') {
      skipped++
      continue
    }

    entries.push({ path, folder: folderOf(path), text })
  }

  return { entries, skipped }
}
