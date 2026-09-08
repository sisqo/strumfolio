import Link from 'next/link'

import { PublicNavMenu } from '@/components/PublicNavMenu'
import { ThemeToggle } from '@/components/ThemeToggle'
import { APP_NAME } from '@/lib/brand'
import { navSectionsExcept } from '@/lib/publicNav'

/**
 * The header on every page that is not `TopBar`'s to draw and not the blog's: the landing
 * page, sign-in, register, the password recovery pair, email verification, pricing,
 * `/changelog` and the four legal pages — everywhere a reader may be signed out, or never
 * signs in at all. Same box and same brand mark as `TopBar`'s own
 * (`.top-bar`/`.top-bar-inner`/`.brand`, reused rather than redrawn); what changes between
 * "inside" and "outside" the app is what the row holds beside it.
 *
 * **It became a navigation the day `/` stopped being the sign-in form.** Until then this bar
 * held one mark, one theme switch and a single CTA, which was enough because there was one
 * public page and it argued for itself: `/login` pointed at `/pricing` and `/pricing` pointed
 * back. With a real landing page at `/`, a blog and six free tools, a visitor who arrives from
 * a search is somewhere in the middle of a site rather than at its one door — so the row now
 * carries the site's sections (`lib/publicNav.ts`) and up to two actions: a quiet text link
 * and a capsule.
 *
 * **The section list is shared with `SiteHeader`, not copied.** That bar draws the same
 * sections on the paper surface the blog and the tools use, and the two must never disagree
 * about what this site is made of; `lib/publicNav.ts` says why the two components stay
 * separate all the same (the `--blog-*` tokens are scoped to `.blog`/`.tool-page`).
 *
 * `width` sets `--top-bar-width`, the same variable `.top-bar-inner` reads for `TopBar`'s own
 * `max-w-3xl`/48rem default. Every page this renders on is a different shape from every other
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
 * either way — it is what holds the light/dark/auto switch and the way out to the rest of the
 * site, and a page with its own lockup needs both exactly as much as any other.
 *
 * `current` names the section the page *is*, so the row does not link to it: a link to the
 * page you are standing on is a dead control. Matched on the label — see `navSectionsExcept`.
 *
 * `link` and `cta` are the two actions, and both are optional because who is reading decides
 * them and this component deliberately has no notion of a session. `/pricing` is the page that
 * proved the point: its bar used to offer «Sign in» unconditionally, to signed-in readers
 * included, and the fix was for its own layout to decide — six other layouts render this in
 * front of somebody with no session, where «Sign in» is exactly right. So the decision stays
 * at the call site. The sign-in pages pass neither: each already cross-links its twin from
 * inside its own card, and a bar offering «Sign in» above the sign-in form is the same dead
 * control `current` exists to avoid.
 */
export function PublicHeader({
  width,
  brand = true,
  current,
  link,
  cta,
}: {
  width: string
  brand?: boolean
  /** The section this page belongs to, if it is one — «Pricing», «Tools», «Blog». */
  current?: string
  /** The quiet text action. Moves into the menu panel on a narrow screen. */
  link?: { href: string; label: string }
  /** The primary action, as a capsule. Stays in the bar at every width. */
  cta?: { href: string; label: string }
}) {
  const sections = navSectionsExcept(current)

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

        {/* The sections, beside the mark rather than out on the right: they say where else
            this site goes, which belongs with the mark that says which site it is. Hidden
            below 48rem, where `PublicNavMenu` takes them over. */}
        <nav className="public-nav" aria-label="Site sections">
          {sections.map((section) => (
            <Link key={section.href} href={section.href} className="public-nav-link">
              {section.label}
            </Link>
          ))}
        </nav>

        {/* Holds everything after it against the right edge, with or without a mark on the
            left and whatever the row before it happens to hold. */}
        <span className="flex-1" />

        <ThemeToggle />

        {link !== undefined && (
          <Link href={link.href} className="public-bar-action">
            {link.label}
          </Link>
        )}

        {cta !== undefined && (
          <Link href={cta.href} className="btn btn-primary btn-sm">
            {cta.label}
          </Link>
        )}

        {/*
          * The narrow-screen way to the sections, and to `link` — which leaves the row at the
          * same width. Rendered whenever there is anything for it to hold: a bar with no
          * sections and no quiet action (a sign-in page, on a phone) has nothing to open.
          */}
        {(sections.length > 0 || link !== undefined) && <PublicNavMenu sections={sections} action={link} />}
      </div>
    </header>
  )
}
