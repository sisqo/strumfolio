import { requireAccount } from '@/lib/auth/session'
import type { Metadata } from 'next'

import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { ThanksScreen } from '@/components/ThanksScreen'
import { TopBar } from '@/components/TopBar'

export const metadata: Metadata = { title: 'Thanks' }

/**
 * Where a reader lands after choosing a plan — which today means **choosing Free**, and that is
 * worth stating because it used to mean every choice.
 *
 * `CheckoutScreen` pushed here once the mock had written the columns. A real payment cannot:
 * Paddle's overlay closes the moment the money is taken, and the plan is granted by a webhook a
 * second or two later — so landing here on `checkout.completed` would show the reader the plan
 * they had *before* paying. `PaddleCheckout` therefore stays where it is and says the payment
 * arrived, and the paid branch of `ThanksScreen` is reachable for a customer only by coming back
 * to the URL afterwards. Recorded rather than repaired: the fix is a screen that waits for the
 * grant, which is a thing to design and not a redirect to restore.
 *
 * A static shell, like `/billing` and `/checkout/[plan]`: nothing here can know who is signed
 * in at build time, so what plan this account now holds is asked from the client, by
 * `ThanksScreen`, on mount.
 *
 * `current="checkout"` on the top bar rather than a section of its own — this is the last step
 * of the checkout, not a seventh place in the app, and widening `TopBar`'s `Section` union for
 * a page nobody navigates to on purpose would put it in the nav for good.
 */
export default async function ThanksPage() {
  /* A session whose account no longer exists — see `requireAccount`. Silent for a visitor with
     no session at all, which is the middleware's case and not this one. */
  await requireAccount()

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
