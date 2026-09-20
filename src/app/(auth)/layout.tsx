import { PublicHeader } from '@/components/PublicHeader'
import { currentUser } from '@/lib/auth/session'
import { publicBarFrom } from '@/lib/publicBar'

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
 * **The mark is in the bar now, above the one each page prints for itself.** It was left out
 * until the top-left corner being empty was the thing somebody noticed; the argument it lost
 * to is in `PublicHeader`. The lockup therefore appears twice on every page under here, once
 * small in the corner and once vertical over the card, and that is known rather than missed.
 *
 * **The capsule appears only for a reader who is already signed in.** A bar offering «Sign in»
 * above the sign-in form is the dead control this shell has always refused, and every page
 * under it cross-links its twin from inside its own card («Don't have an account? Register»,
 * «Already have an account? Sign in») — so for a visitor the answer is still no action at all.
 * Somebody with a session who lands here, though, has arrived at a form for a thing they have
 * already done, and «My songbooks» is the way out of it. What the bar carries either way is
 * the theme switch and «Pricing», the same pill `Home.dc.html` draws: a visitor who arrived at
 * a sign-up form and wants to know what this costs should not have to go back to find out.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const signedIn = (await currentUser()) !== null

  const bar = publicBarFrom(signedIn, {
    links: [{ href: '/pricing', label: 'Pricing' }],
    action: signedIn ? undefined : false,
  })

  return (
    <>
      <PublicHeader width="56rem" {...bar} />
      {children}
    </>
  )
}
