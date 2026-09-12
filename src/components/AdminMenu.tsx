'use client'

import { useEffect, useState } from 'react'

import { AdminPanel, isAdminSection } from '@/components/AdminPanel'
import { useRole } from '@/components/RoleProvider'
import { IconShield } from '@/components/icons'
import type { Section } from '@/components/TopBar'

/**
 * The shield, beside the hamburger rather than a screen inside it — reversed
 * 2026-09-12, see `AdminPanel`'s own comment for why. Its own opener rather than a
 * shared one because neither list should cost the other reader a tap: an ordinary
 * reader never sees this button at all, and a global owner reaches any of the eight
 * screens behind it in one tap instead of two.
 *
 * Gated by returning `null` outright — not rendered-and-disabled, and not rendered
 * while the role is still unknown, the same either/or `RoleProvider`'s own comment
 * argues for. `TopBar` stays a plain synchronous function either way: this reads
 * `useRole()` client-side exactly as `UserMenu`/`NavMenu` already do, so nothing here
 * forces `/billing`, `/help`, `/thanks` or `/export` out of static generation.
 *
 * Lit even while closed on any of its own eight screens (`isAdminSection`), the same
 * `.nav-link.is-on` state a reading page's own controls use elsewhere — so the shield
 * still says where you are after the panel that got you there has closed.
 */
export function AdminMenu({ current }: { current: Section }) {
  const [open, setOpen] = useState(false)
  const { isGlobalOwner } = useRole()

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

  return (
    <div className="menu">
      <button
        type="button"
        className={isAdminSection(current) ? 'nav-link is-on' : 'nav-link'}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? 'Close the administration menu' : 'Admin, opens the administration pages'}
        onClick={() => setOpen((value) => !value)}
      >
        <IconShield size={20} />
      </button>

      {open && (
        <>
          {/* Catches the tap that means "never mind". */}
          <div className="menu-overlay" onClick={close} aria-hidden />

          <div className="menu-panel" role="menu">
            <AdminPanel current={current} onNavigate={close} />
          </div>
        </>
      )}
    </div>
  )
}
