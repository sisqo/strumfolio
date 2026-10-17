import { recordSongOpened } from '@/lib/prefs/actions'
import { isRecord, isSlug, readerRoute } from '@/lib/reader/route'

/** `recordSongOpened` outside the action queue — `lib/reader/route.ts` says why. */
export const POST = readerRoute(
  (body) => (isRecord(body) && isSlug(body.slug) ? { slug: body.slug } : null),
  ({ slug }) => recordSongOpened(slug),
)
