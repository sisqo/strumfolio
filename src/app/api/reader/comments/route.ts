import { deleteComment, loadComments, saveComment } from '@/lib/comments/actions'
import type { SongComment } from '@/lib/comments/types'
import { isRecord, isSlug, readerRoute } from '@/lib/reader/route'

type CommentCall =
  | { kind: 'load'; slug: string }
  | { kind: 'save'; slug: string; comment: SongComment }
  | { kind: 'delete'; id: string }

/**
 * The notes' read and the outbox's two writes, outside the action queue —
 * `lib/reader/route.ts` says why. The comment's fields are read by `saveComment` itself.
 */
export const POST = readerRoute(
  (body): CommentCall | null => {
    if (!isRecord(body)) return null
    if (body.kind === 'delete') return isSlug(body.id) ? { kind: 'delete', id: body.id } : null
    if (!isSlug(body.slug)) return null
    if (body.kind === 'load') return { kind: 'load', slug: body.slug }
    if (body.kind === 'save' && isRecord(body.comment)) {
      return { kind: 'save', slug: body.slug, comment: body.comment as unknown as SongComment }
    }
    return null
  },
  (call) => {
    switch (call.kind) {
      case 'load':
        return loadComments(call.slug)
      case 'save':
        return saveComment(call.slug, call.comment)
      case 'delete':
        return deleteComment(call.id)
    }
  },
)
