'use client'

import Link from 'next/link'

import { IconChevronRight } from '@/components/icons'
import { tapFeedback } from '@/lib/haptics'
import type { SongStep } from '@/lib/songbooks/series'
import { markStep } from '@/lib/stepDirection'

/**
 * The song that comes next, at the bottom of this one: where a reader's eyes already are
 * when the words run out, which the bar's arrow — a thumb's width wide, at the edge — is not.
 *
 * The same step the arrow takes, direction included, so the next song slides in from the
 * right whichever of the two was pressed. A follower's page passes `onStepTo`, since it
 * shows a song by swapping state rather than routing, exactly as `ControlBar`'s `Step` does.
 */
export function UpNext({ step, onStepTo }: { step: SongStep; onStepTo?: (slug: string) => void }) {
  const face = (
    <>
      <span className="up-next-text">
        <span className="up-next-label">Up next</span>
        <span className="up-next-title">{step.title}</span>
      </span>
      <IconChevronRight size={20} />
    </>
  )

  const onClick = () => {
    tapFeedback()
    markStep(step.slug, 'next')
  }

  if (onStepTo !== undefined) {
    return (
      <button
        type="button"
        className="up-next"
        onClick={() => {
          onClick()
          onStepTo(step.slug)
        }}
      >
        {face}
      </button>
    )
  }

  /* No prefetch of its own: the bar's arrow already fetched this very page, and a second
     Link to it entering the viewport would only ask again. */
  return (
    <Link href={`/songs/${step.slug}`} prefetch={false} className="up-next" onClick={onClick}>
      {face}
    </Link>
  )
}
