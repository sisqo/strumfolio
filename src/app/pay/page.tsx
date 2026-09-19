import type { Metadata } from 'next'

import { Footer } from '@/components/Footer'
import { PayFrame } from '@/components/PayFrame'

/**
 * `/pay` — where Paddle's **default payment link** points.
 *
 * That setting is a single URL in Checkout Settings, and Paddle uses it for more than one
 * thing: the `checkout.url` on every transaction it makes, and — the one that matters — the
 * «update your payment method» link inside the emails it sends a subscriber whose card has
 * failed. It appends `?_ptxn=txn_…` and expects the page to carry Paddle.js and open a
 * checkout for that transaction.
 *
 * **Nothing in this app did that until 2026-09-19.** Paddle.js lived only inside
 * `PaddleCheckout`, on `/checkout/[plan]`, which requires a session — so the link in a dunning
 * email landed on a page that ignored the parameter entirely. The symptom is the quietest kind
 * this repository keeps warning about: no error, no log, nobody to tell. A reader whose card
 * stopped working simply could not fix it, and `past_due` — which `webhook.ts` reads as
 * `grace` — would run its course into a cancellation nobody chose.
 *
 * **Session-free on purpose**, so its row in `publicRoutes.ts` is `indexable: false`: the URL
 * means nothing without the parameter, and a crawler that found it would be indexing an empty
 * payment page. `robots` says the same thing a second time, for the reason `/home` already
 * states — one flag stops this site advertising the URL, the other stops a crawler that
 * arrived from a pasted link.
 *
 * The parameter is read here and handed down rather than read in the client, so the server
 * renders the right thing on the first paint and there is no flash of the «nothing to pay»
 * sentence for somebody who does have a payment to make.
 */
export const metadata: Metadata = {
  title: 'Pay',
  robots: { index: false, follow: false },
}

interface Props {
  /* `_ptxn` is Paddle's name and not ours; it is what its own links carry. */
  searchParams: Promise<{ _ptxn?: string }>
}

export default async function PayPage({ searchParams }: Props) {
  const { _ptxn } = await searchParams

  return (
    <>
      <main className="mx-auto w-full max-w-[34rem] px-4 py-10">
        <h1 className="mb-2 text-2xl font-semibold">Complete your payment</h1>
        <p className="mb-6 text-muted">
          Paddle handles the payment and is the seller on your receipt.
        </p>
        <PayFrame transactionId={_ptxn ?? null} />
      </main>
      <Footer />
    </>
  )
}
