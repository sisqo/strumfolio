'use client'

import { IconPlus } from '@/components/icons'
import type { Section, Songbook } from '@/lib/data/types'
import { type SongDocument, fromSource, toSource } from '@/lib/editor/document'
import {
  type DataRow,
  addSongField,
  readSongData,
  removeSongField,
  setSongField,
} from '@/lib/editor/songData'

/**
 * Everything about a song except its words, as a form.
 *
 * The head of a ChordPro file used to be drawn line by line above the song, so a musician
 * opening a well-described file scrolled past thirteen chips to reach the first verse. Here
 * it is a form instead, grouped by what each field means.
 *
 * **Every row points at the block it came from and edits that line in place.** Nothing here
 * rebuilds the head or reorders it, which is what keeps an untouched file byte-identical and
 * a reader's notes on the lines they were left on — `songData.ts` carries the argument, and
 * `songData.test.ts` asserts it directly: one field, one line.
 *
 * **Songbook and section are the exception and look like it.** They are columns rather than
 * directives, so they are the only two rows with no directive name printed beside the label
 * — the form saying, in the one place it can, that those two are not in the file.
 *
 * Not `SongFields`, which this leaves alone: that one is shared with the import screen,
 * deliberately, so the two cannot drift into asking for the same things in different ways.
 * The import screen has no body to read directives out of yet, so it keeps the small form
 * and this one belongs to the editor.
 */
