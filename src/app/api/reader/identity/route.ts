import { loadIdentity } from '@/lib/auth/actions'
import { loadFavoriteSlugs } from '@/lib/favorites/actions'
import { listOfflineRoutes } from '@/lib/offline/sync'
import { isRecord, readerRoute } from '@/lib/reader/route'
import { getMyBroadcast } from '@/lib/strumTogether/session'

const KINDS = ['identity', 'offlineRoutes', 'favorites', 'broadcast'] as const
type Kind = (typeof KINDS)[number]

/**
 * The reads a page makes when it loads, outside the action queue — `lib/reader/route.ts` says
 * why: a song opened on dead wifi left them pending, and the first press of Next overtook them.
 * All four are measured, not guessed: `favorites` and `broadcast` were the two a browser run on
 * 2026-10-17 still found reloading the song after the others had moved.
 */
export const POST = readerRoute(
  (body) => (isRecord(body) && KINDS.includes(body.kind as Kind) ? { kind: body.kind as Kind } : null),
  ({ kind }) => {
    switch (kind) {
      case 'identity':
        return loadIdentity()
      case 'offlineRoutes':
        return listOfflineRoutes()
      case 'favorites':
        return loadFavoriteSlugs()
      case 'broadcast':
        return getMyBroadcast()
    }
  },
)
