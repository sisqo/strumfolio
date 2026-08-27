'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

import { PlanUpgradeModal, type PlanNotice } from '@/components/PlanUpgradeModal'
import { useRole } from '@/components/RoleProvider'
import { useSingAlong } from '@/components/SingAlongProvider'
import {
  IconBroadcast,
  IconCheck,
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
import { audienceIsFull, audienceSentence } from '@/lib/plans/types'
import { followUrl } from '@/lib/singAlong/link'

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
 * the top, not wherever Sing Together happened to leave it. Whether a broadcast is
 * already running is asked once, on mount, and kept in this component rather than in
 * `view` — `view` is reset by every close, and a broadcast the reader already started
 * is exactly the thing that must not be forgotten the next time they open this panel.
 */
export function NavMenu({ current }: { current: Section }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'main' | 'sing-together'>('main')
  const { mayEdit } = useRole()
  const { broadcast, askFailed, audience, busy, checkBroadcast, start, stop } = useSingAlong()

  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  /** A refusal by the plan gets the same dialog `HomeScreen` opens for its own — see
      `PlanUpgradeModal`'s own comment on why — instead of the inline `error` above. */
  const [planNotice, setPlanNotice] = useState<PlanNotice | null>(null)

  /*
   * The QR is redrawn only when the token actually changes — starting a broadcast, or
   * restarting one — not on every render, and not for the semitones or song a broadcast
   * is showing, which the QR has nothing to say about: the link is the same link
   * whatever it currently points a guest's screen at.
   *
   * `token` is hoisted out of the dependency array rather than written as
   * `broadcast?.token` inline: the same optional chain the effect body would otherwise
   * repeat, computed once, so there is one expression to read instead of two that have
   * to be trusted to agree.
   */
  const token = broadcast?.token
  useEffect(() => {
    if (token === undefined) {
      setQr(null)
      return
    }

    let cancelled = false
    QRCode.toDataURL(followUrl(token))
      .then((dataUrl) => {
        if (!cancelled) setQr(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setQr(null)
      })
    return () => {
      cancelled = true
    }
  }, [token])

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

  const startSinging = async () => {
    setError(null)
    const result = await start()
    if (result.ok) return

    /*
     * Told apart from every other failure on purpose: «try again» is advice, and it is
     * false advice here — a plan that does not include leading will not start one on the
     * second press either. `PlanUpgradeModal` names the feature and offers a way to
     * `/pricing`, so pressing this button now points somewhere, unlike when this comment
     * was first written. `close()` alongside it, not just `setPlanNotice`: the dialog's
     * own "See plans" link navigates to `/pricing`, and this menu lives in the root layout
     * across that navigation — left `open`, it would still be showing this same panel,
     * Start button and all, on the page the reader lands on.
     */
    if (result.reason === 'plan-required') {
      setPlanNotice({ reason: 'plan-required', feature: 'Sing Together' })
      close()
    }
    /*
     * The other reason worth telling apart, now that there is a reason at all to tell
     * apart: an expired session is fixed by reloading and signing in again, and pressing
     * a button that cannot work is not how anybody discovers that. The wording is
     * `WRITE_MESSAGE`'s for the same condition, copied rather than imported — this action
     * has no message map to index, and two different sentences for one failure is a
     * difference the reader would have to explain to themselves.
     */
    else if (result.reason === 'no-session') setError('Session expired. Reload the page and sign in again.')
    else setError("Couldn't start. Try again.")
  }

  const stopSinging = async () => {
    setError(null)
    const result = await stop()
    if (!result.ok) setError("Couldn't stop. Try again.")
  }

  const copyLink = async () => {
    if (broadcast == null) return
    try {
      await navigator.clipboard.writeText(followUrl(broadcast.token))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* Clipboard access can be refused; the link is still there as selectable text. */
    }
  }

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

                <div className="px-1.5 pb-1 pt-1">
                  {/* Not yet known whether this reader already has one running. */}
                  {broadcast === undefined && <p className="text-sm text-muted">One moment…</p>}

                  {broadcast === null && askFailed && (
                    /*
                     * Not the Start button: asking whether one is already running is
                     * what failed, and Start would answer a different question. Offering
                     * it here risks a reader with a broadcast already live and shared
                     * rotating its token by accident the moment a retry would have shown
                     * it was still there.
                     */
                    <>
                      <p className="notice notice-error" role="alert">
                        Couldn&apos;t check whether you already have one running.
                      </p>
                      <button
                        type="button"
                        className="btn btn-sm mt-3 w-full"
                        onClick={checkBroadcast}
                      >
                        Try again
                      </button>
                    </>
                  )}

                  {/*
                    * The two steps, said in full, every time this view is reachable — not
                    * only before the first broadcast: someone who stopped and reopened this
                    * a week later needs the reminder as much as someone seeing it for the
                    * first time. Step one's own body doubles as where the QR and link
                    * appear once there is a broadcast to show them for; before that, it is
                    * just the sentence explaining what sharing the link will do.
                    */}
                  {broadcast !== undefined && !askFailed && (
                    <div className="sing-steps">
                      <div className="sing-step">
                        <span className="sing-step-num" aria-hidden>
                          1
                        </span>
                        <div className="sing-step-body">
                          {/*
                            * Two readings of the same step, not one sentence softened for
                            * the state that has nothing to show yet: before a broadcast
                            * exists, the lead phrase names the tap that makes the link
                            * appear; once it does, «below» is true and the phrase says so.
                            */}
                          {broadcast === null ? (
                            <p className="text-sm text-muted">
                              <b>Start broadcasting</b> and <b>share the link or QR code</b> in
                              next page. Whoever opens it follows the song and the key
                              you&apos;re reading it in, live — no account needed on their side.
                            </p>
                          ) : (
                            <p className="text-sm text-muted">
                              <b>Share the link or QR code below</b>. Whoever opens it follows
                              the song and the key you&apos;re reading it in, live — no account
                              needed on their side.
                            </p>
                          )}

                          {broadcast !== null && broadcast !== undefined && (
                            <>
                              {/*
                                * A data URL, not a file the browser fetches — `next/image`
                                * optimizes requests to a source, and there is no source here
                                * but the string already in memory. A plain `<img>` is the whole
                                * of what this needs.
                                */}
                              {qr !== null ? (
                                // eslint-disable-next-line @next/next/no-img-element -- data URL held in memory, not a fetched image `next/image` could optimize
                                <img
                                  src={qr}
                                  alt="QR code for the link that follows this broadcast"
                                  className="mx-auto block h-auto w-36 rounded-[var(--r-md)]"
                                />
                              ) : (
                                <div
                                  className="mx-auto h-36 w-36 rounded-[var(--r-md)] bg-[var(--surface-2)]"
                                  aria-hidden
                                />
                              )}

                              {/*
                                * Selectable rather than only copyable: the button beside it
                                * can be refused by the browser, but a long-press on plain
                                * text cannot.
                                */}
                              <p className="select-all break-all text-center text-xs text-muted">
                                {followUrl(broadcast.token)}
                              </p>

                              <button
                                type="button"
                                className="btn btn-sm w-full"
                                onClick={() => void copyLink()}
                              >
                                {copied ? <IconCheck size={14} /> : null}
                                {copied ? 'Copied' : 'Copy link'}
                              </button>

                              {/*
                                * Who is actually there. Directly under the button and in the
                                * same muted xs as the link line above it, so the link, the
                                * count and the way to copy read as one block rather than as
                                * a status widget bolted on: without it, a friend who cannot
                                * get in and the leader are both looking at what appears to
                                * be a fault.
                                *
                                * Never `notice-error` and never coloured. A full broadcast
                                * is the plan working, and painting it red tells a leader to
                                * go looking for a bug. The second sentence appears only when
                                * the cap is real and reached, and it names the mechanism
                                * rather than a purchase — «that's all this plan follows»
                                * invites an action that does not exist yet, since there is
                                * no pricing screen to send anybody to, so it reads as a dead
                                * end dressed as an upsell. It is also deliberately the same
                                * fact in the same words the refused guest's own screen uses,
                                * so the two people are reading one explanation instead of
                                * two.
                                *
                                * The condition is `audienceIsFull` and not a comparison
                                * written here, because it is not the obvious one: a cap of 0
                                * or a count that has passed the cap — both of which a plan
                                * lapsing under a live broadcast produces, since the
                                * broadcast is deliberately never interrupted — are states
                                * where no place will ever free up, and this hint would be a
                                * promise the app cannot keep. `plans/types.ts` owns that
                                * judgement next to the sentence it has to agree with.
                                *
                                * «a couple of minutes after», not «as soon as»: a slot is
                                * held for a while past the last heartbeat, so that a phone
                                * whose screen locked for one song keeps its place. Saying
                                * «as soon as» would send a leader watching a number that is
                                * about to be right and looks stuck.
                                */}
                              {audience !== null && (
                                <p className="text-center text-xs text-muted">
                                  {audienceSentence(audience.following, audience.devices)}
                                  {audienceIsFull(audience.following, audience.devices) &&
                                    ' A place frees up a couple of minutes after one of them closes the link.'}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="sing-step">
                        <span className="sing-step-num" aria-hidden>
                          2
                        </span>
                        <div className="sing-step-body">
                          <p className="text-sm text-muted">
                            <b>Press play on the song</b> you want everyone to see. Whatever
                            you&apos;re reading becomes what shows up on their screens, in the
                            same key.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {error !== null && (
                    <p className="notice notice-error mt-3" role="alert">
                      {error}
                    </p>
                  )}

                  {broadcast === null && !askFailed && (
                    <button
                      type="button"
                      className="btn btn-primary mt-3 w-full"
                      onClick={() => void startSinging()}
                      disabled={busy}
                    >
                      <IconBroadcast size={16} />
                      Start broadcasting
                    </button>
                  )}

                  {broadcast !== null && broadcast !== undefined && (
                    <button
                      type="button"
                      className="btn btn-ink mt-3 w-full"
                      onClick={() => void stopSinging()}
                      disabled={busy}
                    >
                      <IconBroadcast size={16} />
                      Stop broadcasting
                    </button>
                  )}
                </div>
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

      {planNotice !== null && (
        <PlanUpgradeModal notice={planNotice} onClose={() => setPlanNotice(null)} />
      )}
    </div>
  )
}
