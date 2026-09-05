import Link from 'next/link'

import { IconStar } from '@/components/icons'
import type { SongIndexRow } from '@/lib/search-index'

/**
 * One song, as a row that opens it.
 *
 * Shared by the two lists that show songs — the search results on the home page and a
 * songbook's own page — so a song looks the same wherever it is found. `under` is
 * what the search adds: found from anywhere, a row has to say where it lives.
 *
 * `index` is the other shape a caller can ask for: a song's place inside its own
 * section, which only means something there — search has no single order across
 * songbooks to number, so it never passes one. With an index the artist moves to
 * the row's far end instead of stacking under the title: the section a reader is
 * already inside of is the "where", so there is nothing left for a second line to say.
 *
 * `favorite` draws a star and nothing draws its absence. A row is a thing you open, not a
 * thing you star — the star is set on the song's own page, beside its title — so an
 * outline on every unstarred row would be a control that is not one, repeated down a list
 * of two hundred. It would also cost the row its shape: the whole row is one `<Link>`, and
 * a button cannot live inside an `<a>`.
 */
export function SongRow({
  song,
  index,
  under,
  favorite = false,
}: {
  song: SongIndexRow
  /** This song's 1-based place in its section's list. */
  index?: number
  /** A second line under the title, used by search results to say which songbook. */
  under?: string | null
  /** Whether this reader has starred it. False draws nothing at all. */
  favorite?: boolean
}) {
  /* Named once and used in both shapes below, so the two can never drift into drawing
     the star differently from each other. */
  const star = favorite ? (
    <span className="row-star">
      <IconStar size={14} filled />
      <span className="sr-only">Favorite</span>
    </span>
  ) : null

  if (index !== undefined) {
    return (
      <Link href={`/songs/${song.slug}`} className="row">
        <span className="row-index" aria-hidden>
          {index}
        </span>
        {/* Title and star in one box, so the star stays against the last letter of the
            title rather than being pushed to the far edge by the flex that makes the
            title take the room — where it would read as the artist's mark, not the
            song's. */}
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="min-w-0 truncate">{song.title}</span>
          {star}
        </span>
        {song.artist !== null && (
          <span className="flex-none truncate text-[0.9375rem] text-muted" style={{ maxWidth: '40%' }}>
            {song.artist}
          </span>
        )}
      </Link>
    )
  }

  const where = under ?? null

  return (
    <Link href={`/songs/${song.slug}`} className="row">
      <span className="min-w-0 flex-1">
        {/* The star rides on the title's own line rather than in a column of its own:
            with a second line under it, a column would leave the star floating between
            the two with nothing to sit against. */}
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate">{song.title}</span>
          {star}
        </span>
        {(song.artist !== null || where !== null) && (
          <span className="mt-0.5 block truncate text-[0.8125rem] text-muted">
            {song.artist}
            {song.artist !== null && where !== null && <span className="text-muted"> · </span>}
            {where !== null && <span className="text-muted">{where}</span>}
          </span>
        )}
      </span>
    </Link>
  )
}
