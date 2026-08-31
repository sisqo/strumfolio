import type { Metadata } from 'next'

import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { ProfileScreen } from '@/components/ProfileScreen'
import { TopBar } from '@/components/TopBar'

export const metadata: Metadata = { title: 'Profile' }

/**
 * Your own first and last name (`PLAN-account-name.md`, point 5) — a static shell like
 * `/password`, with nothing baked in: whether a name is already set is a fact about the
 * server, and this page has no idea who will open it.
 */
export default function ProfilePage() {
  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="profile" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">Profile</h1>
          <p className="mt-2 text-sm leading-[1.45] text-muted">Your first and last name.</p>
        </header>

        <ProfileScreen />

        <Footer />
      </main>
    </PrefsProvider>
  )
}
