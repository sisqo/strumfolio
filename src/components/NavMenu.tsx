'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { AdminPanel, isAdminSection } from '@/components/AdminPanel'
import { useFeedback } from '@/components/FeedbackProvider'
import { InstallPanel } from '@/components/InstallPanel'
import { useRole } from '@/components/RoleProvider'
import { StrumTogetherPanel } from '@/components/StrumTogetherPanel'
import {
  IconAddToHome,
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
import { useInstallOffer } from '@/lib/install/useInstallOffer'

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
 * **Admin is the one entry that depends on who is asking**, and it is the first one (the
 * home-screen row near the bottom is conditional too, but on the browser rather than on
 * the reader, which is not the same test):
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
 * Strum Together, Admin and the home-screen instructions are all second screens inside
 * this same panel rather than pages of their own: Strum Together is reached mid-song, where
 * a real navigation would cost the reader the page they were reading to get there and again
 * to get back; Admin is a list of six links that would otherwise need a screen to hold six
 * links; and «how to add this to your home screen» is three sentences that would be absurd
 * as a page, quite apart from being unreachable on the one browser that needs them most —
 * see `useInstallOffer` for what that row does when the browser can install by itself.
 * `view` resets to `main` on every close, so the panel always opens where it left off
 * closing — at the top, not wherever any of them happened to leave it.
 * `StrumTogetherPanel` owns its own screen — whether a broadcast is already running, the
 * QR, start and stop — shared with the reading bar's own toggle so the two can never
 * disagree about the same broadcast; see `StrumTogetherProvider`'s own comment for why that
 * state lives above both of them instead of in either.
 */
export function NavMenu({ current }: { current: Section }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'main' | 'strum-together' | 'admin' | 'install'>('main')
  const { mayEdit, isGlobalOwner } = useRole()
  const { open: openFeedback } = useFeedback()
  const { mode: installMode, install } = useInstallOffer()

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

  /*
   * The install screen is the one view whose reason to exist can disappear while it is
   * open, and it has to be walked back rather than left standing: a reader on Android
   * follows its instructions in the browser's own menu, `appinstalled` fires in this very
   * tab, and the offer becomes `null` — leaving this panel open on a screen whose only
   * child no longer renders, which is an empty bordered box. Back to the menu instead,
   * which is also the right answer if a native prompt turns up late and makes the
   * instructions the wrong thing to be reading.
   */
  useEffect(() => {
    if (view === 'install' && (installMode === null || installMode === 'prompt')) setView('main')
  }, [view, installMode])

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

          <div
            className={view === 'strum-together' || view === 'install' ? 'menu-panel is-wide' : 'menu-panel'}
            role="menu"
          >
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

            {view === 'install' && installMode !== null && installMode !== 'prompt' && (
              <>
                {/* Same back row again — see Strum Together's comment. */}
                <button
                  type="button"
                  className="menu-item w-full"
                  role="menuitem"
                  aria-label="Back to the menu"
                  onClick={() => setView('main')}
                >
                  <IconChevronLeft size={17} />
                  Add to home screen
                </button>

                <div className="menu-divider" />

                <InstallPanel mode={installMode} />
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

                {/*
                  * Beside Help and the feedback sheet because it is about the app itself
                  * rather than about the songs in it, and first in that group because it is
                  * the only one of the three that is an action. Absent entirely on a browser
                  * that can do nothing about it and inside the installed app itself —
                  * `installOffer` owns that decision and states the case for either/or over
                  * a row that explains its own uselessness.
                  *
                  * **The two shapes are deliberately one row.** Where Chromium offers a real
                  * install dialog the tap opens it and nothing else happens; everywhere else
                  * the same tap opens the instructions. `close()` runs before `install()` and
                  * without awaiting it, which matters: `prompt()` may only be called from a
                  * user gesture, so nothing may be awaited before it — the panel closing is a
                  * state update, not a wait, and the dialog it is handing over to covers the
                  * screen anyway.
                  */}
                {installMode === 'prompt' ? (
                  <button
                    type="button"
                    className="menu-item w-full"
                    role="menuitem"
                    onClick={() => {
                      close()
                      void install()
                    }}
                  >
                    <IconAddToHome size={17} />
                    Add to home screen
                  </button>
                ) : (
                  installMode !== null && (
                    <button
                      type="button"
                      className="menu-item w-full"
                      role="menuitem"
                      aria-label="Add to home screen, opens the instructions for this phone"
                      onClick={() => setView('install')}
                    >
                      <IconAddToHome size={17} />
                      Add to home screen
                      <IconChevronRight size={15} className="ms-auto" />
                    </button>
                  )
                )}

                <Link href="/help" className={item('help')} role="menuitem" onClick={close}>
                  <IconInfo size={17} />
                  Help
                </Link>

                {/*
                  * Beside Help rather than in the group above, and unconditional like Home —
                  * both are about the app itself rather than about the songs in it. Opens the
                  * feedback sheet in place rather than navigating: the sheet is the one thing
                  * that decides what a plan may send, on every one of its four categories, the
                  * same "let the tap happen and explain" arrangement `BookletScreen` argues for
                  * at length — a menu is not where a plan's contents are argued, and hiding an
                  * entry for two plans out of four teaches those readers the feature does not
                  * exist rather than that it is not theirs yet.
                  */}
                <button
                  type="button"
                  className="menu-item w-full"
                  role="menuitem"
                  onClick={() => {
                    close()
                    openFeedback()
                  }}
                >
                  <IconComment size={17} />
                  Share your feedback
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
