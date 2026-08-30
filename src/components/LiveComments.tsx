'use client'

/**
 * The two surfaces that live outside the sheet: the rail beside it, and the card over it.
 *
 * One component because both are driven by the same piece of state — which card is open —
 * and because the rail is the thing that opens one as often as a badge is.
 */

import { CommentCard } from '@/components/CommentCard'
import { CommentsRail } from '@/components/CommentsRail'
import { useComments } from '@/components/CommentsProvider'

export function LiveComments() {
  const { open, setOpen } = useComments()

  return (
    <>
      <CommentsRail onOpen={(ids) => setOpen({ kind: 'read', ids })} />
      {open !== null && <CommentCard subject={open} onClose={() => setOpen(null)} />}
    </>
  )
}
