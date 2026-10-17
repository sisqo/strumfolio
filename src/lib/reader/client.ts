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
 * Rejects on no network, on the timeout, and on any answer that is not the route's own: a
 * session that ended is redirected to `/login` by the middleware, and `fetch` follows that to
 * a page, not a result. Callers keep the `.catch` they had for the action.
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

function inOrder(body: unknown): Promise<null> {
  const call = broadcasts.catch(() => {}).then(() => post<null>('broadcast', body))
  broadcasts = call
  return call
}

export const readerBroadcastPlay = (slug: string, semitones: number) => inOrder({ kind: 'play', slug, semitones })

export const readerBroadcastTranspose = (slug: string, semitones: number) =>
  inOrder({ kind: 'transpose', slug, semitones })
