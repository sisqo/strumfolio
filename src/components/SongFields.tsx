'use client'

import type { Songbook, Section } from '@/lib/data/types'

export interface SongFieldValues {
  title: string
  artist: string
  songbookSlug: string
  /** The section's id as the select holds it: a string, empty when none is offered. */
  sectionId: string
}

/**
 * Everything about a song except its words.
 *
 * Shared by the import screen and the editor so the two cannot drift into asking
 * for the same things in different ways.
 *
 * There is no key here any more. It was the one field nobody could answer better than
 * the song itself: the chords say what key they are in, and the only thing the app did
 * with the answer was choose between sharps and flats — which it now works out when it
 * needs to, from the chords.
 */
export function SongFields({
  values,
  songbooks,
  sections,
  showSongbook = true,
  onChange,
}: {
  values: SongFieldValues
  songbooks: Songbook[]
  /** Every section of every songbook; the one on offer depends on the choice above. */
  sections: Section[]
  /**
   * False where the screen already asked. On import the destination is the first
   * thing chosen, for every song in the paste at once, and repeating it here would
   * be a second control for one decision — with no way to tell which one won.
   */
  showSongbook?: boolean
  onChange: <K extends keyof SongFieldValues>(field: K, value: SongFieldValues[K]) => void
}) {
  const divisions = sections
    .filter((section) => section.songbookSlug === values.songbookSlug)
    .sort((one, other) => one.position - other.position)

  /**
   * Changing the songbook changes the sections on offer, so the section moves with it —
   * to the first of the new one. Leaving the old id in place would send the song to a
   * section of a songbook it is no longer in, which the database refuses outright, and
   * the person would be told "could not save" about a menu they never touched.
   */
  const chooseSongbook = (slug: string) => {
    onChange('songbookSlug', slug)

    const first = sections
      .filter((section) => section.songbookSlug === slug)
      .sort((one, other) => one.position - other.position)[0]

    onChange('sectionId', first === undefined ? '' : String(first.id))
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="field-label">Title</span>
        <input
          value={values.title}
          onChange={(event) => onChange('title', event.target.value)}
          className="form-field"
        />
      </label>

      <label className="block">
        <span className="field-label">Artist</span>
        <input
          value={values.artist}
          onChange={(event) => onChange('artist', event.target.value)}
          className="form-field"
        />
      </label>

      {showSongbook && (
        <>
          <label className="block">
            <span className="field-label">Songbook</span>
            <select
              value={values.songbookSlug}
              onChange={(event) => chooseSongbook(event.target.value)}
              className="form-field"
            >
              {songbooks.map((songbook) => (
                <option key={songbook.slug} value={songbook.slug}>
                  {songbook.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="field-label">Section</span>
            <select
              value={values.sectionId}
              onChange={(event) => onChange('sectionId', event.target.value)}
              className="form-field"
              disabled={divisions.length === 0}
            >
              {divisions.map((section) => (
                <option key={section.id} value={String(section.id)}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

    </div>
  )
}