export function SongDataForm({
  source,
  title,
  artist,
  songbookSlug,
  sectionId,
  songbooks,
  sections,
  onSource,
  onColumn,
}: {
  source: string
  title: string
  artist: string
  songbookSlug: string
  sectionId: string
  songbooks: Songbook[]
  sections: Section[]
  onSource: (next: string) => void
  onColumn: (field: 'title' | 'artist' | 'songbookSlug' | 'sectionId', value: string) => void
}) {
  const document = fromSource(source)
  const data = readSongData(document)
  const write = (next: SongDocument) => onSource(toSource(next))

  const divisions = sections
    .filter((section) => section.songbookSlug === songbookSlug)
    .sort((one, other) => one.position - other.position)

  /**
   * Changing the songbook changes the sections on offer, so the section moves with it — the
   * same rule `SongFields` states: an id left pointing into another songbook is refused by
   * the database, and the person is told "could not save" about a menu they never touched.
   */
  const chooseSongbook = (slug: string) => {
    onColumn('songbookSlug', slug)

    const first = sections
      .filter((section) => section.songbookSlug === slug)
      .sort((one, other) => one.position - other.position)[0]

    onColumn('sectionId', first === undefined ? '' : String(first.id))
  }

  /*
   * `title` and `artist` are columns here and directives in the file, and the column is the
   * one in force: the importer consumes both and strips the lines, and the export writes
   * them back from the row. So these two rows edit the column and leave the body alone —
   * which is why they are pulled out of the group rather than read off a block.
   */
  const identity = data.groups.find((group) => group.title === 'Identity')
  const fromBody = (rows: DataRow[]) => rows.filter((row) => row.name !== 'title' && row.name !== 'artist')

  return (
    <div className="song-data">
      <Heading title="Where it lives" />
      <div className="song-data-grid">
        <label className="song-data-row">
          <span className="song-data-label">
            <span>Songbook</span>
          </span>
          <select
            value={songbookSlug}
            onChange={(event) => chooseSongbook(event.target.value)}
            className="form-field song-data-input"
          >
            {songbooks.map((songbook) => (
              <option key={songbook.slug} value={songbook.slug}>
                {songbook.name}
              </option>
            ))}
          </select>
        </label>

        <label className="song-data-row">
          <span className="song-data-label">
            <span>Section</span>
          </span>
          <select
            value={sectionId}
            onChange={(event) => onColumn('sectionId', event.target.value)}
            className="form-field song-data-input"
            disabled={divisions.length === 0}
          >
            {divisions.map((section) => (
              <option key={section.id} value={String(section.id)}>
                {section.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Heading title="Identity" />
      <div className="song-data-grid">
        <Column label="Title" name="title" value={title} onChange={(next) => onColumn('title', next)} />
        <Column label="Artist" name="artist" value={artist} onChange={(next) => onColumn('artist', next)} />
        {identity !== undefined &&
          fromBody(identity.rows).map((row) => (
            <Field
              key={row.name}
              row={row}
              onChange={(next) => write(setSongField(document, row.block, row.name, next))}
            />
          ))}
      </div>

      {data.groups
        .filter((group) => group.title !== 'Identity')
        .map((group) => (
          <div key={group.title}>
            <Heading title={group.title} />

            {group.kind === 'single' ? (
              <div className="song-data-grid">
                {group.rows.map((row) => (
                  <Field
                    key={row.name}
                    row={row}
                    onChange={(next) => write(setSongField(document, row.block, row.name, next))}
                  />
                ))}
              </div>
            ) : (
              <div className="song-data-list">
                {group.rows.map((row) => (
                  <div className="song-data-repeat" key={row.block ?? -1}>
                    <input
                      value={row.value}
                      onChange={(event) =>
                        write(setSongField(document, row.block, row.name, event.target.value))
                      }
                      className={`form-field song-data-input ${row.mono ? 'is-mono' : ''}`}
                      aria-label={group.label}
                    />
                    <button
                      type="button"
                      className="song-data-drop"
                      aria-label={`Remove this ${group.label.toLowerCase()}`}
                      onClick={() => row.block !== null && write(removeSongField(document, row.block))}
                    >
                      ×
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className="song-data-add"
                  onClick={() => write(addSongField(document, group.name).document)}
                >
                  <IconPlus size={14} />
                  {`Add ${group.label.toLowerCase()}`}
                </button>
              </div>
            )}
          </div>
        ))}

      {data.others.length > 0 && (
        <>
          <Heading title="Anything else" />
          <p className="song-data-note">
            A field this app has no name for keeps its own, and is handed back exactly as it
            arrived.
          </p>
          <div className="song-data-list">
            {data.others.map((row) => (
              <div className="song-data-repeat" key={row.block ?? -1}>
                <code className="song-data-other">{row.name}</code>
                <input
                  value={row.value}
                  onChange={(event) =>
                    write(setSongField(document, row.block, row.name, event.target.value))
                  }
                  className="form-field song-data-input is-mono"
                  aria-label={row.name}
                />
                <button
                  type="button"
                  className="song-data-drop"
                  aria-label={`Remove ${row.name}`}
                  onClick={() => row.block !== null && write(removeSongField(document, row.block))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Heading({ title }: { title: string }) {
  return (
    <div className="song-data-heading">
      <span>{title}</span>
      <span aria-hidden="true" className="song-data-rule" />
    </div>
  )
}

/** A row whose value is a column of the songs table, not a line of the file. */
function Column({
  label,
  name,
  value,
  onChange,
}: {
  label: string
  name: string
  value: string
  onChange: (next: string) => void
}) {
  return (
    <label className="song-data-row is-wide">
      <span className="song-data-label">
        <span>{label}</span>
        <code>{name}</code>
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="form-field song-data-input"
      />
    </label>
  )
}

/** A row whose value is one line of the file. */
function Field({ row, onChange }: { row: DataRow; onChange: (next: string) => void }) {
  return (
    <label className={`song-data-row ${row.wide ? 'is-wide' : ''}`}>
      <span className="song-data-label">
        <span>{row.label}</span>
        <code>{row.name}</code>
      </span>
      <input
        value={row.value}
        onChange={(event) => onChange(event.target.value)}
        className={`form-field song-data-input ${row.mono ? 'is-mono' : ''}`}
      />
    </label>
  )
}
