'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { useRole } from '@/components/RoleProvider'
import { SingTogetherPanel } from '@/components/SingTogetherPanel'
import {
  IconBroadcast,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconExternal,
  IconInfo,
  IconMenu,
  IconNote,
  IconPrint,
  IconTuningFork,
} from '@/components/icons'
import type { Section } from '@/components/TopBar'

/** The tuner, which is a separate app on its own domain. */
const TUNER_URL = 'https://guitar.sisqo.dev'

/**
 * The header's sections, behind one button.
 *
 * A menu rather than a row of links because the header is now on every screen,
 * including the reading page where horizontal space belongs to the song. Inside
 * the panel every entry carries its label, which the icon-only row on a phone
 * could not.
 *
 * **Nothing in this panel depends on who is asking any more.** Accounts and Emails were the
 * last two entries that did, offered only to a global owner, and they have moved out to
 * `AdminMenu` — a third opener in the header that is either there or not, which is a plainer
 * thing than a panel with holes in it for one reader. `mayEdit` still gates the booklet and
 * Export, and that is not the same kind of test: with a single grantable role (v3.1) every
 * signed-in reader is admin on their own account, so it is false only before the answer
 * arrives.
 *
 * Sing Together is a second screen inside this same panel rather than a page of its
 * own: it is reached mid-song, and a real navigation would cost the reader the page
 * they were reading to get there and again to get back. What it does is about the
 * repertoire being read — the songs this reader is about to sing from, sent to
 * whoever opened the link — not about this reader's own account. `view` resets to
 * `main` on every close, so the panel always opens where it left off closing — at
 * the top, not wherever Sing Together happened to leave it. `SingTogetherPanel` owns
 * the actual screen — whether a broadcast is already running, the QR, start and
 * stop — shared with the reading bar's own toggle so the two can never disagree about
 * the same broadcast; see `SingAlongProvider`'s own comment for why that state lives
 * above both of them instead of in either.
 */
export function NavMenu({ current }: { current: Section }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'main' | 'sing-together'>('main')
  const { mayEdit } = useRole()

  const close = () => {
    setOpen(false)
    setView('main')
  }

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (view !== 'main') setView('main')
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, view])

  const item = (section: Section) => (section === current ? 'menu-item is-on' : 'menu-item')

  return (
    <div className="menu">
      <button
        type="button"
        className="nav-link"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? 'Close the menu' : 'Open the menu'}
        onClick={() => {
          setOpen((value) => !value)
          setView('main')
        }}
      >
        <IconMenu size={20} />
      </button>

      {open && (
        <>
          {/* Catches the tap that means "never mind". */}
          <div className="menu-overlay" onClick={close} aria-hidden />

          <div className={view === 'sing-together' ? 'menu-panel is-wide' : 'menu-panel'} role="menu">
            {view === 'sing-together' && (
              <>
                {/*
                  * Its own row rather than a header: on a phone this is still a tap
                  * target. The accessible name says what the tap does rather than what
                  * the row is called, since a screen reader has no chevron to tell this
                  * row apart from the one that opened this view.
                  */}
                <button
                  type="button"
                  className="menu-item w-full"
                  role="menuitem"
                  aria-label="Back to the menu"
                  onClick={() => setView('main')}
                >
                  <IconChevronLeft size={17} />
                  Sing together
                </button>

                <div className="menu-divider" />

                <SingTogetherPanel onClose={close} />
              </>
            )}

            {view === 'main' && (
              <>
                <Link href="/" className={item('songs')} role="menuitem" onClick={close}>
                  <IconNote size={17} />
                  Home
                </Link>

                {/*
                  * Unconditional, like Home: any signed-in reader may open this screen —
                  * whether starting a broadcast succeeds is a question `startBroadcast`
                  * answers on the server, not one this menu asks first.
                  * It sits with Home because it is about the repertoire being read — the
                  * songs this reader is about to sing from, sent to whoever opened the
                  * link — rather than about this reader's own account, which lives
                  * entirely in `UserMenu`, not here. It opens a second screen rather than
                  * navigating away because it is reached mid-song, and a real navigation
                  * would cost the reader the page they were reading to get back to.
                  */}
                <button
                  type="button"
                  className="menu-item w-full"
                  role="menuitem"
                  aria-label="Sing together, opens the broadcast screen"
                  onClick={() => setView('sing-together')}
                >
                  <IconBroadcast size={17} />
                  Sing together
                  <IconChevronRight size={15} className="ms-auto" />
                </button>

                {/*
                  * Both hidden until a role arrives that can actually use them: the actions
                  * behind these two pages already refuse anyone without edit rights, so there
                  * is nothing for a viewer to do on either.
                  *
                  * The booklet first, and not only because it was asked for that way: it is the
                  * one of the two a musician opens for its own sake — a thing to print and hand
                  * round before a rehearsal — while an export is housekeeping. It used to be the
                  * third card *inside* `/export`, which put a paid, one-songbook PDF behind a
                  * heading about backing up an account; the menu is where that mismatch was
                  * costing it the most, since nothing in the word "Export" suggests it.
                  */}
                {mayEdit && (
                  <>
                    <Link href="/booklet" className={item('booklet')} role="menuitem" onClick={close}>
                      <IconPrint size={17} />
                      Printable booklet
                    </Link>

                    <Link href="/export" className={item('export')} role="menuitem" onClick={close}>
                      <IconDownload size={17} />
                      Export
                    </Link>
                  </>
                )}

                <div className="menu-divider" />

                {/*
                  * The tuner, which is another app on another domain.
                  *
                  * A dedicated divider on each side rather than sitting flush with its
                  * neighbours: the arrow at the end says it leaves — and, by saying that,
                  * that it needs a network, which nothing else in this menu does.
                  *
                  * A plain anchor, in a new tab: the reader is in the middle of a song,
                  * and tuning should not cost them the page they were reading.
                  */}
                <a
                  href={TUNER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="menu-item"
                  role="menuitem"
                  onClick={close}
                >
                  <IconTuningFork size={17} />
                  Tuner
                  <span className="sr-only">(opens in a new tab)</span>
                  <IconExternal size={13} className="ms-auto" />
                </a>

                <div className="menu-divider" />

                <Link href="/help" className={item('help')} role="menuitem" onClick={close}>
                  <IconInfo size={17} />
                  Help
                </Link>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
