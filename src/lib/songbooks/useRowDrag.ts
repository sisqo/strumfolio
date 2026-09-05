import { useEffect, useMemo, useRef } from 'react'
import type { PointerEvent } from 'react'

import { edgeScrollStep } from './edgeScroll'
import { type Band, slotAt } from './order'

interface RowDragOptions {
  /** The pointer is in another gap than it was. Never called twice running with the same one. */
  onSlot: (slot: number) => void
  /** The pointer was let go. Once per drag, and not after `cancel`. */
  onRelease: () => void
  /** How much of the viewport's top a sticky bar covers, asked every frame. */
  coveredAbove: () => number
}

/**
 * The pointer side of dragging a row through a list, shared by the two screens that do
 * it: capturing the pointer, the frame loop that scrolls the page while the pointer is
 * parked near an edge, and turning a position into a gap between rows — `slotAt`, over
 * bands the caller measured in page coordinates.
 *
 * The frame loop is what makes a long drag work at all. Pointer events only arrive while
 * the pointer moves, and the two things that move the list without moving the pointer —
 * the wheel of a mouse, and this hook's own scrolling — would otherwise leave the row where
 * the pointer last was rather than where it is. So every frame reads the pointer's page
 * position afresh, scroll included, and re-asks which gap it is in; `onSlot` is only
 * called when the answer changes, so a still pointer costs nothing but the question.
 *
 * `begin` and `arm` are two steps because a section drag cannot measure its bands on the
 * pointer-down: the collapse it causes has not been painted yet (see `ArrangeSongbook`'s
 * layout effect). Until `arm`, the loop neither scrolls nor places anything.
 */
export function useRowDrag({ onSlot, onRelease, coveredAbove }: RowDragOptions) {
  const bands = useRef<Band[] | null>(null)
  /** The pointer's `clientY`, as last reported. */
  const pointer = useRef<number | null>(null)
  const slot = useRef<number | null>(null)
  const frame = useRef<number | null>(null)
  const lastFrame = useRef(0)
  /** Scrolling is whole pixels; whatever a frame's share fell short of one carries over. */
  const carry = useRef(0)

  // Read at call time, so the loop never runs a stale closure of the caller's.
  const latest = useRef({ onSlot, onRelease, coveredAbove })
  useEffect(() => {
    latest.current = { onSlot, onRelease, coveredAbove }
  })

  const drag = useMemo(() => {
    const pageY = () => (pointer.current === null ? null : pointer.current + window.scrollY)

    const settle = () => {
      const y = pageY()
      if (bands.current === null || y === null) return

      const at = slotAt(bands.current, y)
      if (at === slot.current) return
      slot.current = at
      latest.current.onSlot(at)
    }

    const stop = () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
      bands.current = null
      pointer.current = null
      slot.current = null
    }

    const tick = (now: number) => {
      frame.current = requestAnimationFrame(tick)
      const elapsed = now - lastFrame.current
      lastFrame.current = now

      if (bands.current !== null && pointer.current !== null) {
        const step =
          edgeScrollStep(pointer.current, latest.current.coveredAbove(), window.innerHeight, elapsed) +
          carry.current
        const whole = Math.trunc(step)
        carry.current = step - whole
        if (whole !== 0) window.scrollBy({ top: whole, behavior: 'instant' })
      }

      settle()
    }

    return {
      /** Takes the pointer and starts the loop. Capture, so the row keeps following a finger that has slid off the handle. */
      begin(event: PointerEvent<HTMLElement>) {
        event.currentTarget.setPointerCapture(event.pointerId)
        stop()
        pointer.current = event.clientY
        lastFrame.current = performance.now()
        carry.current = 0
        frame.current = requestAnimationFrame(tick)
      },
      /** Gives the loop its bands. The gap the pointer is in right now is where the row already is, so it is noted, not announced. */
      arm(measured: Band[]) {
        bands.current = measured
        const y = pageY()
        slot.current = y === null ? null : slotAt(measured, y)
      },
      move(event: PointerEvent<HTMLElement>) {
        if (frame.current === null) return
        pointer.current = event.clientY
        settle()
      },
      end() {
        if (frame.current === null) return
        stop()
        latest.current.onRelease()
      },
      /** Drops the drag without a release: for a row that vanished from under the pointer. */
      cancel: stop,
    }
  }, [])

  useEffect(() => () => drag.cancel(), [drag])

  return drag
}
