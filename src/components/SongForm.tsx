'use client'

import { useMemo, useState } from 'react'

import { PlanUpgradeModal, type PlanNotice } from '@/components/PlanUpgradeModal'
import { SongFields, type SongFieldValues } from '@/components/SongFields'
import { SongSheet } from '@/components/SongSheet'
import { IconTrash } from '@/components/icons'
import { parseChordPro } from '@/lib/chordpro'
import type { Songbook, Section } from '@/lib/data/types'
import { saveMessage, type Decision, type DuplicateOf, type SaveRefusal, type SaveResult, type SongInput } from '@/lib/import/types'
import { LIMIT_MESSAGE, type LimitReason } from '@/lib/plans/types'

export interface FormValues extends SongFieldValues {
  body: string
}

/**
 * The fields and the preview, shared by import and editing.
 *
 * The body stays editable next to a live preview because the conversion from
 * chords-above-lyrics is a heuristic: when it gets a line wrong, the way out has
 * to be visible rather than requiring a re-paste.
 */
export function SongForm({
  initial,
  songbooks,
  sections,
  showSongbook = true,
  slug,
  onSave,
  onDelete,
}: {
  initial: FormValues
  songbooks: Songbook[]
  sections: Section[]
  /** False when the screen around this form already asked which songbook. */
  showSongbook?: boolean
  /** Set when editing an existing song. */
  slug?: string
  onSave: (input: SongInput, decision?: Decision) => Promise<SaveResult>
  onDelete?: () => Promise<void>
}) {
  const [values, setValues] = useState<FormValues>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<DuplicateOf | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  /** A plan refusal (the song cap, or a frozen repertoire) gets the same dialog
      `SongbookSongs`' own "Create" button already opens — a bare inline sentence with no
      link to `/pricing` was the one thing this path did differently for the identical
      refusal `saveSong` can return either way. */
  const [planNotice, setPlanNotice] = useState<PlanNotice | null>(null)

  const parsed = useMemo(() => parseChordPro(values.body), [values.body])

  const set = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }))
    setDuplicate(null)
  }

  const input = (): SongInput => ({
    slug,
    title: values.title,
    artist: values.artist,
    tags: values.tags.split(',').map((tag) => tag.trim()).filter((tag) => tag !== ''),
    link1: values.link1,
    link2: values.link2,
    link3: values.link3,
    songbookSlug: values.songbookSlug,
    // An empty menu — a songbook with no sections at all — leaves the answer to the
    // server, which files the song in the first one it can and creates it if it must.
    sectionId: values.sectionId === '' ? null : Number(values.sectionId),
    body: values.body,
  })

  const save = async (decision?: Decision) => {
    setBusy(true)
    setError(null)
    try {
      const result = await onSave(input(), decision)
      if (result.ok) {
        setDuplicate(null)
        return
      }
      if (result.reason === 'duplicate') {
        setDuplicate(result.existing)
        return
      }
      if (Object.hasOwn(LIMIT_MESSAGE, result.reason)) {
        // Guarded by the membership check above, same reasoning as `SongbookSongs`' own
        // cast: `duplicate` is not a key of `LIMIT_MESSAGE`, so `result` here is always the
        // `SaveRefusal` branch of the union.
        const refusal = result as SaveRefusal
        setPlanNotice({ reason: refusal.reason as LimitReason, limit: refusal.limit })
        return
      }
      setError(saveMessage(result))
    } catch {
      setError(saveMessage({ reason: 'failed' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {error !== null && (
        <p className="notice notice-error mb-4" role="alert">
          {error}
        </p>
      )}

      <SongFields
        values={values}
        songbooks={songbooks}
        sections={sections}
        showSongbook={showSongbook}
        onChange={set}
      />

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <label className="block">
          <span className="field-label">ChordPro body</span>
          <textarea
            value={values.body}
            onChange={(event) => set('body', event.target.value)}
            rows={16}
            spellCheck={false}
            className="form-field font-mono text-sm"
          />
        </label>

        <div>
          <span className="field-label">Preview</span>
          <div className="card max-h-[26rem] overflow-auto p-3">
            <SongSheet song={parsed} />
          </div>
        </div>
      </div>

      {duplicate !== null && (
        <div className="notice-accent mt-4 rounded-[var(--r-lg)] p-4 text-sm" role="alert">
          <p>
            &quot;{duplicate.title}&quot; already exists
            {duplicate.artist !== null && ` by ${duplicate.artist}`}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => void save('replace')}
            >
              Replace
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => void save('add')}
            >
              Add anyway
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDuplicate(null)}>
              Cancel
            </button>
          </div>
          <p className="mt-3 text-xs">
            Replacing keeps the slug, so the transposition and speed you&apos;d saved for that
            song stay.
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: 'var(--surface-2)' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || values.title.trim() === '' || values.body.trim() === ''}
          onClick={() => void save()}
        >
          {slug === undefined ? 'Save song' : 'Save changes'}
        </button>

        {onDelete !== undefined && (
          <>
            <span className="flex-1" />
            {confirmDelete ? (
              <>
                <span className="text-sm text-muted">Delete this song?</span>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    await onDelete()
                    setBusy(false)
                  }}
                >
                  Delete
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-quiet" onClick={() => setConfirmDelete(true)}>
                <IconTrash size={16} />
                Delete
              </button>
            )}
          </>
        )}
      </div>

      {planNotice !== null && <PlanUpgradeModal notice={planNotice} onClose={() => setPlanNotice(null)} />}
    </div>
  )
}
