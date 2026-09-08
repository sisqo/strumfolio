import Link from 'next/link'

import { PublicNavMenu } from '@/components/PublicNavMenu'
import { ThemeToggle } from '@/components/ThemeToggle'
import { APP_NAME } from '@/lib/brand'
import { navSectionsExcept } from '@/lib/publicNav'

/**
 * The public site's bar, and not `PublicHeader`.
 *
 * Drawn for the blog in `Blog.dc.html` and now shared by every page written to be *found*
 * rather than signed in to — the articles and the free tools. It keeps a bar of its own
 * because the surface under it is paper: `.blog` and `.tool-page` carry the `--blog-*` family
 * and `--site-width`, and this bar is coloured from them, which is precisely why it cannot be
 * the one bar for the whole public site. See `lib/publicNav.ts`.
 *
 * `section` is the pill. It names where you are, never links anywhere: a link to the page you
 * are already on is a dead control, and it stays true on an article, which is part of the
 * blog, and on a tool, which is one of the tools. It is also what this bar hands
 * `navSectionsExcept`, so the same word is never both the pill and a link in the row beside
 * it.
 *
 * **The sections and the two actions are the same as `PublicHeader`'s, from the same list.**
 * That is the change the landing-page restructure brought here: while `/` was a redirect to
 * the sign-in form, this bar's job was to offer «the two doors out, priced and free», and two
 * controls said all there was to say. Now that the public site has a home, a price list, six
 * tools and an archive, a visitor who landed on one article needs the rest of it reachable
 * from where they are — and it must be the same set of names in the same order as every other
 * public page, or clicking through reads as changing sites.
 *
 * The row of sections borrows `.public-nav`/`.public-nav-link` from that bar rather than
 * drawing its own: both rules are coloured from `--muted`/`--ink`, which this surface does not
 * redefine, and the point of one shared list is lost if the two print it in two different
 * sizes. What stays this bar's own is everything the mock actually drew — the pill, the quiet
 * link and the capsule.
 *
 * **The capsule now says «Start free» and the quiet link says «Sign in»**, where the mock drew
 * a single «Sign in» capsule. Not a redesign of the drawing: the same two slots, re-pointed at
 * the funnel the site now has. A visitor at the foot of an article about capos has no account,
 * so the loudest control on the page should not be the one for people who already do — and the
 * one who does is a returning reader who will find a quiet «Sign in» perfectly well.
 *
 * Everything else inside the bar is still drawn to the mock: the pill at 12.5px on
 * `accent-soft`, the quiet type at 14.5px, the capsule 40px tall, and the hairline underneath.
 *
 * Three departures from what the mock literally shows, all deliberate and all older than the
 * paragraph above:
 *
 * - **The bar's own box is `PublicHeader`'s, not the mock's** — 70rem wide on a 1rem gutter
 *   with 0.75rem above and below, where the drawing says 1100px on 2.5rem. The reasoning is
 *   on `.site-bar-inner` in globals.css; the short version is that «Pricing» is one of the
 *   doors this bar exists to offer, and taking it used to move the mark 24px left and 4px up.
 *   A bar is the one part of a page a visitor sees *in motion*, so it answers to the bar on
 *   the page it hands you to rather than to the column underneath itself.
 * - **The actions are links.** They are `<span>`s in the prototype because a `.dc.html` mock
 *   has nowhere to go; shipping them as drawn would be a call-to-action that cannot be
 *   clicked.
 * - **The theme switch is here and is not in the mock.** The mock is drawn in light only, and
 *   this app's dark theme is hand-tuned rather than inverted (`PRODUCT.md`), so the blog
 *   supports both — which makes the control that chooses between them non-optional. It sits
 *   before the quiet link, quietest thing on the bar, the same position `PublicHeader` gives
 *   it.
 */
export function SiteHeader({ section }: { section: string }) {
  const sections = navSectionsExcept(section)

  return (
    <header className="site-bar">
      <div className="site-bar-inner">
        <Link href="/" className="site-bar-brand" aria-label={`${APP_NAME}, home`}>
          {/* Both render; CSS shows one — see the same comment in TopBar.tsx. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- theme-swapped SVG lockup */}
          <img src="/brand/lockup-horizontal-black.svg" alt="" className="lockup-light" />
          {/* eslint-disable-next-line @next/next/no-img-element -- theme-swapped SVG lockup */}
          <img src="/brand/lockup-horizontal-white.svg" alt="" className="lockup-dark" />
        </Link>

        <span className="site-bar-pill">{section}</span>

        <nav className="public-nav" aria-label="Site sections">
          {sections.map((entry) => (
            <Link key={entry.href} href={entry.href} className="public-nav-link">
              {entry.label}
            </Link>
          ))}
        </nav>

        <span className="flex-1" />

        <ThemeToggle />

        <Link href="/login" className="public-bar-action">
          Sign in
        </Link>

        <Link href="/register" className="site-bar-cta">
          Start free
        </Link>

        <PublicNavMenu sections={sections} action={{ href: '/login', label: 'Sign in' }} />
      </div>
    </header>
  )
}
