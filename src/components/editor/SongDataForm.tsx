'use client'

import { useEffect, useRef, useState } from 'react'

import { DraftInput } from '@/components/editor/DraftInput'
import { IconPlus } from '@/components/icons'
import type { Section, Songbook } from '@/lib/data/types'
import { type SongDocument, fromSource, toSource } from '@/lib/editor/document'
import {
  type DataRow,
  type MissingField,
  addSongField,
  isFieldName,
  readSongData,
  removeSongField,
  setSongField,
} from '@/lib/editor/songData'

/**
 * The two fields the form draws from the songs table rather than from the file.
 *
 * They are always on screen and never in the «add a field» menu: a column always holds a
 * value, so offering to add one would be offering something that is already there. They are
 * also filtered out of the group's own rows — a `{title:}` that somehow reached the body
 * would otherwise be editable in two places that disagree.
 */
const COLUMNS = new Set(['title', 'artist'])

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
  const fromBody = (rows: DataRow[]) => rows.filter((row) => !COLUMNS.has(row.name))

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
              key={row.block}
              row={row}
              onChange={(next) => write(setSongField(document, row.block, row.name, next))}
              onRemove={() => write(removeSongField(document, row.block))}
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
                    key={row.block}
                    row={row}
                    onChange={(next) => write(setSongField(document, row.block, row.name, next))}
                    onRemove={() => write(removeSongField(document, row.block))}
                  />
                ))}
              </div>
            ) : (
              <div className={`song-data-list ${group.mono ? '' : 'is-short'}`}>
                {group.rows.map((row) => (
                  <div className="song-data-repeat" key={row.block}>
                    <DraftInput
                      value={row.value}
                      onChange={(next) => write(setSongField(document, row.block, row.name, next))}
                      className={`form-field song-data-input ${row.mono ? 'is-mono' : ''}`}
                      aria-label={group.label}
                    />
                    <button
                      type="button"
                      className="song-data-drop"
                      aria-label={`Remove this ${group.label.toLowerCase()}`}
                      onClick={() => write(removeSongField(document, row.block))}
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
          {/* The sentence that explains these lives once, in the foot beside the button
              that writes them — printing it here too put it twice on one screen, a few
              dozen pixels apart, which reads as a mistake. */}
          <Heading title="Anything else" />
          <div className="song-data-list">
            {data.others.map((row) => (
              <div className="song-data-repeat" key={row.block}>
                <code className="song-data-other">{row.name}</code>
                <DraftInput
                  value={row.value}
                  onChange={(next) => write(setSongField(document, row.block, row.name, next))}
                  className="form-field song-data-input is-mono"
                  aria-label={row.name}
                />
                <button
                  type="button"
                  className="song-data-drop"
                  aria-label={`Remove ${row.name}`}
                  onClick={() => write(removeSongField(document, row.block))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <AddField
        missing={data.missing.filter((field) => !COLUMNS.has(field.name))}
        onAdd={(name) => {
          const added = addSongField(document, name)
          onSource(toSource(added.document))
        }}
      />
    </div>
  )
}

/**
 * The «Add a field» menu, and the footer it sits in.
 *
 * A field is on screen because its line exists, so this is how a line comes into being:
 * choosing an entry writes the directive empty and the field appears with the caret in it.
 * The menu holds the exact complement of what is drawn — `readSongData` computes it, so the
 * two cannot drift into offering something already there.
 *
 * **The last row takes a name nobody here knows**, which is what makes the sentence beside
 * the button true: until this existed, a private directive could only arrive by importing a
 * file, because the graphic editor had no way to write one. `isFieldName` refuses a
 * conditional and anything that is not a name, rather than correcting it — guessing what
 * somebody meant is how `{albm}` becomes a permanent row in «Anything else».
 */
function AddField({
  missing,
  onAdd,
}: {
  missing: MissingField[]
  onAdd: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const box = useRef<HTMLDivElement>(null)

  // A menu that stays open behind a click elsewhere is a menu somebody has to dismiss twice.
  useEffect(() => {
    if (!open) return

    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const choose = (name: string) => {
    onAdd(name)
    setOpen(false)
    setCustom('')
  }

  const addCustom = () => {
    if (isFieldName(custom)) choose(custom.trim())
  }

  const groups = [...new Set(missing.map((field) => field.group))]

  return (
    <div className="song-data-foot" ref={box}>
      <p className="song-data-note">
        A field this app has no name for keeps its own, and is handed back exactly as it
        arrived.
      </p>

      <div className="song-data-add-wrap">
        <button
          type="button"
          className="song-data-add"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((was) => !was)}
        >
          <IconPlus size={14} />
          Field
        </button>

        {open && (
          <div className="song-data-menu" role="menu">
            {groups.map((group) => (
              <div key={group}>
                <div className="chip-menu-head">
                  <span className="control-name-label">{group}</span>
                </div>
                {missing
                  .filter((field) => field.group === group)
                  .map((field) => (
                    <button
                      key={field.name}
                      type="button"
                      role="menuitem"
                      className="editor-field-option"
                      onClick={() => choose(field.name)}
                    >
                      <span>{field.label}</span>
                      <code className="editor-hint">{`{${field.name}}`}</code>
                    </button>
                  ))}
              </div>
            ))}

            <div className="song-data-custom">
              <label className="control-name-label" htmlFor="song-data-custom">
                Another field
              </label>
              <div className="song-data-held">
                <input
                  id="song-data-custom"
                  value={custom}
                  placeholder="directive name"
                  className="form-field song-data-input is-mono"
                  onChange={(event) => setCustom(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    addCustom()
                  }}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!isFieldName(custom)}
                  onClick={addCustom}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** How many of the three columns a row takes; one is the default and needs no class. */
function spanClass(span: DataRow['span']): string {
  if (span === 'full') return 'is-full'
  return span === 2 ? 'is-wide' : ''
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
    <label className="song-data-row">
      <span className="song-data-label">
        <span>{label}</span>
        <code>{name}</code>
      </span>
      <DraftInput
        value={value}
        onChange={onChange}
        className="form-field song-data-input"
      />
    </label>
  )
}

/**
 * A row whose value is one line of the file, with the way out beside it.
 *
 * The × removes the *line* — which is what takes the field off the form, since a field is
 * drawn because its line exists. Clearing the value does not: the row stays, empty, so a
 * value can be deleted and retyped without the field going out from under the caret. The
 * same two gestures the repeat rows have had all along, now on every field.
 */
function Field({
  row,
  onChange,
  onRemove,
}: {
  row: DataRow
  onChange: (next: string) => void
  onRemove: () => void
}) {
  return (
    <div className={`song-data-row ${spanClass(row.span)}`}>
      <label className="song-data-label" htmlFor={`field-${row.block}`}>
        <span>{row.label}</span>
        <code>{row.name}</code>
      </label>
      <div className="song-data-held">
        <DraftInput
          id={`field-${row.block}`}
          value={row.value}
          onChange={onChange}
          className={`form-field song-data-input ${row.mono ? 'is-mono' : ''}`}
        />
        <button
          type="button"
          className="song-data-drop"
          aria-label={`Remove ${row.label.toLowerCase()}`}
          onClick={onRemove}
        >
          ×
        </button>
      </div>
    </div>
  )
}
