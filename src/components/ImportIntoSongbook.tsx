'use client'

import Link from 'next/link'
import { useState } from 'react'

import { ImportBatch } from '@/components/ImportBatch'
import { useSongbooks } from '@/components/SongbookProvider'
import { SongForm } from '@/components/SongForm'
import { IconInfo, IconOffline, IconPlus } from '@/components/icons'
import { writeMessage } from '@/lib/songbooks/types'
import { saveSong } from '@/lib/import/actions'
import { type PreparedSong, prepareSongs } from '@/lib/import/prepare'

const FORMAT_LABEL: Record<string, string> = {
  chordpro: 'recognized as ChordPro, passed through as is',
  'chords-above': 'chords above lyrics, converted',
  'lyrics-only': 'no chords found: lyrics only',
}

/**
 * Importing, from inside the songbook it lands in.
 *
 * This used to be a screen of its own, reached from the hamburger menu, where the
 * first question was *which* songbook — because it could have been any of them. Here
 * there is exactly one in scope: the page this mode is a mode of. So the step that
 * used to be first is gone outright, not just pre-filled, and what is left is two
 * steps instead of three: which section, then the text.
 *
 * Making a songbook that does not exist yet is no longer something this screen can
 * do — that now happens on the home screen, before ever getting here. One extra trip
 * for the rare case of a brand new songbook, in exchange for a mode that never has to
 * ask a question the page around it has already answered.
 *
 * The analysis is a guess and stays visible before anything is written, exactly as it
 * did on the old screen: one song gets the full form with a live preview, several get
 * a row each, and neither saves until it is asked to.
 */
