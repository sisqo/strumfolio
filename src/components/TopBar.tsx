import Link from 'next/link'
import type { ReactNode } from 'react'

import { NavMenu } from '@/components/NavMenu'
import { SignOutButton } from '@/components/SignOutButton'
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
  | 'feature-request'
  | 'checkout'
  | 'billing'
  | 'brand'

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
 * Two openers at the end of the bar, and only two: the account menu and the hamburger.
 * The theme switch used to sit between the steps and the avatar, and the admin shield
 * beside it; four icons in a row is more than a phone affords once the way back and,
 * from inside a song, the search button are also on this line, so both moved inside the
 * panels — see the comment at the openers themselves.
 *
 * `back` used to carry its songbook's name as visible text; it is icon-only now; the
 * label survives only as `aria-label`/`title`, because dropping the text is what freed
 * the room search needed on the same side of the bar, not because the name stopped
 * mattering to a screen reader or a mouse left resting on the icon.
 *
 * `search`, like `back`, is only worth passing from inside a song: it needs a way to
 * jump to another song, which is the one thing every other screen `TopBar` renders on
 * already has its own route for. It is a slot rather than a fixed piece of markup —
 * `TopBar` never reads the account's songs itself, `SongReader` builds the panel and
 * hands it down — so the pages that render this bar without ever passing `search` stay
 * exactly as static as they are today.
 *
 * Stays a plain, synchronous function on purpose — `ViewingAsPill` is the one child that
 * needs to know who is looking, and it is `'use client'`, reading `useRole()` the same way
 * `NavMenu`/`UserMenu` already do. `TopBar` itself calling `auth()`/`cookies()` to answer
 * that question directly would opt every page that renders it out of static generation —
 * `/billing`, `/help`, `/thanks` and `/export` all render this bar and are all still `○`
 * (prerendered) today, exactly because nothing server-side here has ever read a dynamic API.
 */
export function TopBar({
  current,
  back,
  steps,
  search,
}: {
  current: Section
  /** A second way out, next to the brand. Leave unset when it would lead home too. */
  back?: { href: string; label: string }
  /** Previous and next song, when this screen is part of a sequence. */
  steps?: { previous: string | null; next: string | null }
  /** The reading page's own quick search, already wired to its account's songs. */
  search?: ReactNode
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
          <Link
            href={back.href}
            className="icon-pill"
            aria-label={`Back to ${back.label}`}
            title={back.label}
          >
            <IconChevronLeft size={18} />
          </Link>
        )}

        {search}

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

        {/*
         * Two openers, and only two. The theme switch used to sit here as a third icon
         * and the admin shield as a fourth; both have moved inside the panels — theme
         * into the account menu's own Settings (as `ThemePicker`, which names all three
         * states instead of cycling through them), admin into the hamburger's first
         * entry. `PublicHeader` still carries `ThemeToggle` as an icon, because there is
         * no account menu in front of a session to put it in.
         */}
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
