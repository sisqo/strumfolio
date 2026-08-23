import { redirect } from 'next/navigation'

import { Footer } from '@/components/Footer'
import { SongbookProvider } from '@/components/SongbookProvider'
import { HomeScreen } from '@/components/HomeScreen'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { currentUser } from '@/lib/auth/session'
import {
  listRecentlyOpened,
  listSectionsForAccount,
  listSongbooksForAccount,
  listSongsForAccount,
} from '@/lib/data/db'
import { snapshot } from '@/lib/songbooks/snapshot'
import { repository } from '@/lib/data'
import { hasDatabase } from '@/lib/db/client'
import { requirePlanChoice } from '@/lib/plans/gate'
import { toIndexEntry } from '@/lib/search-index'

/**
 * Rendered per request (v3.0): the songbooks and songs shown here are the reader's
 * **current account**, which is not known until a request names who is asking.
 */
export const dynamic = 'force-dynamic'

export default async function Home() {
  /*
   * `middleware.ts` already refuses anyone with no session at all before this ever
   * runs. What it does not catch is a session that is still valid but no longer
   * admitted anywhere — every membership pulled, no owner status either — which
   * `currentUser` alone can tell, by asking the database this page needs to ask
   * anyway. Back to `/login` is the truthful next step: there is no account left to
   * show, and signing in again is what would explain that.
   */
  const user = hasDatabase ? await currentUser() : null
  if (hasDatabase && user === null) redirect('/login')

  /*
   * The mandatory plan-choice gate (PLAN.md, v3.7). Still checked here — `/` is the page every
   * sign-in path lands on — but no longer *only* here: `requirePlanChoice` carries the same
   * check, and the reasoning about layouts and loops, to the deep-link routes that used to skip
   * it entirely. `user` is passed in because this page has already resolved it.
   */
  await requirePlanChoice(user)

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

  // Nothing to have recently played without an account of one's own, and nothing
  // in `content/`'s own single-repertoire mode either — there is no reader to
  // scope it to.
  const recentlyPlayed =
    user === null ? [] : await listRecentlyOpened(user.accountOwnerEmail, user.email, 6)

  return (
    <PrefsProvider songSlug={null}>
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
          <HomeScreen songs={songs.map(toIndexEntry)} recentlyPlayed={recentlyPlayed} />

          <Footer />
        </main>
      </SongbookProvider>
    </PrefsProvider>
  )
}
