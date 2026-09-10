import type { Metadata } from 'next'

import { Footer } from '@/components/Footer'
import { PasswordScreen } from '@/components/PasswordScreen'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'

export const metadata: Metadata = { title: 'Password' }

/**
 * Your own way in.
 *
 * A static shell like every other screen, precached like them, with nothing baked in:
 * whether you have a password is a fact about the server, and this page has no idea who
 * will open it.
 */
export default function PasswordPage() {
  return (
    // The menu in the header holds a reader preference, so it needs this here too.
    <PrefsProvider songSlug={null}>
      <TopBar current="password" />

      <main className="mx-auto max-w-4xl px-4 pb-12 pt-3">
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">Password</h1>
          <p className="mt-2 text-sm leading-[1.45] text-muted">
            Lets you sign in without going through Google. Google still works too: these are
            two ways to prove the same address, not two accounts.
          </p>
        </header>

        <PasswordScreen />

        <Footer />
      </main>
    </PrefsProvider>
  )
}
