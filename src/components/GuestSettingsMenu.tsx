'use client'

import { useEffect, useState } from 'react'

import { ThemePicker } from '@/components/ThemePicker'
import { IconChevronLeft, IconMenu } from '@/components/icons'

/**
 * The one thing a guest following a Strum Together link may change about how they read:
 * the theme. It is not about the broadcast or the repertoire — it is how *this one screen*
 * looks, which is exactly why a guest, who has no account and no session, is still allowed
 * to touch it.
 *
 * It held the instrument choice too until that moved into the reading panel itself, beside
 * «Chords as» (`ReadingPanel`) — which a guest gets in full, so nothing was taken from them
 * by the move; the row here would now be a second door to the same preference. The theme has
 * no such other door: `ThemeToggle` lives in `PublicHeader`, which a follow page does not
 * render, so this menu is the only place a guest can ask for a dark screen.
 *
 * This is not `NavMenu` with items hidden. Home, Accounts, the tuner, Strum Together,
 * Settings (Password among them), sign-out — every one of them is either meaningless
 * with no session or not this screen's to give, and threading a "guest mode" through a
 * component built for a signed-in reader's menu would mean every future addition to it
 * has to remember this exists too. A menu with one row is simpler built on its own.
 *
 * `ThemePicker` needs no `PrefsProvider` of its own — it writes the theme, not the reading
 * preferences — but `FollowSession`'s top-level one is still what carries the instrument and
 * notation the panel below reads.
 */
export function GuestSettingsMenu() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="menu">
      <button
        type="button"
        className="nav-link"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? 'Close settings' : 'Open settings'}
        onClick={() => setOpen((value) => !value)}
      >
        <IconMenu size={20} />
      </button>

      {open && (
        <>
          {/* Catches the tap that means "never mind". */}
          <div className="menu-overlay" onClick={() => setOpen(false)} aria-hidden />

          <div className="menu-panel" role="menu">
            {/*
              * Closes the panel rather than leading back to a main screen this menu does
              * not have — same row, same label as the real Settings' own back-row, so it
              * still reads as the same place, just with nowhere behind it to go to.
              */}
            <button
              type="button"
              className="menu-item w-full"
              role="menuitem"
              aria-label="Close settings"
              onClick={() => setOpen(false)}
            >
              <IconChevronLeft size={17} />
              Settings
            </button>

            <div className="menu-divider" />

            <ThemePicker />
          </div>
        </>
      )}
    </div>
  )
}
