'use client'

import Link from 'next/link'

import { IconEye, IconLink, IconNote, IconReceipt, IconSettings, IconShield, IconSliders, IconSwitchAccount } from '@/components/icons'
import type { Section } from '@/components/TopBar'

/**
 * Everything that is about running the installation rather than about reading from it.
 *
 * This used to be a third opener of its own in the header, an icon beside the theme
 * switch and the avatar — so that the other two menus could stop being conditional.
 * That reasoning still holds, but the shield was one glyph too many in a bar that has
 * to survive a phone: it is now the first entry inside the hamburger instead (see
 * `NavMenu`), which keeps the "either present or absent" property that made the shield
 * worth having, at one opener rather than three.
 *
 * Absent — not disabled, and not present-and-refusing — for anyone who is not a global
 * owner, and absent until the answer arrives at all: the entry that opens this is gated
 * on `isGlobalOwner`, which is false while `RoleProvider` is still asking, so nothing
 * draws until it is known to be wanted. That is the same rule `RoleProvider`'s own
 * comment sets out — a control that flashes in a moment late is a control somebody has
 * already reached for.
 *
 * Not a permission. `/accounts` and `/emails` each re-check `isOwner` on the server and
 * `notFound()` on their own; hiding the way in is a courtesy to everyone else, never the
 * fence.
 */
const ENTRIES: { section: Section; href: string; label: string; icon: typeof IconShield }[] = [
  { section: 'accounts', href: '/accounts', label: 'Accounts', icon: IconSwitchAccount },
  { section: 'emails', href: '/emails', label: 'Emails', icon: IconEye },
  /* Between Emails and Pages: like both of them it is a thing the outside world sees, and
     unlike App settings at the foot of this menu it acts on data rather than on the
     installation's own knobs. `IconReceipt` because a campaign is about what is charged, and
     it is the one commerce mark this menu does not already spend on something else. */
  { section: 'coupons', href: '/coupons', label: 'Coupons', icon: IconReceipt },
  /* Bookmarks to pages nothing else links to, `/thanks?preview=` among them — see that
     page's own list and its own comment on what belongs there. */
  { section: 'pages', href: '/pages', label: 'Pages', icon: IconLink },
  { section: 'design-system', href: '/design-system', label: 'Design system', icon: IconSliders },
  /* The note glyph itself — the actual brand mark, not a generic stand-in — for the one
     entry that is about the brand mark. */
  { section: 'brand', href: '/brand', label: 'Brand', icon: IconNote },
  /* A gear, the same glyph the user menu's own Settings carries — which is agreement rather
     than collision: it means "settings" in both places, and which menu you opened is what says
     whose. The route is `/app-settings` and not `/settings` for the same reason. */
  { section: 'app-settings', href: '/app-settings', label: 'App settings', icon: IconSettings },
]

/**
 * Whether a section is one of these screens — what marks the Admin entry as the one
 * currently open, the same tell every `.menu-item` carries.
 *
 * Derived from `ENTRIES` rather than written out again, and that is the whole reason
 * `ENTRIES` is a list at all: with the two facts kept apart, adding a seventh screen
 * meant remembering to extend a `current === 'a' || current === 'b'` chain somewhere
 * else, and forgetting it is invisible — the entry works, the row just goes dark on the
 * page it opened. The compiler cannot catch that one; deriving it means there is nothing
 * left to forget.
 */
const ADMIN_SECTIONS: Section[] = ENTRIES.map((entry) => entry.section)

export function isAdminSection(section: Section): boolean {
  return ADMIN_SECTIONS.includes(section)
}

/** The list itself, for whichever panel is showing it. */
export function AdminPanel({ current, onNavigate }: { current: Section; onNavigate: () => void }) {
  const item = (section: Section) => (section === current ? 'menu-item is-on' : 'menu-item')

  const renderEntry = (entry: (typeof ENTRIES)[number]) => (
    <Link key={entry.section} href={entry.href} className={item(entry.section)} role="menuitem" onClick={onNavigate}>
      <entry.icon size={17} />
      {entry.label}
    </Link>
  )

  return (
    <>
      {ENTRIES.slice(0, -1).map(renderEntry)}

      {/* App settings stands apart from Accounts and Emails — the other two
          act on other people's data, this one on the installation itself. */}
      <div className="menu-divider" />

      {ENTRIES.slice(-1).map(renderEntry)}
    </>
  )
}
