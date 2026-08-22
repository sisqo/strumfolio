import Link from 'next/link'

import { ThemeToggle } from '@/components/ThemeToggle'
import { APP_NAME } from '@/lib/brand'

/**
 * The header on every page that is not `TopBar`'s to draw: login, register, the password
 * recovery pair, email verification, pricing, and the four legal pages — everywhere a reader
 * may be signed out, or never signs in at all. Same bar, same brand mark, as `TopBar`'s own
 * (`.top-bar`/`.top-bar-inner`/`.brand`, reused rather than redrawn), so the one
 * thing that changes between "inside" and "outside" the app is what sits on the right of it:
 * a menu built for a signed-in reader there, only the theme switch here — the one control
 * every page needs regardless of who is reading it, which is why it is the one thing this
 * header exists to hold.
 *
 * `width` sets `--top-bar-width`, the same variable `.top-bar-inner` reads for `TopBar`'s own
 * `max-w-3xl`/48rem default. Every page this renders on is a different shape from every other
 * — a 70rem landing page, a 42rem legal document, a 24rem sign-in card — and a header with one
 * borrowed width would line its brand mark and its theme switch up with nothing on most of
 * them. There is no default here, on purpose: every call site names the width it actually
 * uses, so a page added later without one is a build-time prop error rather than a header
 * that quietly stops matching what it sits on.
 *
 * The brand mark is the way back to `/` — for the legal pages this replaces the bespoke
 * «← Strumfolio» link `(legal)/layout.tsx` used to draw inline, and for `/pricing` the inline
 * one that sat above its own heading; a second way home directly under this bar would only
 * repeat what the header already says.
 *
 * `brand={false}` leaves it out, for the pages that print the logo themselves a few dozen
 * pixels below: `/login`'s own hero badge, and the vertical lockup `AuthLockup` heads the
 * four sign-in-adjacent pages with. The same drawing twice on one screen, once small in the
 * corner and once large in the middle, reads as a mistake rather than as a masthead. The bar
 * stays either way — it is what holds the light/dark/auto switch, and a page with its own
 * lockup needs that control exactly as much as any other. Those pages also lose nothing by
 * it: `/login` *is* home for a reader who is not signed in, and the other four each say
 * "Sign in" in their own copy.
 *
 * `cta` is the one thing that differs between call sites (the redesign that added it):
 * `/login` points it at `/pricing` and `/pricing` points it back at `/login`, each page
 * sending a visitor to the one thing it does not itself say. Optional and absent by
 * default, since the legal pages, `/changelog`, `/brand` and the other auth screens have
 * no such pair to offer — a reader there is already exactly where they mean to be.
 */
export function PublicHeader({
  width,
  brand = true,
  cta,
}: {
  width: string
  brand?: boolean
  cta?: { href: string; label: string }
}) {
  return (
    <header className="top-bar">
      <div className="top-bar-inner" style={{ '--top-bar-width': width } as React.CSSProperties}>
        {brand && (
          /* Both render; CSS shows one — see the same comment in TopBar.tsx. */
          <Link href="/" className="brand" aria-label={`${APP_NAME}, home`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- theme-swapped SVG lockup, see TopBar.tsx */}
            <img src="/brand/lockup-horizontal-black.svg" alt="" className="lockup-light" />
            {/* eslint-disable-next-line @next/next/no-img-element -- theme-swapped SVG lockup, see TopBar.tsx */}
            <img src="/brand/lockup-horizontal-white.svg" alt="" className="lockup-dark" />
          </Link>
        )}

        {/* Holds the switch against the right edge with or without a mark on the left. */}
        <span className="flex-1" />

        <ThemeToggle />

        {cta !== undefined && (
          <Link href={cta.href} className="btn btn-primary btn-sm">
            {cta.label}
          </Link>
        )}
      </div>
    </header>
  )
}
