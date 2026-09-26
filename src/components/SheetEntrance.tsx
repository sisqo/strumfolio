'use client'

import { useEffect, useState, type ReactNode } from 'react'

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
 * Nothing slides when nobody stepped. A hard load, the browser's back button and a
 * broadcast moving a follower all arrive with no direction, and the song simply appears as
 * it did before. That also keeps the server's markup identical to the client's first render.
 */
export function SheetEntrance({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <Entrance key={slug} slug={slug}>
      {children}
    </Entrance>
  )
}

function Entrance({ slug, children }: { slug: string; children: ReactNode }) {
  /* Read once, at mount: a later render must not change `data-from`, since swapping the
     animation's name mid-flight restarts it. */
  const [from] = useState<StepDirection | null>(() => directionTo(slug))
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
