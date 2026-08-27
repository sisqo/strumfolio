import type { Metadata } from 'next'

import { FeatureRequestScreen } from '@/components/FeatureRequestScreen'
import { Footer } from '@/components/Footer'
import { TopBar } from '@/components/TopBar'

export const metadata: Metadata = { title: 'Request a feature' }

/**
 * Asking for a feature.
 *
 * A static shell, like `/export`, `/booklet` and `/password`: who is asking and what their
 * plan allows both arrive after mount (`RoleProvider`), so there is nothing here for a build
 * to bake in — and the two consequences of being `○` are the same choices those three pages
 * already made rather than new ones. It does **not** call `requirePlanChoice`, since a
 * session-dependent redirect is what turns a page dynamic (`lib/plans/gate.ts` says as much
 * about the prerendered screens), and it stays out of `scripts/precache-routes.ts` because
 * nothing on it works offline: sending a request is a server round trip.
 *
 * No `PrefsProvider`, unlike `/booklet`: nothing on this page reads a reading preference.
 */
export default function FeatureRequestPage() {
  return (
    <>
      <TopBar current="feature-request" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <FeatureRequestScreen />

        <Footer />
      </main>
    </>
  )
}
