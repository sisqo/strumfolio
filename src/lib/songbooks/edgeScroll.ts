/**
 * The speed of the page under a parked pointer.
 *
 * A row dragged further than the screen is tall has to be carried past the edge of it,
 * and on a touchscreen the finger that is carrying it cannot scroll at the same time —
 * `touch-action: none` on the handle is what makes the drag a drag at all. So the list
 * scrolls itself while the pointer is held near an edge, and this is how fast.
 */

/** Pixels per second at the edge itself, and past it. */
const FULL_SPEED = 900

/**
 * How far the page should scroll this frame for a pointer at viewport `y`, with the rows
 * visible between `top` and `bottom` — `top` being however much of the viewport a sticky
 * bar covers — over `elapsed` milliseconds.
 *
 * Nothing in the middle. Inside the zone at either end, a speed that grows with the
 * square of how deep into it the pointer is: the inner part of the zone is a crawl that
 * can be stopped on a row, the edge itself is fast, and a pointer past the edge — a mouse
 * dragged out of the window keeps reporting — is no faster than one on it.
 *
 * Per second rather than per frame, so a 120 Hz screen does not scroll twice as fast; and
 * a frame that took too long — a tab in the background, a stall — is counted as a short
 * one, so coming back cannot be a jump.
 */
export function edgeScrollStep(y: number, top: number, bottom: number, elapsed: number): number {
  const zone = Math.min(120, Math.max(48, (bottom - top) * 0.15))
  const seconds = Math.max(0, Math.min(elapsed, 50)) / 1000

  const upward = (top + zone - y) / zone
  const downward = (y - (bottom - zone)) / zone
  const depth = Math.min(1, Math.max(upward, downward))
  if (depth <= 0) return 0

  const speed = FULL_SPEED * depth * depth
  return (upward > downward ? -speed : speed) * seconds
}
