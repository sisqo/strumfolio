import type { Metadata } from 'next'

import { Footer } from '@/components/Footer'
import { PasswordScreen } from '@/components/PasswordScreen'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { requireAccount } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Password' }

/**
 * Your own way in.
 *
 * Nothing baked in: whether you have a password is a fact about the server, read by
 * `PasswordScreen` itself. It used to be a static shell exempt from `requireAccount` as «the
 * standalone tool», which it is not — it is the signed-in reader's own password screen, so a
 * deleted account's session is sent off it like every other screen's.
 */
export default async function PasswordPage() {
  await requireAccount()

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
