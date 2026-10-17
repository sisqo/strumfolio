import { loadPrefs } from '@/lib/prefs/actions'
import { isRecord, isSlug, readerRoute } from '@/lib/reader/route'

/** `loadPrefs` outside the action queue — `lib/reader/route.ts` says why. */
export const POST = readerRoute(
  (body) => (isRecord(body) && (body.song === null || isSlug(body.song)) ? { song: body.song } : null),
  ({ song }) => loadPrefs(song),
)
