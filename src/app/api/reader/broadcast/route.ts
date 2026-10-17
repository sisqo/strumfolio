import { isRecord, isSlug, readerRoute } from '@/lib/reader/route'
import { broadcastAudience, broadcastPlay, broadcastTranspose } from '@/lib/strumTogether/session'

type BroadcastCall = { kind: 'audience' } | { kind: 'play' | 'transpose'; slug: string; semitones: number }

/**
 * The leader's three Strum Together pings, outside the action queue — `lib/reader/route.ts`
 * says why. `play` fires on the very press of Next, so as an action it was the one most sure
 * to be overtaken. Starting and stopping a session stay actions: those are pressed.
 */
export const POST = readerRoute(
  (body): BroadcastCall | null => {
    if (!isRecord(body)) return null
    if (body.kind === 'audience') return { kind: 'audience' }
    if ((body.kind === 'play' || body.kind === 'transpose') && isSlug(body.slug) && typeof body.semitones === 'number') {
      return { kind: body.kind, slug: body.slug, semitones: body.semitones }
    }
    return null
  },
  (call) => {
    switch (call.kind) {
      case 'audience':
        return broadcastAudience()
      case 'play':
        return broadcastPlay(call.slug, call.semitones)
      case 'transpose':
        return broadcastTranspose(call.slug, call.semitones)
    }
  },
)
