import type { loadIdentity } from '@/lib/auth/actions'
import type { CommentWriteResult, loadComments } from '@/lib/comments/actions'
import type { SongComment } from '@/lib/comments/types'
import type { loadFavoriteSlugs } from '@/lib/favorites/actions'
import type { loadSongContent } from '@/lib/library/actions'
import type { listOfflineRoutes } from '@/lib/offline/sync'
import type { SaveResult, loadPrefs } from '@/lib/prefs/actions'
import type { GlobalPrefs, SongPrefs } from '@/lib/prefs/types'
import type { broadcastAudience, getMyBroadcast } from '@/lib/strumTogether/session'

/**
 * The browser's side of `/api/reader/*`: the same calls the actions were, by `fetch` and
 * outside Next's action queue — `lib/reader/route.ts` says why. Only types are imported from
 * the action modules, so none of them reaches this bundle.
 */

type Answer<F extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<F>>

/**
 * Long enough for a cold start, short enough that a request hung on dead wifi hands the
 * preferences and notes queues a failure back, so they retry instead of waiting for ever.
 */
const TIMEOUT_MS = 15_000

/**
 * Rejects on no network, on the timeout, and on any answer that is not the route's own — a
 * write or a song's content asked with no session cookie is a 401 (`readerRoute`), and anything
 * redirected is a page, not a result. Callers keep the `.catch` they had for the action.
 */
async function post<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`/api/reader/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok || response.redirected) throw new Error(`/api/reader/${path} answered ${response.status}`)
    return ((await response.json()) as { value: T }).value
  } finally {
    clearTimeout(timer)
  }
}

export const readerLoadIdentity = () => post<Answer<typeof loadIdentity>>('identity', { kind: 'identity' })

export const readerOfflineRoutes = () => post<Answer<typeof listOfflineRoutes>>('identity', { kind: 'offlineRoutes' })

export const readerFavoriteSlugs = () => post<Answer<typeof loadFavoriteSlugs>>('identity', { kind: 'favorites' })

export const readerMyBroadcast = () => post<Answer<typeof getMyBroadcast>>('identity', { kind: 'broadcast' })

export const readerLoadSongContent = (slug: string) => post<Answer<typeof loadSongContent>>('song', { slug })

export const readerLoadPrefs = (song: string | null) => post<Answer<typeof loadPrefs>>('prefs', { song })

export const readerRecordSongOpened = (slug: string) => post<null>('opened', { slug })

export const readerSaveGlobalPrefs = (prefs: GlobalPrefs) => post<SaveResult>('prefs/save', { kind: 'global', prefs })

export const readerSaveSongPrefs = (slug: string, prefs: SongPrefs) =>
  post<SaveResult>('prefs/save', { kind: 'song', slug, prefs })

export const readerSaveFavorite = (slug: string, value: boolean) =>
  post<SaveResult>('prefs/save', { kind: 'favorite', slug, value })

export const readerSaveTabsExpanded = (slug: string, value: boolean) =>
  post<SaveResult>('prefs/save', { kind: 'tabsExpanded', slug, value })

export const readerLoadComments = (slug: string) => post<Answer<typeof loadComments>>('comments', { kind: 'load', slug })

export const readerSaveComment = (slug: string, comment: SongComment) =>
  post<CommentWriteResult>('comments', { kind: 'save', slug, comment })

export const readerDeleteComment = (id: string) => post<CommentWriteResult>('comments', { kind: 'delete', id })

export const readerBroadcastAudience = () => post<Answer<typeof broadcastAudience>>('broadcast', { kind: 'audience' })

/**
 * The leader's song and key, one at a time and in the order pressed. As actions the queue kept
 * that order for free; in parallel a «Next» then «+2» could land the other way round and leave
 * every follower on the old key, since each call writes the whole state.
 */
let broadcasts: Promise<unknown> = Promise.resolve()

/**
 * What the followers should be showing, as this leader last pressed it — kept the way the
 * server keeps it: a play sets both, a change of key only moves the key of the song playing.
 * A change of key with no play before it on this page stays a change of key, since only the
 * server knows which song the broadcast is on.
 */
let intended: { kind: 'play' | 'transpose'; slug: string; semitones: number } | null = null

/**
 * A ping that fails is sent again, and the order above is not enough on its own (2026-11-21).
 * Each one is fire-and-forget at its call site, so on a venue's dead wifi a failed «play» left
 * every follower on the previous song until the leader happened to press something else. And a
 * timeout is the client giving up, not the server: a request already through stops nothing by
 * being aborted, so a «play» of the old song can land *after* the next one and undo it.
 *
 * So after a failure `intended` is sent again every `RESEND_MS`, until one goes
 * through `SETTLED_MS` after the last failure — later than anything abandoned can still land.
 * Not while the browser knows it is offline, which is how a song is read on a plane: there the
 * next try waits for the `online` event instead. Whether a broadcast is running is not asked —
 * on dead wifi the read that would say so is the one that fails — and a ping with none running
 * is a no-op on the server.
 */
const RESEND_MS = 10_000
const SETTLED_MS = 30_000
let lastFailureAt: number | null = null
let resend: ReturnType<typeof setTimeout> | null = null

function resendNow() {
  if (intended !== null) void inOrder(intended).catch(() => {})
}

function resendLater() {
  if (resend !== null) return
  if (!navigator.onLine) {
    window.addEventListener('online', resendNow, { once: true })
    return
  }
  resend = setTimeout(() => {
    resend = null
    resendNow()
  }, RESEND_MS)
}

function inOrder(body: unknown): Promise<null> {
  const call = broadcasts.catch(() => {}).then(() => post<null>('broadcast', body))
  broadcasts = call
  call.then(
    () => {
      if (lastFailureAt === null) return
      if (Date.now() - lastFailureAt < SETTLED_MS) resendLater()
      else lastFailureAt = null
    },
    () => {
      lastFailureAt = Date.now()
      resendLater()
    },
  )
  return call
}

/** A session started or stopped: what the last one was showing is not this one's to repeat. */
export function forgetBroadcast() {
  intended = null
  lastFailureAt = null
  if (resend !== null) clearTimeout(resend)
  resend = null
  window.removeEventListener('online', resendNow)
}

export const readerBroadcastPlay = (slug: string, semitones: number) => {
  intended = { kind: 'play', slug, semitones }
  return inOrder(intended)
}

export const readerBroadcastTranspose = (slug: string, semitones: number) => {
  if (intended === null) intended = { kind: 'transpose', slug, semitones }
  else if (intended.slug === slug) intended = { ...intended, semitones }
  return inOrder({ kind: 'transpose', slug, semitones })
}
