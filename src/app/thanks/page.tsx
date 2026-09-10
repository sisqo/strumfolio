import type { Metadata } from 'next'

import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { ThanksScreen } from '@/components/ThanksScreen'
import { TopBar } from '@/components/TopBar'

export const metadata: Metadata = { title: 'Thanks' }

/**
 * Where `CheckoutScreen` sends a reader whose purchase went through.
 *
 * A static shell, like `/billing` and `/checkout/[plan]`: nothing here can know who is signed
 * in at build time, so what plan this account now holds is asked from the client, by
 * `ThanksScreen`, on mount.
 *
 * `current="checkout"` on the top bar rather than a section of its own — this is the last step
 * of the checkout, not a seventh place in the app, and widening `TopBar`'s `Section` union for
 * a page nobody navigates to on purpose would put it in the nav for good.
 */
export default function ThanksPage() {
  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="checkout" />

      <main className="mx-auto max-w-4xl px-4 pb-12 pt-3">
        <ThanksScreen />

        <Footer />
      </main>
    </PrefsProvider>
  )
}
