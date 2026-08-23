import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CheckoutScreen } from '@/components/CheckoutScreen'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { isCheckoutPlan } from '@/lib/plans/prices'
import type { BillingPeriod } from '@/lib/plans/prices'

export const metadata: Metadata = { title: 'Checkout' }

interface Props {
  params: Promise<{ plan: string }>
  /** `cycle`, carried over from whichever side of /pricing's own toggle sent the reader
      here — so choosing Monthly there and tapping Choose does not land back on Yearly. */
  searchParams: Promise<{ cycle?: string }>
}

/**
 * The mock checkout's own page — a static shell like every other screen (`RoleProvider`'s own
 * comment on why: nothing here can know who is signed in at build time). Everything that
 * actually depends on who is asking — whether the mock is even switched on, what this account
 * already holds — is asked from the client, by `CheckoutScreen`, the same way `/password` and
 * `/accounts` already do it.
 *
 * The one thing this page itself decides is whether `plan` names something this mock actually
 * sells: `notFound()` for anything else, so a mistyped or invented segment reads as a 404
 * rather than as a checkout for nothing.
 */
export default async function CheckoutPage({ params, searchParams }: Props) {
  const { plan } = await params
  if (!isCheckoutPlan(plan)) notFound()

  /*
   * `'month'` for anything that is not an explicit `year`, which is a change of default and
   * not a change of parsing: every link into this page from /pricing carries its own
   * `?cycle=`, so this fallback is only ever read by a direct visit — a typed URL, a
   * bookmark, a link somebody shared. Those readers used to land on Yearly while /pricing
   * itself opens on Monthly (the v3.4 redesign's own choice), so the same product had two
   * different opening prices depending on how you got to it.
   */
  const { cycle } = await searchParams
  const initialCycle: BillingPeriod = cycle === 'year' ? 'year' : 'month'

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="checkout" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <CheckoutScreen plan={plan} initialCycle={initialCycle} />

        <Footer />
      </main>
    </PrefsProvider>
  )
}
