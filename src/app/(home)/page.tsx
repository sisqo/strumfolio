import { FavoritesProvider } from '@/components/FavoritesProvider'
import { Footer } from '@/components/Footer'
import { SongbookProvider } from '@/components/SongbookProvider'
import { HomeScreen } from '@/components/HomeScreen'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { currentUser } from '@/lib/auth/session'
import {
  listFavoriteSlugs,
  listRecentlyOpened,
  listSectionsForAccount,
  listSongbooksForAccount,
  listSongsForAccount,
} from '@/lib/data/db'
import type { RecentSong } from '@/lib/data/db'
import { snapshot } from '@/lib/songbooks/snapshot'
import { repository } from '@/lib/data'
import { hasDatabase } from '@/lib/db/client'
import { entitlementsOf } from '@/lib/plans/resolve'
import { toIndexEntry } from '@/lib/search-index'

/**
 * Rendered per request (v3.0): the songbooks and songs shown here are the reader's
 * **current account**, which is not known until a request names who is asking.
 */
export const dynamic = 'force-dynamic'

export default async function Home() {
  /*
   * The "not admitted any more" redirect to `/login` and the mandatory plan-choice gate
   * both used to live here, but moved to `layout.tsx` beside this file — see its own
   * comment for why a redirect thrown from inside this page's body was silently not
   * redirecting at all. `user` is still resolved here too, cheaply (`currentUser` reads
   * no database of its own), for this page's own data needs below.
   */
  const user = hasDatabase ? await currentUser() : null

  const [songs, songbooks, sections] =
    user === null
      ? await Promise.all([
          repository.listSongs(),
          repository.listSongbooks(),
          repository.listSections(),
        ])
      : await Promise.all([
          listSongsForAccount(user.accountOwnerEmail),
          listSongbooksForAccount(user.accountOwnerEmail),
          listSectionsForAccount(user.accountOwnerEmail),
        ])

  // Snapshot of the mutable layer, so the first paint already shows the right
  // names; the client refreshes it from the server after mount.
  const initial = snapshot(songs, songbooks, sections)

  /*
   * Nothing to have recently played without an account of one's own, and nothing in
   * `content/`'s own single-repertoire mode either — there is no reader to scope it to.
   *
   * `frozen` beside it, in the same round trip: whether this account's repertoire is over its
   * plan's caps, which is the state a downgrade or a natural lapse leaves behind and which
   * until now reached no screen at all — a reader met it only as a refusal, the first time
   * they tried to save something. `entitlementsOf` rather than a comparison of the counts this
   * page already holds against `PLANS`: `over()` lives in `entitlementsFor` and the notice has
   * to agree with the refusal it precedes, which a second copy of the rule could not promise.
   */
  const [recentlyPlayed, frozen, favorites]: [RecentSong[], boolean, string[]] =
    user === null
      ? [[], false, []]
      : await Promise.all([
          listRecentlyOpened(user.accountOwnerEmail, user.email, 6),
          entitlementsOf(user.accountOwnerEmail).then((entitlements) => entitlements.frozen),
          /* The stars, read here rather than fetched from the client for the reason the
             two above are read here: a list whose stars appeared a moment after the rows
             would flicker under a reader already scanning it. `FavoritesProvider`
             refreshes them after mount all the same, since this page's shell can come out
             of the service worker's cache and be of any age. */
          listFavoriteSlugs(user.accountOwnerEmail, user.email),
        ])

  return (
    <PrefsProvider songSlug={null}>
      <FavoritesProvider initial={favorites}>
        <SongbookProvider initial={initial}>
          <TopBar current="songs" />

          <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
            {/* Not a title anyone needs to read: this is the page you land on, and the
                search box is the first thing to do here, not something to find under a
                heading. Still an <h1>, just not a visible one — a screen reader moving by
                heading still gets told which page this is. */}
            <h1 className="sr-only">Home</h1>

            {/*
              * Every song's searchable text, even though this screen lists songbooks: the
              * search box is here, and it searches the words. That is also why the whole
              * index is baked in rather than fetched — a search that needs the network is
              * no use on stage.
              */}
            <HomeScreen songs={songs.map(toIndexEntry)} recentlyPlayed={recentlyPlayed} frozen={frozen} />

            <Footer />
          </main>
        </SongbookProvider>
      </FavoritesProvider>
    </PrefsProvider>
  )
}
