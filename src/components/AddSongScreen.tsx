'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

import { ImportBatch } from '@/components/ImportBatch'
import { PlanUpgradeModal, type PlanNotice } from '@/components/PlanUpgradeModal'
import { useRole } from '@/components/RoleProvider'
import { useSongbooks } from '@/components/SongbookProvider'
import { SongForm } from '@/components/SongForm'
import {
  IconClipboard,
  IconImport,
  IconInfo,
  IconOffline,
  IconPencil,
  IconPlus,
} from '@/components/icons'
import { createSong, saveSong } from '@/lib/import/actions'
import { type PreparedSong, prepareSongs } from '@/lib/import/prepare'
import { saveMessage, type SaveRefusal } from '@/lib/import/types'
import { LIMIT_MESSAGE, type LimitReason } from '@/lib/plans/types'
import { writeMessage } from '@/lib/songbooks/types'

type Mode = 'write' | 'paste' | 'import'

const MODES: { key: Mode; label: string; icon: typeof IconPencil }[] = [
  { key: 'write', label: 'Write it yourself', icon: IconPencil },
  { key: 'paste', label: 'Paste', icon: IconClipboard },
  { key: 'import', label: 'Import a file', icon: IconImport },
]

const FORMAT_LABEL: Record<string, string> = {
  chordpro: 'recognized as ChordPro, passed through as is',
  'chords-above': 'chords above lyrics, converted',
  'lyrics-only': 'no chords found: lyrics only',
}

const FILE_TYPES = /\.(txt|cho|chordpro)$/i

/**
 * The one door into a songbook's repertoire, replacing what used to be two: a
 * "New song" shortcut for a blank title and an "Add song" screen for pasting.
 * The three tabs below are those two ideas plus the one this screen adds — reading
 * a file straight off disk — sharing one destination (which section) because a
 * song only ever needs to answer that question once, whichever way its words
 * arrive.
 *
 * Write has nothing to analyse, so it saves the moment "Create" is pressed and
 * leaves for the editor. Paste and Import both feed the same text into
 * `prepareSongs`, so from the moment the text is read the two are the same
 * screen — one or many songs, shown before anything is written, exactly as the
 * paste-only version of this screen already did.
 */
