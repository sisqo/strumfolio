'use client'

import { useFavorites } from '@/components/FavoritesProvider'
import { IconStar } from '@/components/icons'

/**
 * Show only the starred songs, or all of them.
 *
 * One switch for the whole app rather than one per screen — it reads and writes the single
 * memory in `favorites/filter.ts`, by way of the provider — so turning it on here leaves
 * it on inside a songbook and still on when the reader comes back from a song. That last
 * part is the gesture it exists for: open a favorite, play it, come back for the next one.
 *
 * A pill and not a checkbox, because it sits beside the search field on one screen and
 * beside "Arrange" on another, and both of those neighbourhoods are pills. It is offered
 * to every reader, not only to one who may edit: filtering is reading.
 */
export function FavoritesFilterToggle() {
  const { only, setOnly } = useFavorites()

  return (
    <button
      type="button"
      className={only ? 'icon-pill is-on' : 'icon-pill'}
      onClick={() => setOnly(!only)}
      aria-pressed={only}
      aria-label={only ? 'Show all songs' : 'Show only favorites'}
      title={only ? 'Show all songs' : 'Show only favorites'}
    >
      <IconStar size={18} filled={only} />
    </button>
  )
}
