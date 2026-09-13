import { PublicHeader } from '@/components/PublicHeader'

/**
 * The checkout wears the public chrome, not the app's.
 *
 * **`TopBar` is the wrong bar for a page where somebody is about to pay.** It carries the
 * hamburger, the account menu, sign-out, the admin menu and the songbook navigation — every one
 * of them a way out of the one thing this page exists for, and none of them a thing a reader
 * needs while a payment form is on screen. `/pricing` reached the same conclusion first and has
 * its own layout for exactly this reason; this is that shape, one step further along the funnel.
 *
 * **It carries no links and no call to action either**, where `/pricing`'s bar has three
 * answers for three readers. There is one reader here — signed in, mid-purchase — and there is
 * nothing to offer them that is not a distraction: «Pricing» sends them back to compare a
 * decision they have made, «My songbooks» is the thing they are buying access to, and «Sign in»
 * is meaningless to somebody with a session. What is left is the brand mark, which is the way
 * out, and the theme switch, which is the one control that changes what this page *looks* like.
 *
 * `70rem` matches `/pricing`, so the bar's mark and the page's own gutters line up across the
 * step between them — the header takes no default width on purpose, and every call site names
 * what it actually sits on.
 */
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader width="70rem" />
      {children}
    </>
  )
}
