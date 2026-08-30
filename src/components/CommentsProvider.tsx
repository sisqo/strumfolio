'use client'

/**
 * The comments of the song being read, and which of the three states the reader is in.
 *
 * Mounted beside `PrefsProvider` rather than inside it: a preference is a scalar that the
 * last write wins, a comment is a row in a list, and the two want different write paths —
 * see `lib/comments/store.ts` for why the preferences queue could not be reused.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { deleteComment, loadComments, saveComment } from '@/lib/comments/actions'
import {
  type OutboxEntry,
  dequeue,
  enqueue,
  readComments,
  readOutbox,
  writeComments,
} from '@/lib/comments/store'
import { type CardSubject, type CommentAnchor, type SongComment, inReadingOrder } from '@/lib/comments/types'

/**
 * Three states, not two — and the third is not merely "selected".
 *
 * `adding` arms every word and every chord on the page as a target, which is destructive
 * of the reading surface, so the control that turns it on has to look armed. `hidden`
 * gives back exactly the line as it was written, badges and all removed, which is the
 * only state in which the sheet wraps the way it does with the feature switched off.
 */
export type CommentsMode = 'hidden' | 'visible' | 'adding'

interface CommentsValue {
  comments: SongComment[]
  mode: CommentsMode
  setMode: (mode: CommentsMode) => void
  /** How many notes are waiting for a network, for the pending dot. */
  pending: number
  /**
   * The card currently open, held here rather than in either surface that opens one: a
   * badge on the sheet and a row in the rail open the same card, and two copies of this
   * state would let both be open at once.
   */
  open: CardSubject | null
  setOpen: (subject: CardSubject | null) => void
  add: (anchor: CommentAnchor, anchorLabel: string, body: string) => void
  edit: (id: string, body: string) => void
  remove: (id: string) => void
}

const CommentsContext = createContext<CommentsValue | null>(null)

export function useComments(): CommentsValue {
  const value = useContext(CommentsContext)
  if (value === null) throw new Error('useComments must be used inside CommentsProvider')
  return value
}

/**
 * Sends one queued entry, and takes it out of the outbox only if the server is done with
 * it — which includes being *refused*. `no-destination` means nobody is signed in, so
 * there is nothing to sync to and retrying forever would be pointless; only `failed` is
 * worth keeping. The same three-way split `prefsQueue` makes, for the same reason.
 */
async function send(entry: OutboxEntry): Promise<boolean> {
  const result =
    entry.kind === 'save'
      ? await saveComment(entry.songSlug, entry.comment)
      : await deleteComment(entry.id)
  return result !== 'failed'
}

export function CommentsProvider({ songSlug, children }: { songSlug: string; children: React.ReactNode }) {
  const [comments, setComments] = useState<SongComment[]>([])
  const [mode, setMode] = useState<CommentsMode>('visible')
  const [pending, setPending] = useState(0)
  const [open, setOpen] = useState<CardSubject | null>(null)

  // Kept in lockstep with every write so two changes in one flush merge against each
  // other rather than both against what render last saw — the same trick `PrefsProvider`
  // uses its `songRef` for.
  const ref = useRef<SongComment[]>([])

  const store = useCallback(
    (next: SongComment[]) => {
      ref.current = next
      setComments(next)
      writeComments(songSlug, next)
    },
    [songSlug],
  )

  const drain = useCallback(async () => {
    const entries = readOutbox()
    setPending(entries.length)
    for (const entry of entries) {
      if (!(await send(entry))) break // still no network: keep the rest for later
      setPending(dequeue(entry).length)
    }
  }, [])

  const queue = useCallback(
    (entry: OutboxEntry) => {
      setPending(enqueue(entry).length)
      void drain()
    },
    [drain],
  )

  // The cache first, synchronously, so the notes are on the page before the network is
  // asked anything — and so they are there at all when there is no network to ask.
  useEffect(() => {
    const cached = readComments(songSlug)
    ref.current = cached
    setComments(cached)
    setPending(readOutbox().length)
    setOpen(null)
  }, [songSlug])

  useEffect(() => {
    let cancelled = false

    loadComments(songSlug)
      .then((stored) => {
        // Never overwrite what is still queued: the server's copy is by definition older
        // than a write that has not reached it yet.
        if (cancelled || stored === null || readOutbox().length > 0) return
        store(stored)
      })
      .catch(() => {
        // Offline or signed out: the cache already gave us something to read.
      })

    return () => {
      cancelled = true
    }
  }, [songSlug, store])

  useEffect(() => {
    void drain()
    const onOnline = () => void drain()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void drain()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [drain])

  const add = useCallback(
    (anchor: CommentAnchor, anchorLabel: string, body: string) => {
      const now = new Date().toISOString()
      const comment: SongComment = {
        // Minted here, not by the database: a note written with no signal needs an
        // identity before any server has seen it, because that is what the outbox
        // keys by.
        id: crypto.randomUUID(),
        anchor,
        anchorLabel,
        body,
        createdAt: now,
        updatedAt: now,
      }
      store([...ref.current, comment])
      queue({ kind: 'save', songSlug, comment })
    },
    [queue, songSlug, store],
  )

  const edit = useCallback(
    (id: string, body: string) => {
      const found = ref.current.find((comment) => comment.id === id)
      if (found === undefined) return
      const comment = { ...found, body, updatedAt: new Date().toISOString() }
      store(ref.current.map((existing) => (existing.id === id ? comment : existing)))
      queue({ kind: 'save', songSlug, comment })
    },
    [queue, songSlug, store],
  )

  const remove = useCallback(
    (id: string) => {
      store(ref.current.filter((comment) => comment.id !== id))
      queue({ kind: 'delete', songSlug, id })
    },
    [queue, songSlug, store],
  )

  const value = useMemo<CommentsValue>(
    () => ({ comments: inReadingOrder(comments), mode, setMode, pending, open, setOpen, add, edit, remove }),
    [comments, mode, pending, open, add, edit, remove],
  )

  return <CommentsContext.Provider value={value}>{children}</CommentsContext.Provider>
}
