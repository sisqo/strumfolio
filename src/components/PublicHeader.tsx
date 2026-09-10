import Link from 'next/link'

import { ThemeToggle } from '@/components/ThemeToggle'
import { APP_NAME } from '@/lib/brand'

/**
 * The header on every page that is not `TopBar`'s to draw and not the blog's: the landing
 * page, sign-in, register, the password recovery pair, email verification, pricing,
 * `/changelog` and the four legal pages — everywhere a reader may be signed out, or never
 * signs in at all. Same box and same brand mark as `TopBar`'s own
 * (`.top-bar`/`.top-bar-inner`/`.brand`, reused rather than redrawn); what changes between
 * "inside" and "outside" the app is what the row holds beside it.
 *
 * **Drawn from `Home.dc.html`, which gives this bar four things and no more**: the theme
 * switch, a «Pricing» link, «Sign in», and «Start free» as a capsule — every quiet item a
 * 36px pill that fills on hover, the capsule the accent. The mock's own geometry lives on
 * `.public-bar-link` and `.public-bar-cta` rather than on `.btn` plus utilities, the rule the
 * `/accounts` block states for its own mock: a 36px pill beside a 44px `.btn` is a different
 * control, not a variant.
 *
 * **It briefly carried a section row — Pricing · Tools · Blog — and the mock took it back
 * out.** That row was built the same day, on the reasoning that blog and tools are the
 * surfaces a search sends people to and a visitor who lands on an article should be able to
 * move; `Home.dc.html` draws neither, and the mock won. Both are still in `Footer`'s own row,
 * which every page carries, and `SiteHeader` — the paper bar on the blog and the tools
 * themselves — keeps the sections, so a reader who is *in* that part of the site can still
 * move around it. See `lib/publicNav.ts`, which is now that bar's alone.
 *
 * `width` sets `--top-bar-width`, the same variable `TopBar` sets for the app's own screens
 * (defaulted there to their 56rem column, since they are all one shape). Every page this
 * renders on, by contrast, is a different shape from every other
 * — a 70rem landing page, a 48rem legal document, a narrow sign-in card — and a header with
 * one borrowed width would line its mark and its actions up with nothing on most of them.
 * There is no default here, on purpose: every call site names the width it actually uses, so a
 * page added later without one is a build-time prop error rather than a header that quietly
 * stops matching what it sits on.
 *
 * The brand mark is the way back to `/` — which, since the restructure, is a page a visitor
 * has a reason to go back *to* rather than a redirect to this same bar's sign-in page.
 *
 * `brand={false}` leaves it out, for the pages that print the logo themselves a few dozen
 * pixels below: `/`'s own hero badge, and the vertical lockup `AuthLockup` heads the five
 * sign-in-adjacent pages with. The same drawing twice on one screen, once small in the corner
 * and once large in the middle, reads as a mistake rather than as a masthead. The bar stays
 * either way — it is what holds the light/dark/auto switch.
 *
 * `links` and `cta` are what differ per page, and both are optional because who is reading
 * decides them while this component deliberately has no notion of a session. `/pricing` is the
 * page that proved the point: its bar used to offer «Sign in» unconditionally, to signed-in
 * readers included, and the fix was for its own layout to decide — six other layouts render
 * this in front of somebody with no session, where «Sign in» is exactly right. So the decision
 * stays at the call site, and so does the rule that a bar never links to the page it is
 * standing on: `/pricing` passes no «Pricing» link.
 */
export function PublicHeader({
  width,
  brand = true,
  links = [],
  cta,
}: {
  width: string
  brand?: boolean
  /** The quiet pill actions, left of the capsule — «Pricing», «Sign in». */
  links?: { href: string; label: string }[]
  /** The primary action, as an accent capsule. */
  cta?: { href: string; label: string }
}) {
  /* `public-bar` beside `top-bar` is what scopes the mock's flatter, 36px controls to this
     bar: `ThemeToggle` renders `.nav-link`, the same class `TopBar`'s own buttons use, so
     restyling that class would restyle the app's header on every screen. */
  return (
    <header className="top-bar public-bar">
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

        {/* Holds everything after it against the right edge, with or without a mark on the
            left — and the mock has nothing at all on the left of `/`'s own bar. */}
        <span className="flex-1" />

        <ThemeToggle />

        {links.map((link) => (
          <Link key={link.href} href={link.href} className="public-bar-link">
            {link.label}
          </Link>
        ))}

        {cta !== undefined && (
          <Link href={cta.href} className="public-bar-cta">
            {cta.label}
          </Link>
        )}
      </div>
    </header>
  )
}
