import Link from 'next/link'

import { ThemeToggle } from '@/components/ThemeToggle'
import { APP_NAME } from '@/lib/brand'
import type { BarLink } from '@/lib/publicBar'

/**
 * The header on every page that is not `TopBar`'s to draw and not the blog's: the landing
 * page, sign-in, register, the password recovery pair, email verification, pricing,
 * `/changelog` and the four legal pages — everywhere a reader may be signed out, or never
 * signs in at all. Same box and same brand mark as `TopBar`'s own
 * (`.top-bar`/`.top-bar-inner`/`.brand`, reused rather than redrawn); what changes between
 * "inside" and "outside" the app is what the row holds beside it.
 *
 * **Drawn from `Home.dc.html`, which gives this bar four things**: the theme switch, a
 * «Pricing» link, «Sign in», and «Start free» as a capsule — every quiet item a 36px pill
 * that fills on hover, the capsule the accent. The mock's own geometry lives on
 * `.public-bar-link` and `.public-bar-cta` rather than on `.btn` plus utilities, the rule the
 * `/accounts` block states for its own mock: a 36px pill beside a 44px `.btn` is a different
 * control, not a variant.
 *
 * **The mock is overridden on the last of those four, and the note is here so nobody puts it
 * back.** «Sign in» quiet beside «Start free» loud asked two different things of the same
 * corner and was reported as confusing, so the bar carries **one** action now and the capsule
 * is where it goes: «Sign in» for a visitor, «My songbooks» for somebody already inside.
 * «Start free» still exists where it converts — the landing page's own hero button, and the
 * panel that closes every article and every tool — it is simply not navigation. The rule and
 * the words both live in `lib/publicBar.ts`; this component only draws what it is handed.
 *
 * **It briefly carried a section row — Pricing · Tools · Blog — and the mock took it back
 * out.** That row was built the same day, on the reasoning that blog and tools are the
 * surfaces a search sends people to and a visitor who lands on an article should be able to
 * move; `Home.dc.html` draws neither, and the mock won. Both are still in `Footer`'s own row,
 * which every page carries, and `SiteHeader` — the paper bar on the blog and the tools
 * themselves — keeps the sections, so a reader who is *in* that part of the site can still
 * move around it. See `lib/publicNav.ts`, which is now that bar's alone.
 *
 * `width` sets `--top-bar-width`, the same variable `.top-bar-inner` defaults to 56rem for the
 * app's own screens, which are all one shape and so set nothing. The pages this renders on are
 * not: a 70rem landing page and `/pricing` against the 56rem of the legal pages, the changelog
 * and the five sign-in forms — and a header with one borrowed width would line its mark and
 * its actions up with nothing on whichever half it did not come from.
 * There is no default here, on purpose: every call site names the width it actually uses, so a
 * page added later without one is a build-time prop error rather than a header that quietly
 * stops matching what it sits on.
 *
 * **The mark is always drawn, and `brandHref` is required for the same reason `width` is.**
 * Two call sites used to pass `brand={false}` — the landing page and the five sign-in forms,
 * both of which print the same lockup a few dozen pixels below — on the argument that the same
 * drawing twice on one screen reads as a mistake rather than as a masthead. That argument lost
 * to the one against an empty corner: the top-left of a page is where a reader looks to find
 * out where they are and how to leave, and «it is further down» is not an answer while they are
 * looking at the bar. So both now carry it twice, knowingly.
 *
 * Where it leads is not a constant, which is the part that surprises: `/` is the marketing home
 * for a visitor and the reader's own songbooks for everybody else, so a signed-in reader's mark
 * points at `/home` instead — the same landing page at a URL that ignores the session.
 * `lib/publicBar.ts` has the whole argument, including why a crawler never meets that link.
 *
 * `links` and `cta` are what differ per page. The *quiet* row is still the call site's to name,
 * because it is about the page rather than the reader — `/pricing` passes no «Pricing» pill,
 * since a bar that links to the page it is standing on is a dead control. The *capsule* is no
 * longer anybody's to choose: it comes from `publicBarFor`, which is what fixed seven bars that
 * were offering «Sign in» to people who were already signed in while `/pricing` alone had the
 * branch.
 */
export function PublicHeader({
  width,
  brandHref,
  links = [],
  cta,
  wideAction = false,
}: {
  width: string
  /** Where the mark leads — from `publicBarFor`, never written out at a call site. */
  brandHref: string
  /** The quiet pill actions, left of the capsule — «Pricing». */
  links?: BarLink[]
  /** The one action, as an accent capsule. */
  cta?: BarLink
  /** See `PublicBar.wideAction`: which capsule is in the row, which is what has to fit. */
  wideAction?: boolean
}) {
  /* `public-bar` beside `top-bar` is what scopes the mock's flatter, 36px controls to this
     bar: `ThemeToggle` renders `.nav-link`, the same class `TopBar`'s own buttons use, so
     restyling that class would restyle the app's header on every screen. */
  /* A data attribute rather than a class, because it is not a variant of this bar — it is the
     one fact the narrow-width rules need and cannot read off the row: how wide the capsule's
     own words are. `globals.css` has the measurements. */
  return (
    <header className="top-bar public-bar" data-wide-action={wideAction ? '' : undefined}>
      <div className="top-bar-inner" style={{ '--top-bar-width': width } as React.CSSProperties}>
        {/* Both render; CSS shows one — see the same comment in TopBar.tsx. */}
        <Link href={brandHref} className="brand" aria-label={`${APP_NAME}, home`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- theme-swapped SVG lockup, see TopBar.tsx */}
          <img src="/brand/lockup-horizontal-black.svg" alt="" className="lockup-light" />
          {/* eslint-disable-next-line @next/next/no-img-element -- theme-swapped SVG lockup, see TopBar.tsx */}
          <img src="/brand/lockup-horizontal-white.svg" alt="" className="lockup-dark" />
        </Link>

        {/* Holds everything after it against the right edge. */}
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
