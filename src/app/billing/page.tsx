import { requireAccount } from '@/lib/auth/session'
import type { Metadata } from 'next'

import { BillingScreen } from '@/components/BillingScreen'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'

export const metadata: Metadata = { title: 'Billing' }

/**
 * A static shell, like `/checkout/[plan]` and `/password`: nothing here can know who is
 * signed in at build time, so everything that depends on it — whether billing is even
 * switched on, what this account already holds, its payment history — is asked from the
 * client, by `BillingScreen`, on mount.
 */
export default async function BillingPage() {
  /* A session whose account no longer exists — see `requireAccount`. Silent for a visitor with
     no session at all, which is the middleware's case and not this one. */
  await requireAccount()

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="billing" />

      <main className="mx-auto max-w-4xl px-4 pb-12 pt-3">
        <BillingScreen />

        <Footer />
      </main>
    </PrefsProvider>
  )
}
