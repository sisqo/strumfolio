/**
 * Local read cache for anchored comments, and the outbox's own backing store.
 *
 * Two jobs, one file, because they share a serialization and a storage key prefix and
 * splitting them would mean keeping those in step by hand.
 *
 * Server actions are POSTs and the service worker never caches them, so with no signal
 * there is no way to *read* the notes back — the same hole `prefs/store.ts` exists to
 * fill, and filled the same way: the database stays the single source of truth, this is a
 * cache, and the server's answer wins whenever there is one.
 */

import { readTarget, type SongComment } from './types'

const CACHE_PREFIX = 'songs:comments:'
const OUTBOX_KEY = 'songs:comments:outbox'

function read(key: string): unknown {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    // Private-mode browsers and disabled storage both throw; a missing cache is not an
    // error, it just means there is nothing remembered yet.
    return null
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota or a browser refusing storage. Losing the cache is survivable; throwing
    // here, in the middle of a keystroke, is not.
  }
}

/** Narrows one cached entry, which came from storage and is therefore unknown. */
function readComment(value: unknown): SongComment | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || typeof raw.body !== 'string') return null

  const anchor = raw.anchor
  let parsed: SongComment['anchor'] = null
  if (typeof anchor === 'object' && anchor !== null) {
    const a = anchor as Record<string, unknown>
    if (typeof a.blockIndex === 'number' && typeof a.charOffset === 'number') {
      parsed = { blockIndex: a.blockIndex, charOffset: a.charOffset, target: readTarget(a.target) }
    }
  }

  return {
    id: raw.id,
    anchor: parsed,
    anchorLabel: typeof raw.anchorLabel === 'string' ? raw.anchorLabel : '',
    body: raw.body,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
  }
}

export function readComments(songSlug: string): SongComment[] {
  const value = read(CACHE_PREFIX + songSlug)
  if (!Array.isArray(value)) return []
  return value.map(readComment).filter((c): c is SongComment => c !== null)
}

export function writeComments(songSlug: string, comments: readonly SongComment[]): void {
  write(CACHE_PREFIX + songSlug, comments)
}

/**
 * One queued write, waiting for a network.
 *
 * Keyed by the comment's own id rather than by the song, which is the whole reason this
 * is not `prefsQueue`: that one keeps at most one entry per song and lets the latest win,
 * so editing two notes in a row would silently drop the first. Here two notes are two
 * entries and neither stands on the other.
 *
 * A delete carries no body — the row is going away — but still carries the slug, because
 * the cache it has to be replayed against is per song.
 */
export type OutboxEntry =
  | { kind: 'save'; songSlug: string; comment: SongComment }
  | { kind: 'delete'; songSlug: string; id: string }

export function readOutbox(): OutboxEntry[] {
  const value = read(OUTBOX_KEY)
  if (!Array.isArray(value)) return []

  return value.filter((entry): entry is OutboxEntry => {
    if (typeof entry !== 'object' || entry === null) return false
    const e = entry as Record<string, unknown>
    if (typeof e.songSlug !== 'string') return false
    if (e.kind === 'delete') return typeof e.id === 'string'
    return e.kind === 'save' && readComment(e.comment) !== null
  })
}

export function writeOutbox(entries: readonly OutboxEntry[]): void {
  write(OUTBOX_KEY, entries)
}

/**
 * Adds one entry, replacing any older one for the same comment.
 *
 * Per comment, not per song: editing one note twice before the network returns should
 * send the newer text once, while a *different* note edited in between keeps its own
 * entry. A delete replaces a pending save for the same id — sending the save first and
 * then the delete would be two round trips to reach the same empty end state.
 */
export function enqueue(entry: OutboxEntry): OutboxEntry[] {
  const id = entry.kind === 'save' ? entry.comment.id : entry.id
  const next = readOutbox().filter((existing) => {
    const existingId = existing.kind === 'save' ? existing.comment.id : existing.id
    return existingId !== id
  })
  next.push(entry)
  writeOutbox(next)
  return next
}

export function dequeue(entry: OutboxEntry): OutboxEntry[] {
  const id = entry.kind === 'save' ? entry.comment.id : entry.id
  const next = readOutbox().filter((existing) => {
    const existingId = existing.kind === 'save' ? existing.comment.id : existing.id
    return existingId !== id
  })
  writeOutbox(next)
  return next
}
