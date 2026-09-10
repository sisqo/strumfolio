import { PublicHeader } from '@/components/PublicHeader'

/**
 * The shell shared by the five narrow sign-in pages — sign in, register, forgot/reset
 * password, email verification. 56rem, the one width every page that is not a landing page
 * shares; each page centers its own `max-w-sm` card independently of it.
 *
 * **The bar is wider than anything under it here, and that is the trade accepted.** These
 * five held 48rem for a day, on the argument that a bar 8rem wider than five `max-w-sm` cards
 * lines up with nothing — true, and it is still true at 56rem. What outweighed it is that the
 * mark in the corner has to stop moving between pages: a reader crossing from `/pricing` to
 * sign in should not watch it step inward. A bar lining up with a card it is eight times the
 * width of was never the thing anybody could see.
 *
 * **`/login` is one of the five again.** It had a `layout.tsx` of its own for one reason —
 * it was the full 70rem landing page and could not share a narrow bar with four single cards
 * — and when the landing page moved to `/` that reason went with it. One file for five pages
 * of one shape, rather than six for the same thing.
 *
 * Neither action is offered in the bar here, and that is the point of passing neither: every
 * page under this layout already cross-links its twin from inside its own card («Don't have an
 * account? Register», «Already have an account? Sign in»), and a bar offering «Sign in» above
 * the sign-in form is a dead control. What the bar does carry is the theme switch and one way
 * out — «Pricing», the same pill `Home.dc.html` draws: a visitor who arrived at a sign-up form
 * and wants to know what this costs should not have to go back to find out.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* No mark in the bar: every page under here opens with `AuthLockup`'s own. */}
      <PublicHeader width="56rem" brand={false} links={[{ href: '/pricing', label: 'Pricing' }]} />
      {children}
    </>
  )
}
