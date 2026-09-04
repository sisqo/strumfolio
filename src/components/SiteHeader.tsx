import Link from 'next/link'

import { ThemeToggle } from '@/components/ThemeToggle'
import { APP_NAME } from '@/lib/brand'

/**
 * The public site's bar, and not `PublicHeader`.
 *
 * Drawn for the blog in `Blog.dc.html` and now shared by every page written to be *found*
 * rather than signed in to — the articles and the free tools. The design gives this surface a
 * different job from every other signed-out page: `/login` and `/pricing` each carry one CTA
 * pointing at the other, because a visitor there is deciding between reading and paying.
 * Somebody who landed here from a search is deciding neither — they came for the thing on the
 * page — so the bar says what this place is (the pill beside the mark) and offers the two
 * doors out of it, priced and free, without pretending the page is a sales page.
 *
 * `section` is that pill. It names where you are, never links anywhere: a link to the page
 * you are already on is a dead control, and it stays true on an article, which is part of the
 * blog, and on a tool, which is one of the tools.
 *
 * Everything inside the bar is drawn to the mock: the pill at 12.5px on `accent-soft`,
 * «Pricing» quiet at 14.5px, the «Sign in» capsule 40px tall, and the hairline underneath.
 *
 * Three departures from what the mock literally shows, all deliberate:
 *
 * - **The bar's own box is `PublicHeader`'s, not the mock's** — 70rem wide on a 1rem gutter
 *   with 0.75rem above and below, where the drawing says 1100px on 2.5rem. The reasoning is
 *   on `.site-bar-inner` in globals.css; the short version is that «Pricing» is one of the
 *   two doors this bar exists to offer, and taking it used to move the mark 24px left and
 *   4px up. A bar is the one part of a page a visitor sees *in motion*, so it answers to the
 *   bar on the page it hands you to rather than to the column underneath itself.
 *
 * - **`Sign in` and `Pricing` are links.** They are `<span>`s in the prototype because a
 *   `.dc.html` mock has nowhere to go; shipping them as drawn would be a call-to-action that
 *   cannot be clicked.
 * - **The theme switch is here and is not in the mock.** The mock is drawn in light only, and
 *   this app's dark theme is hand-tuned rather than inverted (`PRODUCT.md`), so the blog
 *   supports both — which makes the control that chooses between them non-optional. It sits
 *   before «Pricing», quietest thing on the bar, the same position `PublicHeader` gives it.
 */
export function SiteHeader({ section }: { section: string }) {
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

        <span className="flex-1" />

        <ThemeToggle />

        <Link href="/pricing" className="site-bar-link">
          Pricing
        </Link>

        <Link href="/login" className="site-bar-cta">
          Sign in
        </Link>
      </div>
    </header>
  )
}
