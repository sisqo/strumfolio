'use server'

/**
 * The editor's «History»: the texts `song_revisions` kept for a song, and putting one back.
 *
 * Reached by slug, so authorized like every other slug action — `accessTo` on the *song's*
 * account and `canEdit` — which also means an AI token reaches only its own account's history.
 * A restore is a change to the repertoire, so the freeze closes it like a save.
 *
 * **A restore always keeps what it replaces** (`keepRevision(…, force)`), whoever wrote it: the
 * button is one tap, and being able to undo it is what makes one tap acceptable.
 */

import { and, desc, eq, sql } from 'drizzle-orm'

import { accessTo } from '@/lib/auth/session'
import { reanchorSongComments } from '@/lib/comments/reanchorSong'
import { songAccountOf } from '@/lib/data/access'
import { db, hasDatabase } from '@/lib/db/client'
import { apiTokens, songbooks, songRevisions, songs } from '@/lib/db/schema'
import { entitlementsOf } from '@/lib/plans/resolve'
import { revalidateSong } from '@/lib/revalidate'
import { canEdit } from '@/lib/roles'

import { authorship, currentWriter, keepRevision } from './keep'

export interface RevisionRow {
  id: number
  writtenBy: 'app' | 'ai'
  /** The token's name when an AI wrote it and the token still exists. */
  tokenName: string | null
  writtenAt: string
  title: string
  artist: string | null
  body: string
}

export interface SongHistory {
  /** When an AI last rewrote the current text, or null if a person did. */
  aiWrittenAt: string | null
  aiTokenName: string | null
  revisions: RevisionRow[]
}

export type RestoreResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'frozen' | 'plan-required' | 'song-limit' | 'songbook-limit' | 'failed' }

async function editable(slug: string): Promise<string | null> {
  if (!hasDatabase || typeof slug !== 'string') return null
  const owner = await songAccountOf(slug)
  if (owner === null) return null
  const user = await accessTo(owner)
  return user !== null && canEdit(user.role) ? owner : null
}

export async function loadSongHistory(slug: string): Promise<SongHistory | null> {
  if ((await editable(slug)) === null) return null

  const [song] = await db()
    .select({ id: songs.id, aiWrittenAt: songs.aiWrittenAt, tokenName: apiTokens.name })
    .from(songs)
    .leftJoin(apiTokens, eq(songs.aiTokenId, apiTokens.id))
    .where(eq(songs.slug, slug))
    .limit(1)
  if (song === undefined) return null

  const rows = await db()
    .select({
      id: songRevisions.id,
      writtenBy: songRevisions.writtenBy,
      tokenName: apiTokens.name,
      writtenAt: songRevisions.writtenAt,
      title: songRevisions.title,
      artist: songRevisions.artist,
      body: songRevisions.body,
    })
    .from(songRevisions)
    .leftJoin(apiTokens, eq(songRevisions.tokenId, apiTokens.id))
    .where(eq(songRevisions.songId, song.id))
    .orderBy(desc(songRevisions.id))

  return {
    aiWrittenAt: song.aiWrittenAt?.toISOString() ?? null,
    aiTokenName: song.aiWrittenAt === null ? null : song.tokenName,
    revisions: rows.map((row) => ({ ...row, writtenAt: row.writtenAt.toISOString() })),
  }
}

export async function restoreSongRevision(slug: string, revisionId: number): Promise<RestoreResult> {
  const owner = await editable(slug)
  if (owner === null || !Number.isInteger(revisionId)) return { ok: false, reason: 'not-found' }

  const refused = (await entitlementsOf(owner)).refused.editRepertoire
  if (refused !== null) return { ok: false, reason: refused }

  try {
    const outcome = await db().transaction(async (tx) => {
      const [stored] = await tx
        .select({
          id: songs.id,
          title: songs.title,
          artist: songs.artist,
          body: songs.body,
          updatedAt: songs.updatedAt,
          aiWrittenAt: songs.aiWrittenAt,
          aiTokenId: songs.aiTokenId,
          songbookSlug: songbooks.slug,
        })
        .from(songs)
        .innerJoin(songbooks, eq(songs.songbookId, songbooks.id))
        .where(eq(songs.slug, slug))
        .limit(1)
        .for('update', { of: songs })
      if (stored === undefined) return null

      const [revision] = await tx
        .select()
        .from(songRevisions)
        .where(and(eq(songRevisions.id, revisionId), eq(songRevisions.songId, stored.id)))
        .limit(1)
      if (revision === undefined) return null

      const writer = currentWriter()
      await keepRevision(tx, stored, writer, true)
      await tx
        .update(songs)
        .set({
          title: revision.title,
          artist: revision.artist,
          body: revision.body,
          /* The database's clock, as every save stamps it — see `saveSong`. */
          updatedAt: sql`now()`,
          version: sql`${songs.version} + 1`,
          ...authorship(writer),
        })
        .where(eq(songs.id, stored.id))

      return { previous: stored.body, next: revision.body, songbookSlug: stored.songbookSlug }
    })

    if (outcome === null) return { ok: false, reason: 'not-found' }

    await reanchorSongComments(slug, outcome.previous, outcome.next)
    revalidateSong(slug, outcome.songbookSlug)
    return { ok: true }
  } catch (error) {
    console.error('restoreSongRevision failed', error)
    return { ok: false, reason: 'failed' }
  }
}
