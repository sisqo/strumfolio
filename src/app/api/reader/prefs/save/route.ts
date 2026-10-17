import { saveFavorite, saveGlobalPrefs, saveSongPrefs, saveTabsExpanded } from '@/lib/prefs/actions'
import type { GlobalPrefs, SongPrefs } from '@/lib/prefs/types'
import { isRecord, isSlug, readerRoute } from '@/lib/reader/route'

type Save =
  | { kind: 'global'; prefs: GlobalPrefs }
  | { kind: 'song'; slug: string; prefs: SongPrefs }
  | { kind: 'favorite' | 'tabsExpanded'; slug: string; value: boolean }

/**
 * The four writes of the preferences queue, outside the action queue — `lib/reader/route.ts`
 * says why. The fields inside `prefs` are read and clamped by the actions themselves.
 */
export const POST = readerRoute(
  (body): Save | null => {
    if (!isRecord(body)) return null
    if (body.kind === 'global') return isRecord(body.prefs) ? { kind: 'global', prefs: body.prefs as unknown as GlobalPrefs } : null
    if (!isSlug(body.slug)) return null
    if (body.kind === 'song') {
      return isRecord(body.prefs) ? { kind: 'song', slug: body.slug, prefs: body.prefs as unknown as SongPrefs } : null
    }
    if ((body.kind === 'favorite' || body.kind === 'tabsExpanded') && typeof body.value === 'boolean') {
      return { kind: body.kind, slug: body.slug, value: body.value }
    }
    return null
  },
  (save) => {
    switch (save.kind) {
      case 'global':
        return saveGlobalPrefs(save.prefs)
      case 'song':
        return saveSongPrefs(save.slug, save.prefs)
      case 'favorite':
        return saveFavorite(save.slug, save.value)
      case 'tabsExpanded':
        return saveTabsExpanded(save.slug, save.value)
    }
  },
)
