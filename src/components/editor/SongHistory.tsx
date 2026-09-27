'use client'

import { useCallback, useEffect, useState } from 'react'

import { loadSongHistory, restoreSongRevision, type RevisionRow, type SongHistory as History } from '@/lib/revisions/actions'
import { useOnline } from '@/lib/useOnline'

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function author(row: Pick<RevisionRow, 'writtenBy' | 'tokenName'>): string {
  if (row.writtenBy === 'app') return 'by you'
  return row.tokenName === null ? 'by an AI assistant' : `by an AI assistant («${row.tokenName}»)`
}

/**
 * Under the editor: whether an AI wrote the current text, and the texts kept before AI edits
 * (`lib/revisions/`). Draws nothing for a song no AI has touched, which is every song until
 * somebody connects one.
 *
 * A restore reloads the page rather than patching the editor in place: the editor holds its
 * own document and draft, and a page built from the restored row is the only state nobody has
 * to reason about.
 */
export function SongHistory({ slug }: { slug: string }) {
  const online = useOnline()
  const [history, setHistory] = useState<History | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [confirming, setConfirming] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setHistory(await loadSongHistory(slug))
    } catch {
      setHistory(null)
    }
  }, [slug])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (history === null || (history.aiWrittenAt === null && history.revisions.length === 0)) return null

  const restore = async (id: number) => {
    setBusy(true)
    setError(null)
    try {
      const result = await restoreSongRevision(slug, id)
      if (result.ok) {
        window.location.reload()
        return
      }
      setError(
        result.reason === 'frozen'
          ? 'Your repertoire is over your plan’s limits: you can only delete until it fits again.'
          : 'This version could not be restored. Reload the page and try again.',
      )
    } catch {
      setError('This version could not be restored. Reload the page and try again.')
    }
    setBusy(false)
    setConfirming(null)
  }

  return (
    <section className="card mt-6 p-4" aria-labelledby="song-history-title">
      <h2 id="song-history-title" className="section-title mb-1">
        History
      </h2>
      <p className="mb-3 text-[0.8125rem] leading-[1.45] text-muted">
        {history.aiWrittenAt !== null
          ? `The current text was changed ${author({ writtenBy: 'ai', tokenName: history.aiTokenName })} on ${when(history.aiWrittenAt)}. `
          : ''}
        Before every change an AI assistant makes, the previous text is kept here. Restoring one keeps the current text
        too.
      </p>

      {error !== null && (
        <p className="notice notice-error mb-3" role="alert">
          {error}
        </p>
      )}

      <ul className="grid gap-2">
        {history.revisions.map((row) => (
          <li key={row.id} className="rounded-row border border-line-soft p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 text-sm">
                <span className="font-medium">{row.title}</span>
                <span className="text-muted">
                  {' '}
                  · written {author(row)}, {when(row.writtenAt)}
                </span>
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn btn-sm btn-quiet" onClick={() => setOpen(open === row.id ? null : row.id)}>
                  {open === row.id ? 'Hide' : 'Show'}
                </button>
                {confirming === row.id ? (
                  <>
                    <button type="button" className="btn btn-sm btn-primary" disabled={busy || !online} onClick={() => void restore(row.id)}>
                      Restore
                    </button>
                    <button type="button" className="btn btn-sm btn-quiet" onClick={() => setConfirming(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn-sm" disabled={busy || !online} onClick={() => setConfirming(row.id)}>
                    Restore…
                  </button>
                )}
              </div>
            </div>
            {open === row.id && (
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-row bg-nested p-2 font-mono text-xs">
                {row.body}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
