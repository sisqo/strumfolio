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
import { accountIdOf, songIdOf } from '@/lib/db/ids'
import { userSongComments } from '@/lib/db/schema'

import { type SongComment, commentFromRow } from './types'

/**
 * The outcome of a write, from the outbox's point of view — the same three-way split
 * `SaveResult` makes in `prefs/actions.ts`, and for the same reason: only `failed` is
 * worth retrying. With nobody signed in there is nothing to sync to and the outbox must
 * drop the entry rather than resend it forever.
 */
export type CommentWriteResult = 'saved' | 'no-destination' | 'failed'

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
      .where(
        and(
          eq(userSongComments.accountId, accountIdOf(user.email)),
          eq(userSongComments.songId, songIdOf(songSlug)),
        ),
      )

    return rows.map(commentFromRow)
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
      .values({
        id: comment.id,
        accountId: accountIdOf(email),
        songId: songIdOf(songSlug),
        ...values,
      })
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
      .where(and(eq(userSongComments.id, id), eq(userSongComments.accountId, accountIdOf(email))))
    return 'saved'
  } catch (error) {
    console.error('deleteComment failed', error)
    return 'failed'
  }
}
