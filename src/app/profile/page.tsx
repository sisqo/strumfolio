import { requireAccount } from '@/lib/auth/session'
import type { Metadata } from 'next'

import { AiAccessPanel } from '@/components/AiAccessPanel'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { ProfileScreen } from '@/components/ProfileScreen'
import { TopBar } from '@/components/TopBar'
import { mcpEnabled } from '@/lib/mcp/enabled'

export const metadata: Metadata = { title: 'Profile' }

/**
 * Your own first and last name — a static shell like
 * `/password`, with nothing baked in: whether a name is already set is a fact about the
 * server, and this page has no idea who will open it.
 */
export default async function ProfilePage() {
  /* A session whose account no longer exists — see `requireAccount`. Silent for a visitor with
     no session at all, which is the middleware's case and not this one. */
  await requireAccount()

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="profile" />

      <main className="mx-auto max-w-4xl px-4 pb-12 pt-3">
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">Profile</h1>
          <p className="mt-2 text-sm leading-[1.45] text-muted">Your first and last name.</p>
        </header>

        <ProfileScreen />

        {/* Behind `STRUMFOLIO_MCP` like the endpoint itself: a section for tokens nothing accepts
            would be the same unlabelled promise /pricing is careful never to make. */}
        {mcpEnabled() && (
          <section className="card mt-6 p-4">
            <h2 className="section-title mb-1">AI access</h2>
            <p className="mb-3 text-[0.8125rem] leading-[1.45] text-muted">
              Let an AI assistant read and edit your songbooks over MCP. It can never delete anything, and every
              song it changes keeps the previous text, which you can restore from the editor.
            </p>
            <AiAccessPanel />
          </section>
        )}

        <Footer />
      </main>
    </PrefsProvider>
  )
}
