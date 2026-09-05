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
 * it: the frame loop that scrolls the page while the pointer is parked near an edge, and
 * turning a position into a gap between rows — `slotAt`, over bands the caller measured in
 * page coordinates.
 *
 * **Move and release are listened for on `window`, not on the handle**, for the length of
 * the drag. A mouse wheel turned mid-drag makes the browser drop the pointer capture the
 * handle took on the way in (`lostpointercapture`), and from then on the release lands on
 * whatever row happens to sit under the cursor rather than on the handle. Bound to the
 * handle, that release is simply never heard: the drag never ends, the row stays lit, and
 * the next handle the cursor passes over drives it again. On `window`, keyed to the
 * pointer that started it, the release is heard wherever it falls and the capture stops
 * mattering — it is still taken, as an extra, so a release *outside* the window is routed
 * back, but nothing depends on its surviving. A mouse whose button is no longer down when
 * a move arrives is treated as a release too, for the one gap that leaves.
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
  /** Which pointer started this drag, so a second finger elsewhere is ignored. */
  const pointerId = useRef<number | null>(null)
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

    const mine = (event: globalThis.PointerEvent) =>
      pointerId.current === null || event.pointerId === pointerId.current

    const onWindowMove = (event: globalThis.PointerEvent) => {
      if (!mine(event)) return
      // A mouse whose button is up has been released between events (let go off-window,
      // then back in): the one release a window `pointerup` can miss. Touch has no
      // buttons, so this must never fire for it.
      if (event.pointerType === 'mouse' && event.buttons === 0) {
        finish()
        return
      }
      pointer.current = event.clientY
      settle()
    }

    const onWindowUp = (event: globalThis.PointerEvent) => {
      if (!mine(event)) return
      finish()
    }

    const stop = () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
      bands.current = null
      pointer.current = null
      pointerId.current = null
      slot.current = null
      window.removeEventListener('pointermove', onWindowMove)
      window.removeEventListener('pointerup', onWindowUp)
      window.removeEventListener('pointercancel', onWindowUp)
    }

    /** A release: end the drag and tell the caller. No-op if the drag is already over. */
    const finish = () => {
      if (frame.current === null) return
      stop()
      latest.current.onRelease()
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
      /**
       * Takes the pointer and starts the loop. Capture is taken as an extra — it routes a
       * release outside the window back to the handle — but the window listeners are what
       * the drag actually ends on, since a mid-drag wheel drops the capture.
       */
      begin(event: PointerEvent<HTMLElement>) {
        stop()
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // Capture is a nice-to-have; the window listeners do not need it.
        }
        pointerId.current = event.pointerId
        pointer.current = event.clientY
        lastFrame.current = performance.now()
        carry.current = 0
        window.addEventListener('pointermove', onWindowMove)
        window.addEventListener('pointerup', onWindowUp)
        window.addEventListener('pointercancel', onWindowUp)
        frame.current = requestAnimationFrame(tick)
      },
      /** Gives the loop its bands. The gap the pointer is in right now is where the row already is, so it is noted, not announced. */
      arm(measured: Band[]) {
        bands.current = measured
        const y = pageY()
        slot.current = y === null ? null : slotAt(measured, y)
      },
      /** Whether a drag is currently live — for the caller to know an arm still has a drag to arm. */
      get active() {
        return frame.current !== null
      },
      /** Drops the drag without a release: for a row that vanished from under the pointer. */
      cancel: stop,
    }
  }, [])

  useEffect(() => () => drag.cancel(), [drag])

  return drag
}
