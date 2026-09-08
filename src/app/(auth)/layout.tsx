import { PublicHeader } from '@/components/PublicHeader'

/**
 * The shell shared by the five narrow sign-in pages — sign in, register, forgot/reset
 * password, email verification. 48rem, the one width every non-landing page in the app shares;
 * each page centers its own `max-w-sm` card independently of it.
 *
 * **`/login` is one of the five again.** It had a `layout.tsx` of its own for one reason —
 * it was the full 70rem landing page and could not share a 48rem bar with four single cards —
 * and when the landing page moved to `/` that reason went with it. One file for five pages of
 * one shape, rather than six for the same thing.
 *
 * Neither action is offered in the bar here, and that is the point of passing neither: every
 * page under this layout already cross-links its twin from inside its own card («Don't have an
 * account? Register», «Already have an account? Sign in»), and a bar offering «Sign in» above
 * the sign-in form is the dead control `PublicHeader`'s `current` exists to avoid. What the bar
 * does carry is the theme switch and the way out to the rest of the public site — a visitor who
 * arrived at a sign-up form and wants to know what this costs should not have to go back.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* No mark in the bar: every page under here opens with `AuthLockup`'s own. */}
      <PublicHeader width="48rem" brand={false} />
      {children}
    </>
  )
}
