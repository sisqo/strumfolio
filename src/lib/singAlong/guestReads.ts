'use server'

/**
 * What a guest may read with only a Sing Together token: the repertoire of the account
 * that token's broadcast belongs to (v3.0) — not every account in the installation, and
 * not necessarily the broadcaster's own, if a global owner had switched into someone
 * else's account before starting it (v3.1). No writes, no accounts of their own, no role.
 *
 * Kept apart from `./session`, which is the other side of the same feature: what only
 * the broadcast's own owner may change.
 *
 * Every export here starts by resolving `broadcastAccountForToken`, and answers `null`
 * both when the token does not resolve to a live broadcast and when the thing asked for
 * is not on that account's shelf — the same "refusal, not an empty answer" rule the rest
 * of the app uses for a reader whose role has just changed under them, and the same
 * "missing, not a distinguishable leak" rule `loadSongContent` applies for a song that
 * exists but is not the asker's to see.
 */

import { songAccountOf } from '@/lib/data/access'
import { listSectionsForAccount, listSongbooksForAccount, listSongsForAccount } from '@/lib/data/db'
import type { Song } from '@/lib/data/types'
import { type Series, seriesOf } from '@/lib/songbooks/series'

import { broadcastAccountForToken } from './session'

export interface GuestSongbook {
  slug: string
  name: string
  count: number
}

export async function guestListSongbooks(token: string): Promise<GuestSongbook[] | null> {
  const account = await broadcastAccountForToken(token)
  if (account === null) return null

  const [songbooks, songs] = await Promise.all([
    listSongbooksForAccount(account),
    listSongsForAccount(account),
  ])

  return songbooks.map((songbook) => ({
    ...songbook,
    count: songs.filter((song) => song.songbookSlug === songbook.slug).length,
  }))
}

export interface GuestSection {
  id: number
  name: string
  songs: { slug: string; title: string; artist: string | null }[]
}

export interface GuestSongbookContent {
  songbookName: string
  sections: GuestSection[]
}

/**
 * One songbook's songs, grouped by section, in the same order the reading pages use —
 * `listSongsForAccount` already returns them section by section and then in place,
 * so grouping by section here is a filter, never a re-sort.
 */
export async function guestListSongs(
  token: string,
  songbookSlug: string,
): Promise<GuestSongbookContent | null> {
  const account = await broadcastAccountForToken(token)
  if (account === null) return null

  const [songbooks, sections, songs] = await Promise.all([
    listSongbooksForAccount(account),
    listSectionsForAccount(account),
    listSongsForAccount(account),
  ])

  const songbook = songbooks.find((entry) => entry.slug === songbookSlug)
  if (songbook === undefined) return null

  const divisions = sections
    .filter((section) => section.songbookSlug === songbookSlug)
    .sort((a, b) => a.position - b.position)

  return {
    songbookName: songbook.name,
    sections: divisions.map((section) => ({
      id: section.id,
      name: section.name,
      songs: songs
        .filter((song) => song.sectionId === section.id)
        .map((song) => ({ slug: song.slug, title: song.title, artist: song.artist })),
    })),
  }
}

export async function guestLoadSong(token: string, slug: string): Promise<Song | null> {
  const account = await broadcastAccountForToken(token)
  if (account === null) return null
  // The token proves access to one account's shelf; a slug that belongs to a different
  // one — even a real, existing song — is not this guest's to read.
  if ((await songAccountOf(slug)) !== account) return null

  const songs = await listSongsForAccount(account)
  return songs.find((song) => song.slug === slug) ?? null
}

/**
 * Where a song sits among the others of its songbook, for a guest — the same
 * `seriesOf` the signed-in reading page already uses, over this token's own account,
 * so a follower's prev/next capsule works whether they browsed here or were swept
 * straight into the song by the broadcast (`FollowSession`'s `reconcile`, which never
 * touches `songbook` state at all). `null` both when the token does not resolve and
 * when the slug is not on that account's shelf — the song itself may still be showing
 * on screen (the broadcast said so more recently than this read), it just has nothing
 * to step through.
 */
export async function guestSeriesOf(token: string, slug: string): Promise<Series | null> {
  const account = await broadcastAccountForToken(token)
  if (account === null) return null

  const songs = await listSongsForAccount(account)
  const song = songs.find((entry) => entry.slug === slug)
  if (song === undefined) return null

  return seriesOf(song, songs)
}
