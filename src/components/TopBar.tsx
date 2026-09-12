import Link from 'next/link'
import type { ReactNode } from 'react'

import { AdminMenu } from '@/components/AdminMenu'
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
  | 'profile'
  | 'accounts'
  /* Beside `accounts`, ahead of `coupons`: a lead is a person who has not become an account
     yet, so `AdminPanel`'s own comment groups it with `accounts` rather than with `emails` —
     see that file for the rest of the ordering it drives. */
  | 'leads'
  | 'coupons'
  | 'emails'
  | 'pages'
  | 'design-system'
  | 'brand'
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
 * Three openers at the end of the bar for a global owner, two for everyone else: the
 * account menu, the admin shield (`AdminMenu`) and the hamburger. The shield was a
 * fourth icon here once already, folded into the hamburger's first entry when the bar
 * needed to survive a phone with the way back and, from inside a song, the search
 * button also on this line — see `AdminPanel`'s own comment for that reasoning in full.
 * Split back out 2026-09-12: nesting it cost every one of its eight screens a second
 * tap, which is a worse trade than a fourth icon nobody but a global owner ever sees,
 * since `AdminMenu` returns `null` outright for everyone else rather than reserving
 * the room.
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
      {/*
        * No width to set: every screen this bar draws is 56rem, so `.top-bar-inner`'s own
        * fallback is the whole answer and there is nothing here to keep in step with it.
        *
        * It briefly took a `width` prop, when the app went to 56rem and the song sheet stayed
        * at 48 — the reading screen was then the one caller that had to say so by hand. That
        * split lasted a day: the sheet is 56rem too now, and a prop no call site ever passes
        * is machinery pretending to be a decision.
        */}
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
         * Right before the reader's own avatar, not a third opener: `ViewingAsPill`
         * renders nothing (`return null`) for everyone except a global owner switched
         * into another account's view, so this costs no room in the far more common case
         * where `UserMenu`/`NavMenu` really are the only two things here. Placed here
         * rather than up by the brand, where it used to live as a passive "Viewing: X"
         * label: it is a real exit control now, and the
         * comparison it exists to draw — this customer's monogram, not mine — only reads
         * sitting right next to the monogram it is being compared against.
         */}
        <ViewingAsPill />

        {/*
         * The theme switch and the admin shield were a third and fourth icon here once.
         * Theme moved into the account menu's own Settings (as `ThemePicker`, which
         * names all three states instead of cycling through them) and stayed there —
         * every reader has an opinion about it, so it could not be conditional the way
         * admin is. The shield left for the hamburger's first entry on the same
         * room-for-a-phone reasoning and came back out 2026-09-12 as `AdminMenu`, its
         * own opener again — see `AdminPanel`'s own comment for the reversal.
         * `PublicHeader` still carries `ThemeToggle` as an icon, because there is no
         * account menu in front of a session to put it in.
         */}
        <UserMenu>
          <SignOutButton />
        </UserMenu>
        <AdminMenu current={current} />
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
