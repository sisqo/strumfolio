'use client'

/**
 * The comments of the song being read, and which of the three states the reader is in.
 *
 * Mounted beside `PrefsProvider` rather than inside it: a preference is a scalar that the
 * last write wins, a comment is a row in a list, and the two want different write paths —
 * see `lib/comments/store.ts` for why the preferences queue could not be reused.
 */

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { deleteComment, loadComments, saveComment } from '@/lib/comments/actions'
import { readNotesHidden, writeNotesHidden } from '@/lib/comments/notesVisibility'
import {
  type OutboxEntry,
  dequeue,
  enqueue,
  readComments,
  readOutbox,
  writeComments,
} from '@/lib/comments/store'
import {
  type CardPoint,
  type CommentAnchor,
  type NoteDraft,
  type OpenNotes,
  type SongComment,
  inReadingOrder,
  positionFor,
} from '@/lib/comments/types'

/**
 * Four states, and writing a note is two of them.
 *
 * It used to be three, with one `adding` covering both halves of putting a note down. That
 * is the flow this split exists to repair: a reader who armed it was left on a page that
 * looked exactly as before, with nothing anywhere saying a tap was expected or what it
 * would do. Naming the two halves is what lets each say its own thing — `waiting` can ask
 * for the tap, `composing` can show the note being written and what it ended up attached
 * to.
 *
 * Both arm every word and every chord on the page as a target, which is destructive of the
 * reading surface, so the control that turns them on has to look armed. `composing` stays
 * armed on purpose: picking a second word before saving is how a reader corrects a mis-tap,
 * and disarming would make that cost a cancel and a fresh start.
 *
 * `hidden` gives back exactly the line as it was written, badges and all removed, which is
 * the only state in which the sheet wraps the way it does with the feature switched off.
 */
export type CommentsMode = 'hidden' | 'visible' | 'waiting' | 'composing'

/**
 * The state as one value, so the two halves cannot drift apart.
 *
 * `composing` carries its own draft rather than sitting beside a nullable one: a mode
 * saying a note is being written while no note is being written is a state this way
 * cannot represent, and every surface reads the draft off the mode that guarantees it.
 */
type Session =
  | { kind: 'hidden' }
  | { kind: 'visible' }
  | { kind: 'waiting' }
  | { kind: 'composing'; draft: NoteDraft }

interface CommentsValue {
  comments: SongComment[]
  mode: CommentsMode
  /** Whether every word and chord is a target — `waiting` or `composing`, asked once here
   *  rather than compared against two strings everywhere it matters. */
  armed: boolean
  /** The note being written, non-null exactly while `mode` is `composing`. */
  draft: NoteDraft | null
  /** The two states that are a reader's *choice*; the other two are armed, not chosen. */
  show: (visible: boolean) => void
  /** Ask for a word or a chord. */
  arm: () => void
  /** A word or a chord was picked: this is the note's anchor. */
  place: (anchor: CommentAnchor, label: string, at: CardPoint) => void
  /** Back to reading, whichever half we were in. */
  cancel: () => void
  /** Write the draft down. Silently does nothing on an empty body or with no draft. */
  commit: (body: string) => void
  /**
   * The note just written, for the moment of confirmation that follows it — and it earns
   * its place by answering the one question the act itself cannot: a reader typing into a
   * panel on the right has no way to see the badge appear in the song, so this says which
   * number landed on which word. Cleared on a timer.
   */
  saved: { number: number; label: string } | null
  /** How many notes are waiting for a network, for the pending dot. */
  pending: number
  /**
   * The stack currently open for reading, held here rather than in either surface that
   * opens one: a badge on the sheet and a row in the panel open the same card, and two
   * copies of this state would let both be open at once.
   */
  open: OpenNotes | null
  setOpen: (subject: OpenNotes | null) => void
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
  const [session, setSession] = useState<Session>({ kind: 'visible' })
  const [saved, setSaved] = useState<{ number: number; label: string } | null>(null)
  const [pending, setPending] = useState(0)
  const [open, setOpen] = useState<OpenNotes | null>(null)

  /*
   * The reader's choice about the notes, re-applied on every mount — and this provider
   * mounts once per song, because `SongReader` wraps it in `<SongProvider key={song.slug}>`
   * to throw away the previous song's state. That remount was resetting the mode to
   * `visible` on every song, which is what made the choice feel like it did not take.
   *
   * `useLayoutEffect` rather than a `useState` initialiser, the same shape `PrefsProvider`
   * uses for the stored prefs: the server renders this too, so reading storage during the
   * first render would be a hydration mismatch — and running after paint instead would show
   * the notes for a frame before hiding them, on the screen where a clean page is the whole
   * point of asking.
   */
  useLayoutEffect(() => {
    if (readNotesHidden()) setSession({ kind: 'hidden' })
  }, [])

  /*
   * Only the two chosen states are written; the two armed ones are not a choice — see
   * `notesVisibility.ts`. Nothing restores a reader into an armed page, waiting for a tap
   * they meant to make yesterday.
   */
  const show = useCallback((visible: boolean) => {
    setSession({ kind: visible ? 'visible' : 'hidden' })
    writeNotesHidden(!visible)
  }, [])

  const arm = useCallback(() => setSession({ kind: 'waiting' }), [])

  const place = useCallback(
    (anchor: CommentAnchor, label: string, at: CardPoint) =>
      setSession({ kind: 'composing', draft: { anchor, label, at } }),
    [],
  )

  const cancel = useCallback(() => setSession({ kind: 'visible' }), [])

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
    setSaved(null)
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
    (anchor: CommentAnchor, anchorLabel: string, body: string): SongComment => {
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
      return comment
    },
    [queue, songSlug, store],
  )

  /*
   * Writes the draft down and says so.
   *
   * The number it reports is the one the *badge* will carry, read back out of
   * `inReadingOrder` rather than counted as "one more than there were" — the notes are
   * numbered by where they sit in the song, so a note added to the first verse of a song
   * that already has three takes number 1 and pushes the rest down. Announcing it as
   * number 4 would name a badge that does not exist.
   */
  const commit = useCallback(
    (body: string) => {
      if (session.kind !== 'composing') return
      const text = body.trim()
      if (text === '') return

      const { anchor, label } = session.draft
      const number = positionFor(ref.current, anchor)
      add(anchor, label, text)

      setSession({ kind: 'visible' })
      setSaved({ number, label })
    },
    [add, session],
  )

  /*
   * The confirmation clears itself, and the timer is keyed on the note it belongs to so a
   * second save restarts it rather than inheriting the first one's remaining time. Cleared
   * on unmount too, which here means moving to another song mid-flight.
   */
  useEffect(() => {
    if (saved === null) return
    const timer = setTimeout(() => setSaved(null), 3200)
    return () => clearTimeout(timer)
  }, [saved])

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
    () => ({
      comments: inReadingOrder(comments),
      mode: session.kind,
      armed: session.kind === 'waiting' || session.kind === 'composing',
      draft: session.kind === 'composing' ? session.draft : null,
      show,
      arm,
      place,
      cancel,
      commit,
      saved,
      pending,
      open,
      setOpen,
      add,
      edit,
      remove,
    }),
    [comments, session, show, arm, place, cancel, commit, saved, pending, open, add, edit, remove],
  )

  return <CommentsContext.Provider value={value}>{children}</CommentsContext.Provider>
}