export function AddSongScreen({
  songbookSlug,
  songbookName,
}: {
  songbookSlug: string
  songbookName: string
}) {
  const router = useRouter()
  const { songbooks, online, divisionsOf, addSection, refresh } = useSongbooks()
  const { mayEdit, known } = useRole()

  const [mode, setMode] = useState<Mode>('write')

  /** Shared by all three tabs: a song only ever answers "which section" once. */
  const [into, setInto] = useState('')
  const [sectionTouched, setSectionTouched] = useState(false)
  const [namingSection, setNamingSection] = useState(false)
  const [newSection, setNewSection] = useState('')

  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [pasted, setPasted] = useState('')
  const [prepared, setPrepared] = useState<PreparedSong[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const [planNotice, setPlanNotice] = useState<PlanNotice | null>(null)

  const divisions = divisionsOf(songbookSlug)
  const chosenSection = divisions.some((section) => String(section.id) === into)
    ? divisions.find((section) => String(section.id) === into)
    : divisions[0]

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

  const analyse = (text: string) => {
    const found = prepareSongs(text)
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
    setFileError(null)
  }

  const readFile = async (file: File) => {
    setFileError(null)

    if (!FILE_TYPES.test(file.name)) {
      setFileError('That doesn’t look like a .txt, .cho or .chordpro file.')
      return
    }

    try {
      const text = await file.text()
      if (text.trim() === '') {
        setFileError('That file is empty.')
        return
      }
      setPasted(text)
      analyse(text)
    } catch {
      setFileError('Could not read that file.')
    }
  }

  if (!mayEdit) {
    // Nothing said until the role is known — see `EditSongLink`'s own comment on
    // why a beat of "not yet decided" must not read as a refusal.
    if (!known) return null

    return (
      <>
        <h1 className="screen-title mt-3.5">Add song</h1>
        <p className="notice notice-accent mt-4" role="status">
          <IconInfo />
          Only this account&apos;s owner, or a global owner, can add songs here.
        </p>
      </>
    )
  }

  const single = prepared !== null && prepared.length === 1 ? prepared[0] : null
  const declaredSection =
    !sectionTouched && single !== null && single.declaresSection !== null ? single.declaresSection : null

  return (
    <>
      <h1 className="screen-title mt-3.5">Add song</h1>
      <p className="screen-subtitle mt-2.5">Into {songbookName}</p>

      {!online && (
        <p className="notice notice-accent mt-4">
          <IconOffline />
          Without a connection you can&apos;t add a song: saving requires the database.
        </p>
      )}

      {prepared === null && (
        <div className="mode-switch mt-5">
          {MODES.map(({ key, label, icon: TabIcon }) => (
            <button
              key={key}
              type="button"
              className={mode === key ? 'mode-tab is-active' : 'mode-tab'}
              onClick={() => setMode(key)}
            >
              <TabIcon size={15} />
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="card mt-3.5 p-4 sm:p-5">
        {prepared === null && (
          <>
            <label className="block">
              <span className="field-label">Section</span>
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

            <div className="control-divider" />
          </>
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

        {mode === 'write' && prepared === null && (
          <div>
            <label className="block">
              <span className="field-label">Title</span>
              <input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Song title"
                className="form-field"
              />
            </label>
            <p className="mt-2.5 text-sm leading-[1.45] text-muted">
              The song opens straight in the editor, empty and ready for chords and lyrics.
            </p>
            <button
              type="button"
              className="btn btn-primary mt-3.5"
              disabled={!online || creating || title.trim() === ''}
              onClick={async () => {
                setCreating(true)
                setCreateError(null)
                try {
                  const result = await createSong(
                    title,
                    songbookSlug,
                    chosenSection === undefined ? null : chosenSection.id,
                  )
                  if (!result.ok) {
                    if (Object.hasOwn(LIMIT_MESSAGE, result.reason)) {
                      // Guarded by `createSong` never returning `duplicate` — same reasoning
                      // as `SongbookSongs`' own cast, before this screen replaced it.
                      const refusal = result as SaveRefusal
                      setPlanNotice({ reason: refusal.reason as LimitReason, limit: refusal.limit })
                    } else {
                      setCreateError(saveMessage(result))
                    }
                    return
                  }
                  router.push(`/songs/${result.song.slug}/edit`)
                } catch {
                  setCreateError(saveMessage({ reason: 'failed' }))
                } finally {
                  setCreating(false)
                }
              }}
            >
              Create and open editor
            </button>
            {createError !== null && (
              <p className="notice notice-error mt-3" role="alert">
                {createError}
              </p>
            )}
          </div>
        )}

        {mode === 'paste' && prepared === null && (
          <div>
            <label className="block">
              <span className="field-label">Paste the songs</span>
              <span className="mb-2.5 block text-sm leading-[1.45] text-muted">
                If it has chords in square brackets it&apos;s already ChordPro; otherwise
                conversion from chords-above-lyrics is attempted. Multiple songs at once:
                separate them with a line of <code>---</code>, or paste a ChordPro export
                &mdash; its <code>{'{title}'}</code> lines are enough.{' '}
                <a href="/help/chordpro" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  Full formatting guide
                </a>
                .
              </span>
              <textarea
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                rows={12}
                spellCheck={false}
                placeholder={'Never Lose The Chord\nThe Strumfolio Sessions\n\n[C]I used to juggle tabs, a hundred open tabs\n[G]Banner ads and popups, [Am]losing where I was\n\n---\n\nDanny Boy\nTraditional Irish air, lyrics by Frederick Weatherly (1913)'}
                className="form-field font-mono text-sm"
              />
            </label>
            <button
              type="button"
              className="btn btn-primary mt-3.5"
              disabled={!online || pasted.trim() === ''}
              onClick={() => analyse(pasted)}
            >
              Analyze
            </button>
          </div>
        )}

        {mode === 'import' && prepared === null && (
          <div>
            <span className="field-label">Choose a file</span>
            <p className="mb-2.5 text-sm leading-[1.45] text-muted">
              A <code>.txt</code> with chords above the lyrics, or a <code>.cho</code> ChordPro
              export &mdash; several songs in one file are read as several songs.
            </p>
            <label
              className={dragOver ? 'drop-zone is-over' : 'drop-zone'}
              onDragOver={(event) => {
                event.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragOver(false)
                const file = event.dataTransfer.files[0]
                if (file !== undefined) void readFile(file)
              }}
            >
              <span className="drop-zone-icon">
                <IconImport size={21} />
              </span>
              <span className="text-sm font-medium">Drop a file here, or browse</span>
              <span className="text-xs text-muted">.txt, .cho, .chordpro</span>
              <input
                ref={fileInput}
                type="file"
                accept=".txt,.cho,.chordpro"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file !== undefined) void readFile(file)
                  event.target.value = ''
                }}
              />
            </label>
            {fileError !== null && (
              <p className="notice notice-error mt-3" role="alert">
                {fileError}
              </p>
            )}
          </div>
        )}

        {single !== null && (
          <div>
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
                start over
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
                  await Promise.all([refresh(), router.refresh()])
                }
                return result
              }}
            />
          </div>
        )}
      </div>

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
              await Promise.all([refresh(), router.refresh()])
            }}
            onReset={startOver}
          />
        </div>
      )}

      {planNotice !== null && <PlanUpgradeModal notice={planNotice} onClose={() => setPlanNotice(null)} />}
    </>
  )
}
