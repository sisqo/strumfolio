import { loadSongContent } from '@/lib/library/actions'
import { isRecord, isSlug, readerRoute } from '@/lib/reader/route'

/** `loadSongContent` outside the action queue — `lib/reader/route.ts` says why. */
export const POST = readerRoute(
  (body) => (isRecord(body) && isSlug(body.slug) ? { slug: body.slug } : null),
  ({ slug }) => loadSongContent(slug),
)
