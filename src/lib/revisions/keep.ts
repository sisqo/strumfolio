/**
 * When a song's text goes into `song_revisions` before it is overwritten, and how many stay.
 *
 * Two cases and no third (owner's decision, 2026-09-27):
 *
 * - **a write through an AI token** keeps what it replaces, whoever wrote that;
 * - **a write from the app over a text an AI wrote** keeps the AI's text — a queued offline
 *   edit landing after the AI's would otherwise erase its work with no trace, and the editor
 *   behaves exactly as before.
 *
 * An ordinary hand edit over a hand edit keeps nothing: a history of manual saves is a separate
 * decision, and it would reach the offline queue. Restoring a revision is the one app write that
 * always keeps what it replaces (`force`), so a restore can itself be undone.
 *
 * Pruning keeps `REVISIONS_KEPT` per song **and never the newest `app` row**: that is the song as
 * a person last left it before an AI started, and an AI saving twenty-one times in one session
 * would otherwise push out exactly the version the history exists to protect.
 */

import { desc, eq, inArray, sql } from 'drizzle-orm'

import { tokenActor } from '@/lib/auth/actor'
import type { db } from '@/lib/db/client'
import { songRevisions } from '@/lib/db/schema'

export const REVISIONS_KEPT = 20

type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0]

export type Writer = { kind: 'app' } | { kind: 'ai'; tokenId: number }

/** Who is writing, read from the request and never from anything the caller sent. */
export function currentWriter(): Writer {
  const actor = tokenActor()
  return actor === undefined ? { kind: 'app' } : { kind: 'ai', tokenId: actor.tokenId }
}

/** The stored text about to be overwritten, as the row holds it. */
export interface StoredText {
  id: number
  title: string
  artist: string | null
  body: string
  updatedAt: Date
  aiWrittenAt: Date | null
  aiTokenId: number | null
}

export function shouldKeep(writer: Writer, stored: Pick<StoredText, 'aiWrittenAt'>, force = false): boolean {
  if (force) return true
  if (writer.kind === 'ai') return true
  return stored.aiWrittenAt !== null
}

/**
 * The ids to delete from a song's revisions, given all of them newest first. Pure, so the one
 * exception to «the newest twenty» is tested rather than trusted.
 */
export function prunable(rows: readonly { id: number; writtenBy: 'app' | 'ai' }[], kept = REVISIONS_KEPT): number[] {
  const pinned = rows.find((row) => row.writtenBy === 'app')?.id
  return rows.slice(kept).filter((row) => row.id !== pinned).map((row) => row.id)
}

/** The columns a write sets on `songs` to say who wrote the text it leaves behind. */
export function authorship(writer: Writer): { aiWrittenAt: Date | ReturnType<typeof sql> | null; aiTokenId: number | null } {
  return writer.kind === 'ai' ? { aiWrittenAt: sql`now()`, aiTokenId: writer.tokenId } : { aiWrittenAt: null, aiTokenId: null }
}

/**
 * Keeps `stored` when the rule above says so, inside the caller's transaction — the same one
 * that overwrites it, so a rolled-back save leaves no revision behind.
 */
export async function keepRevision(tx: Tx, stored: StoredText, writer: Writer, force = false): Promise<void> {
  if (!shouldKeep(writer, stored, force)) return

  await tx.insert(songRevisions).values({
    songId: stored.id,
    title: stored.title,
    artist: stored.artist,
    body: stored.body,
    writtenBy: stored.aiWrittenAt === null ? 'app' : 'ai',
    tokenId: stored.aiWrittenAt === null ? null : stored.aiTokenId,
    writtenAt: stored.updatedAt,
  })

  const rows = await tx
    .select({ id: songRevisions.id, writtenBy: songRevisions.writtenBy })
    .from(songRevisions)
    .where(eq(songRevisions.songId, stored.id))
    .orderBy(desc(songRevisions.id))

  const doomed = prunable(rows)
  if (doomed.length > 0) await tx.delete(songRevisions).where(inArray(songRevisions.id, doomed))
}
