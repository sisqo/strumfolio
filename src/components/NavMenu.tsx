'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { AdminPanel, isAdminSection } from '@/components/AdminPanel'
import { useRole } from '@/components/RoleProvider'
import { StrumTogetherPanel } from '@/components/StrumTogetherPanel'
import {
  IconBroadcast,
  IconChevronLeft,
  IconChevronRight,
  IconComment,
  IconDownload,
  IconExternal,
  IconInfo,
  IconMenu,
  IconNote,
  IconPrint,
  IconShield,
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
 * **Admin is the one entry that depends on who is asking**, and it is the first one:
 * everything about running the installation lives behind it, offered to a global owner
 * and simply absent for everybody else. It used to be a shield of its own in the header
 * — the reasoning being that "an opener that is either there or not" beats "a panel with
 * holes in it for one reader" — and that still holds; what changed is that the header
 * could not afford a third icon beside the avatar and the hamburger on a phone, so the
 * either/or moved down here to the panel's first row. `mayEdit` gates the booklet and
 * Export further down, and that is not the same kind of test: with a single grantable
 * role (v3.1) every signed-in reader is admin on their own account, so it is false only
 * before the answer arrives.
 *
 * Strum Together and Admin are both second screens inside this same panel rather than
 * pages of their own: Strum Together is reached mid-song, where a real navigation would
 * cost the reader the page they were reading to get there and again to get back, and
 * Admin is a list of six links that would otherwise need a screen to hold six links.
 * `view` resets to `main` on every close, so the panel always opens where it left off
 * closing — at the top, not wherever either of them happened to leave it.
 * `StrumTogetherPanel` owns its own screen — whether a broadcast is already running, the
 * QR, start and stop — shared with the reading bar's own toggle so the two can never
 * disagree about the same broadcast; see `StrumTogetherProvider`'s own comment for why that
 * state lives above both of them instead of in either.
 */
export function NavMenu({ current }: { current: Section }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'main' | 'strum-together' | 'admin'>('main')
  const { mayEdit, isGlobalOwner } = useRole()

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

          <div className={view === 'strum-together' ? 'menu-panel is-wide' : 'menu-panel'} role="menu">
            {view === 'strum-together' && (
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
                  Strum together
                </button>

                <div className="menu-divider" />

                <StrumTogetherPanel onClose={close} />
              </>
            )}

            {view === 'admin' && (
              <>
                {/* Same back row as Strum Together's, for the same reason — see its comment. */}
                <button
                  type="button"
                  className="menu-item w-full"
                  role="menuitem"
                  aria-label="Back to the menu"
                  onClick={() => setView('main')}
                >
                  <IconChevronLeft size={17} />
                  Admin
                </button>

                <div className="menu-divider" />

                <AdminPanel current={current} onNavigate={close} />
              </>
            )}

            {view === 'main' && (
              <>
                {/*
                  * First, and the only entry in this panel that depends on who is asking:
                  * an installation-wide owner gets it, nobody else sees it at all. Its own
                  * divider below rather than sitting flush with Home — what is behind it is
                  * about running the installation, not about reading from it, and that is a
                  * bigger step than the one between any two entries under it.
                  */}
                {isGlobalOwner && (
                  <>
                    <button
                      type="button"
                      className={isAdminSection(current) ? 'menu-item is-on w-full' : 'menu-item w-full'}
                      role="menuitem"
                      aria-label="Admin, opens the administration pages"
                      onClick={() => setView('admin')}
                    >
                      <IconShield size={17} />
                      Admin
                      <IconChevronRight size={15} className="ms-auto" />
                    </button>

                    <div className="menu-divider" />
                  </>
                )}

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
                  aria-label="Strum together, opens the broadcast screen"
                  onClick={() => setView('strum-together')}
                >
                  <IconBroadcast size={17} />
                  Strum together
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

                {/*
                  * Beside Help rather than in the group above, and unconditional like Home.
                  *
                  * Both of these are about the app itself rather than about the songs in it —
                  * one answers what it does, the other asks for what it does not do yet — so
                  * they belong on the same side of the tuner's divider. Not gated on the plan
                  * here even though Free and Standard cannot send: the page itself says so and
                  * offers `/pricing`, which is the arrangement `BookletScreen` argues for at
                  * length — a menu is not where a plan's contents are argued, and an entry
                  * missing for two plans out of four teaches those readers the feature does
                  * not exist rather than that it is not theirs yet.
                  */}
                <Link
                  href="/feature-request"
                  className={item('feature-request')}
                  role="menuitem"
                  onClick={close}
                >
                  <IconComment size={17} />
                  Request a feature
                </Link>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
