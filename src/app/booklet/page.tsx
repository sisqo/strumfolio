import type { Metadata } from 'next'

import { BookletScreen } from '@/components/BookletScreen'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'

export const metadata: Metadata = { title: 'Booklet' }

/**
 * The printable booklet, which used to be the third card on `/export`.
 *
 * A static shell, exactly like `/export` and `/password`: whether this reader may print a
 * booklet is a fact about their role and their plan, and both arrive after mount (see
 * `RoleProvider`'s own comment), so there is nothing here for a build to bake in.
 *
 * Two things that follow from being `○`, and both are the same choices `/export` already made
 * rather than new ones. It does **not** call `requirePlanChoice`: a session-dependent redirect
 * is what turns a page dynamic, and `lib/plans/gate.ts` says in as many words why the two
 * prerendered screens are left out of the gate. And it stays out of
 * `scripts/precache-routes.ts`, where `/export` is deliberately absent too — nothing on this
 * page works offline, since building a booklet is a server round trip.
 *
 * `PrefsProvider` is not boilerplate here: `BookletPanel` reads the reader's own notation
 * preference out of it and passes it to `bookletToBlob`, so the PDF is drawn in the notation
 * they read songs in.
 */
export default function BookletPage() {
  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="booklet" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <BookletScreen />

        <Footer />
      </main>
    </PrefsProvider>
  )
}
