'use server'

/**
 * Reads that keep a dynamic page's first paint honest.
 *
 * Every song/songbook page is rendered per request now (v3.0), but the shell it starts
 * from is still a snapshot from whenever that request was made — these two are how the
 * browser finds out it has changed since, the same reason a client-rendered app ever
 * needs a refresh path.
 *
 * Both need access to the *song's own* account (v3.0), not merely any session — a
 * signed-in reader of one account has no business reading another's repertoire just
 * because both happen to be signed in.
 */

import { eq } from 'drizzle-orm'

import { accessTo, currentUser } from '@/lib/auth/session'
import { songAccountOf } from '@/lib/data/access'
import { listSongsForAccount, rowToSong } from '@/lib/data/db'
import { db, hasDatabase } from '@/lib/db/client'
import { songbooks, songs } from '@/lib/db/schema'

import type { SongIndexRow } from '@/lib/search-index'

import type { SongContent } from './overlay'

/**
 * The current version of one song, if the reader has access to *its* account.
 *
 * The three answers are kept apart on purpose. `missing` means the row is gone, or the
 * reader has no business seeing it — the two are answered the same way here, on purpose:
 * telling apart "does not exist" from "exists, but is not yours" is exactly the leak
 * this check exists to close. `unavailable` means the question could not be asked, which
 * is the normal state offline and must never be mistaken for either.
 */
export async function loadSongContent(slug: string): Promise<SongContent> {
  if (!hasDatabase) return { state: 'unavailable' }

  try {
    const owner = await songAccountOf(slug)
    if (owner === null) return { state: 'missing' }
    if ((await accessTo(owner)) === null) return { state: 'missing' }

    const rows = await db()
      .select({ song: songs, songbookSlug: songbooks.slug })
      .from(songs)
      .innerJoin(songbooks, eq(songs.songbookId, songbooks.id))
      .where(eq(songs.slug, slug))
      .limit(1)
    if (rows.length === 0) return { state: 'missing' }

    return { state: 'found', song: rowToSong(rows[0].song, rows[0].songbookSlug) }
  } catch (error) {
    console.error('loadSongContent failed', error)
    return { state: 'unavailable' }
  }
}

/**
 * Every song of the reader's **current account** as it is now, without bodies.
 *
 * Bodies are what make a repertoire heavy and the list does not show them, so
 * this stays small enough to ask for on every visit to the list. Null means the
 * question could not be asked and the list should keep what the shell already has.
 *
 * Ordered the same way `dbRepository.listSongs` orders — `listSongsForAccount` already
 * applies that same query — so the list this overlays does not visibly reshuffle itself
 * the moment this answers.
 */
export async function loadSongIndex(): Promise<SongIndexRow[] | null> {
  const user = await currentUser()
  if (user === null) return null

  try {
    const rows = await listSongsForAccount(user.accountOwnerEmail)
    return rows.map((song) => ({
      slug: song.slug,
      title: song.title,
      artist: song.artist,
      tags: song.tags,
      updatedAt: song.updatedAt,
    }))
  } catch (error) {
    console.error('loadSongIndex failed', error)
    return null
  }
}
