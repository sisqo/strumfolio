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
export default function BillingPage() {
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
