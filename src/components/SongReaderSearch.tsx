'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'

import { useFavorites } from '@/components/FavoritesProvider'
import { SongRow } from '@/components/SongRow'
import { IconSearch } from '@/components/icons'
import type { SongIndexRow } from '@/lib/search-index'

/**
 * The reading bar's quick jump to another song, opened from `TopBar`'s search button.
 *
 * Owns both the button and the panel, same shape as `NavMenu`/`UserMenu`: one component,
 * one piece of state, so the two never disagree about whether the panel is open. The
 * panel itself is `position: absolute` against `.top-bar` (see `.song-search-panel` in
 * globals.css) rather than a real second row in the header's own layout — it reads as
 * one because it is flush, full width and opaque, but nothing below the bar has to
 * reflow to make room for it.
 *
 * Matching is title/artist/tag only, the same fields `SongbookSongs` searches with and
 * deliberately not the lyrics `HomeScreen`'s own search reaches into: this bar renders on
 * every song a reader opens, so nothing here should carry a whole account's words along
 * for a feature most of those loads never use.
 */
function matches(song: SongIndexRow, terms: string[]): boolean {
  const haystack = `${song.title} ${song.artist ?? ''} ${song.tags.join(' ')}`.toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

export function SongReaderSearch({
  library,
  current,
}: {
  library: { song: SongIndexRow; under: string | null }[]
  /** The song on screen, which `library` leaves out — named only to say so when it is the one
      thing a query finds, rather than «No songs found» about a song the reader is looking at. */
  current: SongIndexRow
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const { isFavorite } = useFavorites()

  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const searching = deferred.trim() !== ''

  // Every term must appear somewhere, so "certe notti" and "notti certe" both match —
  // same rule as HomeScreen's own search, applied to fewer fields.
  const terms = useMemo(() => deferred.trim().toLowerCase().split(/\s+/).filter(Boolean), [deferred])
  const results = useMemo(() => {
    if (terms.length === 0) return []
    const found = library.filter(({ song }) => matches(song, terms))
    return [...found].sort((one, other) => one.song.title.localeCompare(other.song.title, 'it'))
  }, [library, terms])

  // A song alone in its account — nothing else to jump to. After the hooks above, not
  // before: their own order must never depend on how many songs happen to exist.
  if (library.length === 0) return null

  return (
    <div className="flex-none">
      <button
        type="button"
        className="icon-pill"
        aria-expanded={open}
        aria-label={open ? 'Close search' : 'Search songs'}
        onClick={() => setOpen((value) => !value)}
      >
        <IconSearch size={18} />
      </button>

      {open && (
        <>
          {/* Catches the tap that means "never mind", same as every other header panel. */}
          <div className="menu-overlay" onClick={close} aria-hidden />

          <div className="song-search-panel">
            <div className="song-search-panel-inner">
              <label className="search-field block">
                <span className="sr-only">Search songs</span>
                <IconSearch />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search title, artist, or tags"
                  autoComplete="off"
                  autoFocus
                  className="form-field"
                />
              </label>

              {searching &&
                (results.length === 0 ? (
                  <p className="mt-4 text-center text-sm text-muted">
                    {matches(current, terms) ? 'That is the song you are reading.' : 'No songs found.'}
                  </p>
                ) : (
                  <ul className="song-search-results row-list card">
                    {results.map(({ song, under }) => (
                      // The click that opens a result also closes the panel — it would
                      // otherwise still read as open for the moment before the new page
                      // replaces this one.
                      <li key={song.slug} onClick={close}>
                        <SongRow song={song} under={under} favorite={isFavorite(song.slug)} />
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
