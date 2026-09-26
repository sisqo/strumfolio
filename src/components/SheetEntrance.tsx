'use client'

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'

import { clearStep, directionTo, type StepDirection } from '@/lib/stepDirection'

/**
 * The song's heading and sheet, sliding in from the side the reader stepped from — the next
 * song from the right, the previous from the left (`stepDirection.ts`).
 *
 * Only the song moves. The top bar and the reading bar stay where they are, which is the
 * rule `DESIGN.md` states for the bar a reader sees between two pages.
 *
 * `key={slug}` is what makes the animation play on both kinds of step. The reader's own
 * page remounts it on its own (a new route, and `SongProvider` is keyed on the slug), while a
 * follower's page shows a new song by swapping state in place, so without the key the
 * wrapper would stay mounted and nothing would move.
 *
 * Nothing slides when nobody stepped: a song opened from a list, the browser's back button
 * and a broadcast moving a follower arrive with no direction, and rise into place instead —
 * a few pixels and a fade, the same «this is new» without claiming a side. A hard load does
 * neither, since the words are already on screen from the server's markup and animating
 * them would make them blink.
 */
export function SheetEntrance({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <Entrance key={slug} slug={slug}>
      {children}
    </Entrance>
  )
}

/** What `useSyncExternalStore` answers during hydration (the server's snapshot) versus on a
    mount the client made itself — the one way to tell a hard load from a client navigation
    that keeps the server's markup and the first client render the same. */
const subscribeNever = () => () => {}

function Entrance({ slug, children }: { slug: string; children: ReactNode }) {
  const mountedByClient = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  )

  /* Read once, at mount: a later render must not change `data-from`, since swapping the
     animation's name mid-flight restarts it — and `mountedByClient` itself turns true right
     after hydration, which must not start an animation over words already painted. */
  const [from] = useState<StepDirection | 'open' | null>(
    () => directionTo(slug) ?? (mountedByClient ? 'open' : null),
  )
  const [entering, setEntering] = useState(from !== null)

  useEffect(() => clearStep(slug), [slug])

  return (
    /*
     * `is-entering` has the box around the stage clip sideways while the song slides in
     * (see `.sheet-stage` in the CSS): a sheet shifted a gutter to the right would
     * otherwise make the whole page scroll sideways for the length of the animation. Only
     * while, because the chip menus under the title must not be clipped at rest.
     */
    <div className={entering ? 'sheet-stage is-entering' : 'sheet-stage'}>
      <div
        className="sheet-entrance"
        data-from={from ?? undefined}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) setEntering(false)
        }}
      >
        {children}
      </div>
    </div>
  )
}