export function ImportIntoSongbook({
  songbookSlug,
  songbookName,
  onDone,
  onImported,
}: {
  songbookSlug: string
  songbookName: string
  /** Back to the song list. */
  onDone: () => void
  /** A song was saved: the caller's own list of this songbook's songs is now stale. */
  onImported: () => Promise<void>
}) {
  const { songbooks, online, divisionsOf, addSection, refresh } = useSongbooks()

  /** The section chosen inside it, as the select holds it. */
  const [into, setInto] = useState('')
  /**
   * Whether the reader has actually touched the select above, rather than it
   * still sitting at whatever it opened on.
   *
   * A single pasted song can name its own section with `{division: ...}` —
   * see `single.declaresSection` below — and that name deserves the same
   * standing an explicit `{division:}` gets in a multi-song paste (`ImportBatch`'s
   * own comment on `resolveSection`): used, and created if this songbook
   * doesn't have it, but only for as long as nothing else has been chosen.
   * The moment the reader picks (or makes) a section themselves, that pick is
   * a decision and always wins — never silently overridden by what the text
   * says, which is the same guarantee `PLAN.md` documents for a re-imported
   * export.
   */
  const [sectionTouched, setSectionTouched] = useState(false)
  const [namingSection, setNamingSection] = useState(false)
  const [newSection, setNewSection] = useState('')

  const [pasted, setPasted] = useState('')
  const [prepared, setPrepared] = useState<PreparedSong[] | null>(null)

  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /*
   * The section, checked against the ones this songbook actually has.
   *
   * A songbook can gain or lose sections while this screen sits open — another
   * device, or the quick-create just below — so the value the select holds is
   * resolved at render rather than trusted from state. Falling back to the first
   * section means the answer is always somewhere real, never a stale id the
   * database would refuse.
   */
  const divisions = divisionsOf(songbookSlug)
  const chosenSection = divisions.some((section) => String(section.id) === into)
    ? divisions.find((section) => String(section.id) === into)
    : divisions[0]

  /**
   * A section made here, for this paste.
   *
   * Pasting the running order of an evening *is* making a section, so it can be made
   * without leaving the screen. A name that is already taken is not an error here:
   * the action answers with that section, and the songs join it.
   */
  const addDivision = async () => {
    setError(null)
    const result = await addSection(songbookSlug, newSection)

    if (!result.ok) {
      setError(writeMessage(result))
      return
    }

    setInto(String(result.id))
    setSectionTouched(true)
    setNewSection('')
    setNamingSection(false)
  }

  const analyse = () => {
    const found = prepareSongs(pasted)
    setError(null)

    if (found.length === 0) {
      setNotice('No songs found in this text.')
      return
    }

    setNotice(null)
    setPrepared(found)
  }

  const startOver = () => {
    setPrepared(null)
    setPasted('')
  }

  const single = prepared !== null && prepared.length === 1 ? prepared[0] : null

  /** See `sectionTouched`'s own comment: the file's own section, only for as long as nothing else has been chosen. */
  const declaredSection =
    !sectionTouched && single !== null && single.declaresSection !== null ? single.declaresSection : null

  return (
    <div>
      {!online && (
        <p className="notice notice-accent mb-4">
          <IconOffline />
          Without a connection you can&apos;t import: saving requires the database.
        </p>
      )}

      {error !== null && (
        <p className="notice notice-error mb-4" role="alert">
          {error}
        </p>
      )}

      {notice !== null && (
        <p className="notice mb-4" role="status">
          <IconInfo />
          {notice}
        </p>
      )}

      <div className="card p-4 sm:p-5">
        <label className="block">
          <span className="field-label">1. Which section</span>
          <select
            value={chosenSection === undefined ? '' : String(chosenSection.id)}
            onChange={(event) => {
              setInto(event.target.value)
              setSectionTouched(true)
            }}
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

        {namingSection ? (
          <form
            className="mt-2 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void addDivision()
            }}
          >
            <label className="min-w-[12rem] flex-1">
              <span className="sr-only">Name of the new section</span>
              <input
                value={newSection}
                onChange={(event) => setNewSection(event.target.value)}
                placeholder="Name of the new section"
                autoFocus
                className="form-field"
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={!online || newSection.trim() === ''}
            >
              Create
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => {
                setNamingSection(false)
                setNewSection('')
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="btn btn-quiet btn-sm mt-2"
            disabled={!online}
            onClick={() => setNamingSection(true)}
          >
            <IconPlus size={15} />
            New section
          </button>
        )}
      </div>

      {prepared === null && (
        /* The one card on the screen you have come here to use, so it is the one lifted. */
        <div className="card card-lead mt-3 p-4 sm:p-5">
          <label className="block">
            <span className="field-label">2. Paste the songs</span>

            {/*
              * Above the box rather than under it: it says what will happen to what
              * you paste, which is worth knowing before pasting rather than after.
              */}
            <span className="mb-2.5 block text-sm leading-[1.45] text-muted">
              If it has chords in square brackets it&apos;s already ChordPro; otherwise conversion
              from chords-above-lyrics is attempted. Multiple songs at once: separate them with a
              line of <code>---</code>, or paste a ChordPro export — its{' '}
              <code>{'{title}'}</code> lines are enough.{' '}
              <Link
                href="/help/chordpro"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                Full formatting guide
              </Link>
              .
            </span>

            <textarea
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              rows={14}
              spellCheck={false}
              placeholder={'Amazing Grace\nTraditional (John Newton, 1779)\n\nG                  C\nAmazing grace, how sweet the sound\n\n---\n\nAuld Lang Syne\nRobert Burns (1788), traditional Scottish air'}
              className="form-field font-mono text-sm"
            />
          </label>

          <button
            type="button"
            className="btn btn-primary mt-3.5"
            disabled={!online || pasted.trim() === ''}
            onClick={analyse}
          >
            Analyze
          </button>
        </div>
      )}

      {single !== null && (
        <div className="card mt-3 p-4 sm:p-5">
          <p className="mb-4 text-xs text-muted">
            {FORMAT_LABEL[single.format] ?? single.format} · goes into {songbookName}
            {declaredSection !== null ? (
              <> · will use its own section «{declaredSection}»</>
            ) : (
              chosenSection !== undefined && ` · ${chosenSection.name}`
            )}
            {single.declares !== null && single.declares !== songbookName && (
              <> · the text says «{single.declares}»</>
            )}
            {' · '}
            <button type="button" className="underline underline-offset-2" onClick={startOver}>
              paste another song
            </button>
          </p>

          <SongForm
            initial={{
              title: single.title,
              artist: single.artist,
              tags: single.tags,
              link1: single.link1,
              link2: single.link2,
              link3: single.link3,
              songbookSlug,
              sectionId: chosenSection === undefined ? '' : String(chosenSection.id),
              body: single.body,
            }}
            songbooks={songbooks}
            sections={divisions}
            showSongbook={false}
            onSave={async (input, decision) => {
              // The select above is the answer, even if it changed after the
              // analysis — unless the text named its own section and nothing
              // has overridden that yet; see `declaredSection`.
              const result = await saveSong(
                {
                  ...input,
                  songbookSlug,
                  sectionId: declaredSection !== null ? null : (chosenSection?.id ?? null),
                  sectionName: declaredSection,
                },
                decision,
              )
              if (result.ok) {
                startOver()
                setNotice('Saved. Publish from the home screen to have it available offline too.')
                await Promise.all([refresh(), onImported()])
              }
              return result
            }}
          />
        </div>
      )}

      {prepared !== null && prepared.length > 1 && (
        <div className="mt-3">
          <ImportBatch
            songs={prepared}
            songbookSlug={songbookSlug}
            songbookName={songbookName}
            sectionId={chosenSection?.id ?? null}
            sectionName={chosenSection?.name ?? null}
            online={online}
            onDone={async () => {
              await Promise.all([refresh(), onImported()])
            }}
            onReset={startOver}
          />
        </div>
      )}

      {/*
        * Same family as `ArrangeSongbook`'s own way out: a plain button back to the
        * list, not tied to whether anything above is mid-edit.
        */}
      <div className="mt-4">
        <button type="button" className="btn btn-sm" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  )
}
