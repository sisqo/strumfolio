'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useRole } from '@/components/RoleProvider'
import { IconTrash } from '@/components/icons'
import { deleteSong } from '@/lib/import/actions'
import { saveMessage } from '@/lib/import/types'
import { dropEdit } from '@/lib/library/store'
import { useOnline } from '@/lib/useOnline'

/**
 * The way to remove a song for good, beside `EditSongLink` at the foot of the reading
 * page — the only other place in the app a song could already be deleted from was the
 * editor, one page over, and a reader who only ever reads has no reason to open an editor
 * just to leave it again.
 *
 * Same two gates as `EditSongLink`, and for the same reasons: nothing for a role that may
 * not edit, and nothing offline — a deletion is a write like any other, and a button that
 * looked live and failed silently with no signal would be worse than no button.
 *
 * A tap arms a plain-language confirmation rather than deleting on the spot, the same
 * two-step `EditorScreen`'s own delete already uses — the one other place this exact
 * question gets asked, kept asking it the same way. Once it succeeds there is no song left
 * to stay on, so it leaves for `redirectTo` — the songbook this song came from, or `/` when
 * it had none — the same page the header's own way back already leads to.
 */
export function DeleteSongLink({ slug, redirectTo }: { slug: string; redirectTo: string }) {
  const { mayEdit } = useRole()
  const online = useOnline()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!mayEdit || !online) return null

  const remove = async () => {
    setBusy(true)
    const result = await deleteSong(slug)
    if (!result.ok) {
      setBusy(false)
      setError(saveMessage(result))
      return
    }

    // The edited/offline shadow this song may have left in localStorage would otherwise
    // outlive the row it was standing in for.
    dropEdit(slug)
    router.push(redirectTo)
  }

  if (confirming) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Delete this song?</span>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void remove()}>
          Delete
        </button>
        <button
          type="button"
          className="btn btn-quiet"
          disabled={busy}
          onClick={() => {
            setConfirming(false)
            setError(null)
          }}
        >
          Cancel
        </button>
        {error !== null && <span className="text-sm text-danger">{error}</span>}
      </span>
    )
  }

  return (
    <button type="button" className="btn btn-ink" onClick={() => setConfirming(true)}>
      <IconTrash size={16} />
      Delete
    </button>
  )
}
