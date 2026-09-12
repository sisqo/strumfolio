'use client'

/**
 * A card pinned under the thing that was tapped, on a backdrop that dismisses it.
 *
 * Two cards want exactly this and differ only in what is inside them: the stack of notes a
 * badge opens (`CommentCard`), and — on a screen too narrow for the notes panel — the note
 * being written (`LiveComments`). The placement is the fiddly half and it was written once,
 * so it lives here rather than in whichever of the two happened to need it first.
 */

import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'

import type { CardPoint } from '@/lib/comments/types'

/** How wide the card would like to be, and how close to the edge it may come. */
const CARD_WIDTH = 320
const MARGIN = 12
/** The gap between the mark and the card, so the badge stays visible beside it. */
const GAP = 10

/**
 * Pins the card under the mark it belongs to, clamped so it never runs off the screen.
 *
 * At **every** width, with no bottom-sheet branch. The first version fell back to a sheet
 * below 480px on the reasoning that a 320px card is most of a phone screen anyway — but
 * the point of the card is that the words it is about stay in view beside it, and a sheet
 * at the foot of the page is exactly what breaks that. On a narrow screen the card
 * narrows instead.
 *
 * Takes the measured height rather than guessing one: whether there is room below the
 * mark depends on how tall the card actually turned out, which is only knowable once it
 * has rendered — hence the layout effect that calls this again with a real number.
 */
function placeCard(at: CardPoint, height: number): React.CSSProperties {
  if (typeof window === 'undefined') return {}

  const width = Math.min(CARD_WIDTH, window.innerWidth - MARGIN * 2)
  const left = Math.min(
    Math.max(MARGIN, at.x - width / 2),
    Math.max(MARGIN, window.innerWidth - width - MARGIN),
  )

  // Under the mark by default; above it when the card would otherwise run off the bottom,
  // which is what a note near the foot of a long song would do on every open.
  const fitsBelow = at.y + GAP + height <= window.innerHeight - MARGIN
  const top = fitsBelow
    ? at.y + GAP
    : Math.max(MARGIN, Math.min(at.y - GAP - height, window.innerHeight - height - MARGIN))

  return { position: 'fixed', left, top, width, margin: 0 }
}

export function PointedCard({
  at,
  label,
  className,
  /** What changing it should re-measure the height against — see the layout effect. */
  resizeKey,
  onClose,
  children,
}: {
  at: CardPoint
  label: string
  className: string
  resizeKey?: unknown
  onClose: () => void
  children: ReactNode
}) {
  const card = useRef<HTMLDivElement | null>(null)
  const [placed, setPlaced] = useState<React.CSSProperties>(() => placeCard(at, 0))

  /*
   * Placed once against a zero height, then again against the real one before the browser
   * paints — `useLayoutEffect`, not `useEffect`, so the card is never seen in the wrong
   * place for a frame.
   *
   * A card that grew after opening would otherwise keep a `top` computed for its old
   * height and could run off the bottom of the screen, which is why the caller hands in
   * whatever makes it taller as `resizeKey`.
   */
  useLayoutEffect(() => {
    setPlaced(placeCard(at, card.current?.offsetHeight ?? 0))
  }, [at, resizeKey])

  return (
    <div className="comment-card-backdrop" onClick={onClose} role="presentation">
      <div
        className={className}
        ref={card}
        style={placed}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  )
}
