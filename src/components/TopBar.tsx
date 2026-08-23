import Link from 'next/link'

import { AdminMenu } from '@/components/AdminMenu'
import { NavMenu } from '@/components/NavMenu'
import { SignOutButton } from '@/components/SignOutButton'
import { ThemeToggle } from '@/components/ThemeToggle'
import { UserMenu } from '@/components/UserMenu'
import { ViewingAsPill } from '@/components/ViewingAsPill'
import { IconChevronLeft, IconChevronRight } from '@/components/icons'
import { APP_NAME } from '@/lib/brand'

export type Section =
  | 'songs'
  | 'songbooks'
  /* Before `export`, matching the order the menu draws the two in — they are neighbours there
     and the booklet is the one people reach for, so it goes first in both places. */
  | 'booklet'
  | 'export'
  | 'password'
  | 'accounts'
  | 'emails'
  | 'pages'
  | 'design-system'
  | 'app-settings'
  | 'help'
  | 'checkout'
  | 'billing'

/**
 * The header, on every screen inside the app.
 *
 * The sections live in a menu rather than in the bar itself: five labels never
 * fit a phone — the first version proved it by cutting "Sign out" off the right edge
 * — and icons alone said too little.
 *
 * The brand is on every screen, including inside a song. It used to be swapped
 * out for the return link there, which saved a few millimetres and cost the one
 * thing that says which app this is — on a phone, in standalone mode, with no
 * browser chrome around it. So `back` is now something the bar gains rather than
 * something that displaces the mark, and it is only worth passing when it leads
 * somewhere the brand does not: from inside a song, the songbook it came from,
 * which is one level below the home the brand leads to.
 *
 * The active section arrives as a prop rather than from `usePathname`, so the
 * server renders it: these pages are statically generated and precached, and
 * nothing here should be able to change that.
 *
 * `ThemeToggle` sits between the steps and `UserMenu` rather than inside either
 * menu, the one control on this bar that is not about navigating or about who is
 * signed in — and the same component `PublicHeader` renders on every screen this
 * bar does not reach, so a reader who signs in mid-visit meets the identical
 * switch rather than a second one that happens to look the same.
 *
 * Stays a plain, synchronous function on purpose — `ViewingAsPill` is the one child that
 * needs to know who is looking, and it is `'use client'`, reading `useRole()` the same way
 * `AdminMenu`/`UserMenu` already do. `TopBar` itself calling `auth()`/`cookies()` to answer
 * that question directly would opt every page that renders it out of static generation —
 * `/billing`, `/help`, `/thanks` and `/export` all render this bar and are all still `○`
 * (prerendered) today, exactly because nothing server-side here has ever read a dynamic API.
 */
export function TopBar({
  current,
  back,
  steps,
}: {
  current: Section
  /** A second way out, next to the brand. Leave unset when it would lead home too. */
  back?: { href: string; label: string }
  /** Previous and next song, when this screen is part of a sequence. */
  steps?: { previous: string | null; next: string | null }
}) {
  return (
    <header className="top-bar">
      <div className="top-bar-inner">
        {/*
          * Both render; CSS shows one (`.lockup-light`/`.lockup-dark`, globals.css) —
          * a static, precached page can't know the reader's theme, so a plain `<img>`
          * pair is what `next/image` would gain nothing over: no responsive source set
          * to pick between, no format to convert, an SVG already as small as it gets.
          */}
        <Link href="/" className="brand" aria-label={`${APP_NAME}, all songs`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- theme-swapped SVG lockup, see comment above */}
          <img src="/brand/lockup-horizontal-black.svg" alt="" className="lockup-light" />
          {/* eslint-disable-next-line @next/next/no-img-element -- theme-swapped SVG lockup, see comment above */}
          <img src="/brand/lockup-horizontal-white.svg" alt="" className="lockup-dark" />
        </Link>

        <ViewingAsPill />

        {back !== undefined && (
          <Link href={back.href} className="back-link min-w-0">
            <IconChevronLeft size={16} />
            <span className="truncate">{back.label}</span>
          </Link>
        )}

        <span className="flex-1" />

        {/*
         * Both arrows keep their place even with nowhere to go, so the buttons
         * next to them do not shift between the first song and the second.
         */}
        {steps !== undefined && (
          <div className="flex items-center gap-1.5">
            <Step href={steps.previous} label="Previous song" direction="previous" />
            <Step href={steps.next} label="Next song" direction="next" />
          </div>
        )}

        <ThemeToggle />
        {/*
         * Between the theme switch and the avatar, so the hamburger keeps the end of the bar
         * it has always had. Draws nothing at all for anybody who is not a global owner — see
         * `AdminMenu`'s own comment on why the difference lives in whether this opener exists
         * rather than in holes inside the other two panels.
         */}
        <AdminMenu current={current} />
        <UserMenu>
          <SignOutButton />
        </UserMenu>
        <NavMenu current={current} />
      </div>
    </header>
  )
}

function Step({
  href,
  label,
  direction,
}: {
  href: string | null
  label: string
  direction: 'previous' | 'next'
}) {
  const icon = direction === 'previous' ? <IconChevronLeft size={20} /> : <IconChevronRight size={20} />

  if (href === null) {
    return (
      <span className="nav-link is-off" aria-hidden>
        {icon}
      </span>
    )
  }

  return (
    <Link href={href} className="nav-link" title={label} aria-label={label}>
      {icon}
    </Link>
  )
}
