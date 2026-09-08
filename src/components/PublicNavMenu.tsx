'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { IconMenu } from '@/components/icons'
import type { NavSection } from '@/lib/publicNav'

/**
 * The public bars' sections, behind one button, on a screen too narrow to print them in a
 * row — shared by `PublicHeader` and `SiteHeader` so the two cannot behave differently for
 * the same tap.
 *
 * Everything here is `.menu`/`.menu-overlay`/`.menu-panel`/`.menu-item`, the app's own menu
 * vocabulary (`NavMenu` is the other reader), rather than a set of classes drawn for this
 * one. Those rules are coloured from the global tokens only, so they hold inside `.blog` and
 * `.tool-page` too — those two surfaces add `--site-width` and the `--blog-*` family and
 * redefine nothing this panel reads.
 *
 * **A client component, where the rest of both bars is server-rendered, and the deciding
 * reason is the third effect below.** A `<details>`/`<summary>` would give the open state,
 * the keyboard and a screen reader's own «expanded» for free — which is why this app already
 * reaches for one on the FAQ rows and the song-data drawer — but both bars are drawn by a
 * *layout*, and a layout does not unmount when the page under it changes. Tapping «Blog»
 * inside a `<details>` menu would navigate and leave the panel standing open over the page
 * it had just brought you to. There is no markup-only way to close it: `<details>` has no
 * notion of "the thing I linked to has arrived".
 *
 * The quiet action (`action`) is repeated at the foot of the panel because it leaves the row
 * on a narrow screen: only the primary capsule stays out in the bar, so «Sign in» would
 * otherwise be reachable on a phone from nowhere at all.
 */
export function PublicNavMenu({
  sections,
  action,
}: {
  sections: NavSection[]
  /** The text action that the bar itself hides at this width — «Sign in», typically. */
  action?: { href: string; label: string }
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  /*
   * Closes itself when the page changes — the whole reason this is not a `<details>`.
   *
   * Keyed on the path rather than on each link's own `onClick`, because those are not the
   * only way out of this panel: the browser's back button, and a second tap on a link to the
   * page already showing, both change what is under the bar without ever running a handler
   * here. It also fires once on mount, which costs a no-op state set on a panel that is
   * already closed.
   */
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <div className="menu public-nav-menu">
      <button
        type="button"
        className="nav-link"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? 'Close the menu' : 'Open the menu'}
        onClick={() => setOpen((value) => !value)}
      >
        <IconMenu size={20} />
      </button>

      {open && (
        <>
          {/* Catches the tap that means "never mind" — same overlay every panel in this app
              hangs behind, veil included. */}
          <div className="menu-overlay" onClick={() => setOpen(false)} aria-hidden />

          <div className="menu-panel" role="menu">
            {sections.map((section) => (
              <Link key={section.href} href={section.href} className="menu-item" role="menuitem">
                {section.label}
              </Link>
            ))}

            {action !== undefined && (
              <>
                <span className="menu-divider" aria-hidden />
                <Link href={action.href} className="menu-item" role="menuitem">
                  {action.label}
                </Link>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
