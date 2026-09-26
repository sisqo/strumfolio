/**
 * Which way the reader just stepped through the songbook, so the song that arrives can come
 * in from that side — the next one from the right, the previous from the left.
 *
 * A module variable rather than state or storage, because the two ends of it are on two
 * different pages: the bar's arrow is on the song being left and `SheetEntrance` on the song
 * arriving, and a client navigation keeps this module loaded between them. A hard load
 * starts it empty, which is the answer wanted there — nobody stepped, so nothing slides.
 *
 * Keyed on the song being stepped *to*, and forgotten after a few seconds: a step whose
 * navigation never finished must not make the same song slide in when it is later opened
 * from the songbook list, where there is no direction to speak of.
 */
export type StepDirection = 'previous' | 'next'

const FORGET_AFTER_MS = 10_000

let pending: { slug: string; direction: StepDirection; at: number } | null = null

export function markStep(slug: string, direction: StepDirection): void {
  pending = { slug, direction, at: Date.now() }
}

/** The direction a step to `slug` was taken in, or null when this song was not stepped to. */
export function directionTo(slug: string): StepDirection | null {
  if (pending === null || pending.slug !== slug) return null
  if (Date.now() - pending.at > FORGET_AFTER_MS) return null
  return pending.direction
}

export function clearStep(slug: string): void {
  if (pending?.slug === slug) pending = null
}
