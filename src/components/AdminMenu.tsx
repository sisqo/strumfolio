'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { useRole } from '@/components/RoleProvider'
import { IconEye, IconLink, IconSettings, IconShield, IconSliders, IconSwitchAccount } from '@/components/icons'
import type { Section } from '@/components/TopBar'

/**
 * Everything that is about running the installation rather than about reading from it —
 * behind one icon of its own in the header, offered only to a global owner.
 *
 * It exists so the other two menus can stop being conditional. Accounts and Emails used to
 * sit in `NavMenu` behind an `isGlobalOwner` test, and the user menu carried an "Owner"
 * badge nobody else saw, which meant the two menus every reader uses were quietly a
 * different shape for one reader. They are now identical for everybody, owner included, and
 * the difference lives here instead: a third opener that is either present or absent, which
 * is a far easier thing to reason about than two panels with holes in them.
 *
 * Absent — not disabled, and not present-and-refusing — for anyone who is not a global
 * owner, and absent until the answer arrives at all: `isGlobalOwner` is false while
 * `RoleProvider` is still asking, so this draws nothing until it is known to be wanted. That
 * is the same rule `RoleProvider`'s own comment sets out and the same one the Accounts entry
 * followed before it moved here — a control that flashes in a moment late is a control
 * somebody has already reached for.
 *
 * Not a permission. `/accounts` and `/emails` each re-check `isOwner` on the server and
 * `notFound()` on their own; hiding the way in is a courtesy to everyone else, never the
 * fence.
 *
 * `is-compact` on the panel is load-bearing rather than cosmetic — see that rule's own
 * comment in `globals.css`: this is the one panel in the bar whose trigger has other buttons
 * to its right, so at the base width its left edge landed exactly on the viewport's own.
 */
const ENTRIES: { section: Section; href: string; label: string; icon: typeof IconShield }[] = [
  { section: 'accounts', href: '/accounts', label: 'Accounts', icon: IconSwitchAccount },
  { section: 'emails', href: '/emails', label: 'Emails', icon: IconEye },
  /* Bookmarks to pages nothing else links to, `/thanks?preview=` among them — see that
     page's own list and its own comment on what belongs there. */
  { section: 'pages', href: '/pages', label: 'Pages', icon: IconLink },
  { section: 'design-system', href: '/design-system', label: 'Design system', icon: IconSliders },
  /* A gear, the same glyph the user menu's own Settings carries — which is agreement rather
     than collision: it means "settings" in both places, and which menu you opened is what says
     whose. The route is `/app-settings` and not `/settings` for the same reason. */
  { section: 'app-settings', href: '/app-settings', label: 'App settings', icon: IconSettings },
]

/**
 * The sections that light the shield up.
 *
 * Derived from `ENTRIES` rather than written out again, and that is the whole reason `ENTRIES`
 * is a list at all: with the two facts kept apart, adding a fourth screen meant remembering to
 * extend a `current === 'a' || current === 'b'` chain somewhere else in this file, and
 * forgetting it is invisible — the entry works, the shield just goes dark on the page it opened.
 * The compiler cannot catch that one; deriving it means there is nothing left to forget.
 */
const ADMIN_SECTIONS: Section[] = ENTRIES.map((entry) => entry.section)
export function AdminMenu({ current }: { current: Section }) {
  const { isGlobalOwner } = useRole()
  const [open, setOpen] = useState(false)

  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!isGlobalOwner) return null

  const item = (section: Section) => (section === current ? 'menu-item is-on' : 'menu-item')

  const renderEntry = (entry: (typeof ENTRIES)[number]) => (
    <Link key={entry.section} href={entry.href} className={item(entry.section)} role="menuitem" onClick={close}>
      <entry.icon size={17} />
      {entry.label}
    </Link>
  )

  return (
    <div className="menu">
      <button
        type="button"
        /*
         * `is-on` while the reader is *on* one of these screens, the same tell `.menu-item`
         * carries inside every panel. It matters more here than it would on another opener:
         * with Accounts and Emails out of the hamburger, nothing else in the bar says which
         * section an admin page belongs to any more.
         */
        className={ADMIN_SECTIONS.includes(current) ? 'nav-link is-on' : 'nav-link'}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? 'Close the admin menu' : 'Open the admin menu'}
        onClick={() => setOpen((value) => !value)}
      >
        <IconShield size={20} />
      </button>

      {open && (
        <>
          {/* Catches the tap that means "never mind" — same overlay the other two panels use. */}
          <div className="menu-overlay" onClick={close} aria-hidden />

          <div className="menu-panel is-compact" role="menu">
            {ENTRIES.slice(0, -1).map(renderEntry)}

            {/* App settings stands apart from Accounts and Emails — the other two
                act on other people's data, this one on the installation itself. */}
            <div className="menu-divider" />

            {ENTRIES.slice(-1).map(renderEntry)}
          </div>
        </>
      )}
    </div>
  )
}
