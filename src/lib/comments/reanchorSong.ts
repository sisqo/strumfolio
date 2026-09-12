/**
 * Carries every reader's comments on one song across an edit of that song.
 *
 * Every reader's, not just the editing one's: a song belongs to an account and the person
 * who edits it is not necessarily the only one who has annotated it. Filtering to the
 * current address here would leave everyone else's notes pointing at text that has moved.
 *
 * Called from the song save path with the source as it was before the write. Returns how
 * many notes lost their hold, which is the only fact the caller can usefully tell anybody.
 *
 * **A plain module, not a `'use server'` export, and that is the whole reason it lives here
 * rather than in `comments/actions.ts` where it was written.** Every export of a `'use server'`
 * file is a server action with an id baked into the client bundle, callable by anyone who can
 * reach this origin — and this function takes no session, filters by `songId` alone, and
 * rewrites *every account's* anchors for that slug. As an action it was an unauthenticated
 * cross-account write; as a plain function imported only by `import/actions.ts`'s own save path
 * (which has already resolved and checked the account) it is reachable by nobody else. Same
 * arrangement `testCard.ts` uses beside `checkout.ts`.
 */

import { eq } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { songIdOf } from '@/lib/db/ids'
import { userSongComments } from '@/lib/db/schema'

import { commentFromRow } from './types'

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
      .where(eq(userSongComments.songId, songIdOf(songSlug)))

    if (rows.length === 0) return { orphaned: 0 }

    const before = rows.map(commentFromRow)
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
