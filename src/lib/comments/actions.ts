'use server'

/**
 * Server actions for anchored comments.
 *
 * The database is the source of truth; the client keeps a read cache so the notes are
 * still on the page with no signal (`store.ts`) and a persistent outbox so one written
 * with no signal is not lost (`outbox.ts`).
 *
 * No plan check and no role check anywhere in this file, deliberately — the same
 * reasoning `saveSongPrefs` states for checking nothing: a note about how this one reader
 * reads, on their own screen, is not a modification of anything shared. The one thing
 * every query does enforce is that a reader only ever touches rows carrying their own
 * address, which is a different question from what they are allowed to buy.
 */

import { and, eq } from 'drizzle-orm'

import { currentUser } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { userSongComments } from '@/lib/db/schema'

import { readTarget, type SongComment } from './types'

/**
 * The outcome of a write, from the outbox's point of view — the same three-way split
 * `SaveResult` makes in `prefs/actions.ts`, and for the same reason: only `failed` is
 * worth retrying. With nobody signed in there is nothing to sync to and the outbox must
 * drop the entry rather than resend it forever.
 */
export type CommentWriteResult = 'saved' | 'no-destination' | 'failed'

interface Row {
  id: string
  blockIndex: number | null
  charOffset: number | null
  target: string
  anchorLabel: string
  body: string
  createdAt: Date
  updatedAt: Date
}

function toComment(row: Row): SongComment {
  return {
    id: row.id,
    anchor:
      row.blockIndex === null || row.charOffset === null
        ? null
        : { blockIndex: row.blockIndex, charOffset: row.charOffset, target: readTarget(row.target) },
    anchorLabel: row.anchorLabel,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function loadComments(songSlug: string): Promise<SongComment[] | null> {
  const user = await currentUser()
  if (user === null) return null

  try {
    const rows = await db()
      .select({
        id: userSongComments.id,
        blockIndex: userSongComments.blockIndex,
        charOffset: userSongComments.charOffset,
        target: userSongComments.target,
        anchorLabel: userSongComments.anchorLabel,
        body: userSongComments.body,
        createdAt: userSongComments.createdAt,
        updatedAt: userSongComments.updatedAt,
      })
      .from(userSongComments)
      .where(and(eq(userSongComments.userEmail, user.email), eq(userSongComments.songSlug, songSlug)))

    return rows.map(toComment)
  } catch (error) {
    console.error('loadComments failed', error)
    return null
  }
}

/**
 * Writes one comment, whether it is new or an edit of one already there.
 *
 * An upsert on the client-minted id rather than an insert-or-update decided here, because
 * the outbox can legitimately deliver the same entry twice — it retries, and a retry after
 * a response that never arrived is indistinguishable from a first attempt. Making the
 * write idempotent is what stops that producing two copies of one note.
 */
export async function saveComment(songSlug: string, comment: SongComment): Promise<CommentWriteResult> {
  const email = (await currentUser())?.email ?? null
  if (email === null) return 'no-destination'

  const values = {
    blockIndex: comment.anchor?.blockIndex ?? null,
    charOffset: comment.anchor?.charOffset ?? null,
    target: comment.anchor?.target ?? 'lyric',
    anchorLabel: comment.anchorLabel,
    body: comment.body,
    updatedAt: new Date(),
  }

  try {
    await db()
      .insert(userSongComments)
      .values({ id: comment.id, userEmail: email, songSlug, ...values })
      .onConflictDoUpdate({ target: userSongComments.id, set: values })
    return 'saved'
  } catch (error) {
    console.error('saveComment failed', error)
    return 'failed'
  }
}

export async function deleteComment(id: string): Promise<CommentWriteResult> {
  const email = (await currentUser())?.email ?? null
  if (email === null) return 'no-destination'

  try {
    await db()
      .delete(userSongComments)
      .where(and(eq(userSongComments.id, id), eq(userSongComments.userEmail, email)))
    return 'saved'
  } catch (error) {
    console.error('deleteComment failed', error)
    return 'failed'
  }
}

/**
 * Carries every reader's comments on one song across an edit of that song.
 *
 * Every reader's, not just the editing one's: a song belongs to an account and the person
 * who edits it is not necessarily the only one who has annotated it. Filtering to the
 * current address here would leave everyone else's notes pointing at text that has moved.
 *
 * Called from the song save path with the source as it was before the write. Returns how
 * many notes lost their hold, which is the only fact the caller can usefully tell anybody.
 */
export async function reanchorSongComments(
  songSlug: string,
  oldSource: string,
  newSource: string,
): Promise<{ orphaned: number }> {
  if (oldSource === newSource) return { orphaned: 0 }

  const { reanchorAll } = await import('./reanchor')

  try {
    const rows = await db()
      .select({
        id: userSongComments.id,
        blockIndex: userSongComments.blockIndex,
        charOffset: userSongComments.charOffset,
        target: userSongComments.target,
        anchorLabel: userSongComments.anchorLabel,
        body: userSongComments.body,
        createdAt: userSongComments.createdAt,
        updatedAt: userSongComments.updatedAt,
      })
      .from(userSongComments)
      .where(eq(userSongComments.songSlug, songSlug))

    if (rows.length === 0) return { orphaned: 0 }

    const before = rows.map(toComment)
    const after = reanchorAll(before, oldSource, newSource)

    let orphaned = 0
    for (let i = 0; i < after.length; i += 1) {
      const was = before[i]
      const now = after[i]
      if (was.anchor === now.anchor) continue
      if (now.anchor === null) orphaned += 1

      await db()
        .update(userSongComments)
        .set({
          blockIndex: now.anchor?.blockIndex ?? null,
          charOffset: now.anchor?.charOffset ?? null,
        })
        .where(eq(userSongComments.id, now.id))
    }

    return { orphaned }
  } catch (error) {
    // A failure here must never fail the song save: the edit is the thing the reader
    // asked for, and notes that did not move are recoverable where a refused save is not.
    console.error('reanchorSongComments failed', error)
    return { orphaned: 0 }
  }
}
