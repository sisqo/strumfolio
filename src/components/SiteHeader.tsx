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
 * Everything below is drawn to the mock: 1100px inner width, 16px/40px padding, the pill at
 * 12.5px on `accent-soft`, «Pricing» quiet at 14.5px, and the «Sign in» capsule 40px tall.
 *
 * Two departures from what the mock literally shows, both deliberate:
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
