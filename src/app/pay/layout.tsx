import { PublicHeader } from '@/components/PublicHeader'

/**
 * The same shell `/checkout/[plan]` wears, and for the same argument: no hamburger, no account
 * menu, no navigation — nothing on a page where somebody is about to pay that is a way out of
 * the only thing the page is for. The one difference is who the reader is. There, they are
 * signed in and mid-purchase; here they may be neither, having followed a link out of an email
 * from Paddle, so the brand mark is not just the way out, it is the only thing on the page that
 * says whose payment this is.
 */
export default function PayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader width="70rem" />
      {children}
    </>
  )
}
