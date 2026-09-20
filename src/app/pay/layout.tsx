import { PublicHeader } from '@/components/PublicHeader'
import { publicBarFor } from '@/lib/publicBar'

/**
 * The same shell `/checkout/[plan]` wears, and for the same argument: no hamburger, no account
 * menu, no navigation — nothing on a page where somebody is about to pay that is a way out of
 * the only thing the page is for. The one difference is who the reader is. There, they are
 * signed in and mid-purchase; here they may be neither, having followed a link out of an email
 * from Paddle, so the brand mark is not just the way out, it is the only thing on the page that
 * says whose payment this is.
 *
 * `action: false` is what keeps that true now that the bar has an action of its own. The mark
 * still has to lead somewhere honest, though, and that is the one thing the session is asked
 * for here — a read this page makes and does not otherwise use, which is the cost
 * `publicBar.ts` names rather than a prop that exists to dodge it.
 */
export default async function PayLayout({ children }: { children: React.ReactNode }) {
  const bar = await publicBarFor({ action: false })

  return (
    <>
      <PublicHeader width="70rem" {...bar} />
      {children}
    </>
  )
}
