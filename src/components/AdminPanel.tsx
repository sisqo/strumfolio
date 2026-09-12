'use client'

import { Fragment } from 'react'
import Link from 'next/link'

import {
  IconEye,
  IconLink,
  IconNote,
  IconReceipt,
  IconSettings,
  IconShield,
  IconSliders,
  IconSwitchAccount,
  IconUsers,
} from '@/components/icons'
import type { Section } from '@/components/TopBar'

/**
 * Everything that is about running the installation rather than about reading from it.
 *
 * Behind its own opener now — the shield, beside the hamburger rather than a screen
 * nested inside it (`AdminMenu`). It spent a while as the hamburger's first entry
 * instead, on the reasoning that a bar which has to survive a phone could not afford a
 * third icon beside the avatar and the hamburger; the cost turned out to be the one the
 * phone test was meant to guard against in the first place — every one of these eight
 * screens then cost two taps instead of one. Reversed 2026-09-12: the shield is its own
 * opener again, and `AdminMenu` earns the room back the same way this panel always has —
 * present or absent whole, never a hole in a shared menu (see below).
 *
 * Three groups, a divider between each: who the installation serves, what the outside
 * world is shown, and the installation's own knobs. Emails, Pages, Design system and
 * Brand belong together because each one is a thing a reader sees rather than a thing
 * the platform holds — which is also why Coupons keeps its place beside Accounts and
 * Leads rather than following Emails into that group: a campaign is about what is
 * charged, not about how anything looks.
 *
 * Absent — not disabled, and not present-and-refusing — for anyone who is not a global
 * owner, and absent until the answer arrives at all: `AdminMenu` gates on
 * `isGlobalOwner`, which is false while `RoleProvider` is still asking, so nothing draws
 * until it is known to be wanted. That is the same rule `RoleProvider`'s own comment
 * sets out — a control that flashes in a moment late is a control somebody has already
 * reached for.
 *
 * Not a permission. `/accounts` and `/emails` each re-check `isOwner` on the server and
 * `notFound()` on their own; hiding the way in is a courtesy to everyone else, never the
 * fence.
 */
type Entry = { section: Section; href: string; label: string; icon: typeof IconShield }

const GROUPS: readonly (readonly Entry[])[] = [
  [
    { section: 'accounts', href: '/accounts', label: 'Accounts', icon: IconSwitchAccount },
    /* A lead is a person who has not become an account yet, so it sits with Accounts —
       ahead of Coupons — rather than with the group below about what the outside world
       is shown. IconUsers because it is the one people mark this menu does not already
       spend elsewhere. */
    { section: 'leads', href: '/leads', label: 'Leads', icon: IconUsers },
    /* Last in this group rather than first in the next: unlike Emails, Pages, Design
       system and Brand, a campaign is about what is charged rather than about how
       anything looks. IconReceipt because it is the one commerce mark this menu does
       not already spend on something else. */
    { section: 'coupons', href: '/coupons', label: 'Coupons', icon: IconReceipt },
  ],
  [
    { section: 'emails', href: '/emails', label: 'Email previews', icon: IconEye },
    /* Bookmarks to pages nothing else links to, `/thanks?preview=` among them — see that
       page's own list and its own comment on what belongs there. */
    { section: 'pages', href: '/pages', label: 'Unlinked pages', icon: IconLink },
    { section: 'design-system', href: '/design-system', label: 'Design system', icon: IconSliders },
    /* The note glyph itself — the actual brand mark, not a generic stand-in — for the
       one entry that is about the brand mark. */
    { section: 'brand', href: '/brand', label: 'Brand identity', icon: IconNote },
  ],
  [
    /* Alone: unlike every entry above, this acts on the installation's own knobs rather
       than on someone else's data. A gear, the same glyph the user menu's own Settings
       carries — which is agreement rather than collision: it means "settings" in both
       places, and which menu you opened is what says whose. The route is
       `/app-settings` and not `/settings` for the same reason. */
    { section: 'app-settings', href: '/app-settings', label: 'App settings', icon: IconSettings },
  ],
]

const ENTRIES: readonly Entry[] = GROUPS.flat()

/**
 * Whether a section is one of these screens — what marks the shield as lit even while
 * its own panel is closed (`AdminMenu`), the same tell every `.menu-item` carries while
 * that panel is open.
 *
 * Derived from `GROUPS` rather than written out again, and that is the whole reason
 * `GROUPS` is a list of lists at all: with the two facts kept apart, adding a ninth
 * screen meant remembering to extend a `current === 'a' || current === 'b'` chain
 * somewhere else, and forgetting it is invisible — the entry works, the shield just
 * stays dark on the page it opened. The compiler cannot catch that one; deriving it
 * means there is nothing left to forget.
 */
export function isAdminSection(section: Section): boolean {
  return ENTRIES.some((entry) => entry.section === section)
}

/** The list itself, inside `AdminMenu`'s panel. */
export function AdminPanel({ current, onNavigate }: { current: Section; onNavigate: () => void }) {
  const item = (section: Section) => (section === current ? 'menu-item is-on' : 'menu-item')

  return (
    <>
      {GROUPS.map((group, i) => (
        <Fragment key={i}>
          {i > 0 && <div className="menu-divider" />}
          {group.map((entry) => (
            <Link
              key={entry.section}
              href={entry.href}
              className={item(entry.section)}
              role="menuitem"
              onClick={onNavigate}
            >
              <entry.icon size={17} />
              {entry.label}
            </Link>
          ))}
        </Fragment>
      ))}
    </>
  )
}
