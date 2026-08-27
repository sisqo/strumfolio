'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

import { PlanUpgradeModal, type PlanNotice } from '@/components/PlanUpgradeModal'
import { useStrumTogether } from '@/components/StrumTogetherProvider'
import { IconBroadcast, IconCheck } from '@/components/icons'
import { audienceIsFull, audienceSentence } from '@/lib/plans/types'
import { followUrl } from '@/lib/strumTogether/link'

/**
 * The Strum Together screen — the QR, the link, the two steps, start and stop — shared
 * between the hamburger menu's own wide panel and the reading bar's own toggle
 * (v3.15): the two must open literally the same panel, not two versions of it that
 * could say different things about the same broadcast. Everything about *showing* it —
 * where it opens from, what wraps it, how it is dismissed — stays with the caller;
 * this owns only what is inside.
 *
 * `onClose` is called for exactly one reason: a `plan-required` refusal opens
 * `PlanUpgradeModal`, whose own "See plans" link navigates to `/pricing`, and whatever
 * opened this (the menu panel, the bar's popover) must not still be showing over that
 * navigation. Every other outcome — success, a session error, a failed stop — leaves
 * this panel open, since there is more here worth reading (the link, the retry).
 */
export function StrumTogetherPanel({ onClose }: { onClose: () => void }) {
  const { broadcast, askFailed, audience, busy, checkBroadcast, start, stop } = useStrumTogether()
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

  const startSinging = async () => {
    setError(null)
    const result = await start()
    if (result.ok) return

    /*
     * Told apart from every other failure on purpose: «try again» is advice, and it is
     * false advice here — a plan that does not include leading will not start one on the
     * second press either.
     */
    if (result.reason === 'plan-required') {
      setPlanNotice({ reason: 'plan-required', feature: 'Strum Together' })
      onClose()
    } else if (result.reason === 'no-session') {
      setError('Session expired. Reload the page and sign in again.')
    } else {
      setError("Couldn't start. Try again.")
    }
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

  return (
    <div className="px-1.5 pb-1 pt-1">
      {/* Not yet known whether this reader already has one running. */}
      {broadcast === undefined && <p className="text-sm text-muted">One moment…</p>}

      {broadcast === null && askFailed && (
        /*
         * Not the Start button: asking whether one is already running is what failed,
         * and Start would answer a different question. Offering it here risks a reader
         * with a broadcast already live and shared rotating its token by accident the
         * moment a retry would have shown it was still there.
         */
        <>
          <p className="notice notice-error" role="alert">
            Couldn&apos;t check whether you already have one running.
          </p>
          <button type="button" className="btn btn-sm mt-3 w-full" onClick={checkBroadcast}>
            Try again
          </button>
        </>
      )}

      {/*
        * The two steps, said in full, every time this view is reachable — not only
        * before the first broadcast: someone who stopped and reopened this a week later
        * needs the reminder as much as someone seeing it for the first time. Step one's
        * own body doubles as where the QR and link appear once there is a broadcast to
        * show them for; before that, it is just the sentence explaining what sharing the
        * link will do.
        */}
      {broadcast !== undefined && !askFailed && (
        <div className="sing-steps">
          <div className="sing-step">
            <span className="sing-step-num" aria-hidden>
              1
            </span>
            <div className="sing-step-body">
              {/*
                * Two readings of the same step, not one sentence softened for the state
                * that has nothing to show yet: before a broadcast exists, the lead
                * phrase names the tap that makes the link appear; once it does, «below»
                * is true and the phrase says so.
                */}
              {broadcast === null ? (
                <p className="text-sm text-muted">
                  <b>Start broadcasting</b> and <b>share the link or QR code</b> in next page.
                  Whoever opens it follows the song and the key you&apos;re reading it in,
                  live — no account needed on their side.
                </p>
              ) : (
                <p className="text-sm text-muted">
                  <b>Share the link or QR code below</b>. Whoever opens it follows the song
                  and the key you&apos;re reading it in, live — no account needed on their
                  side.
                </p>
              )}

              {broadcast !== null && broadcast !== undefined && (
                <>
                  {/*
                    * A data URL, not a file the browser fetches — `next/image` optimizes
                    * requests to a source, and there is no source here but the string
                    * already in memory. A plain `<img>` is the whole of what this needs.
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
                    * Selectable rather than only copyable: the button beside it can be
                    * refused by the browser, but a long-press on plain text cannot.
                    */}
                  <p className="select-all break-all text-center text-xs text-muted">
                    {followUrl(broadcast.token)}
                  </p>

                  <button type="button" className="btn btn-sm w-full" onClick={() => void copyLink()}>
                    {copied ? <IconCheck size={14} /> : null}
                    {copied ? 'Copied' : 'Copy link'}
                  </button>

                  {/*
                    * Who is actually there. Directly under the button and in the same
                    * muted xs as the link line above it, so the link, the count and the
                    * way to copy read as one block rather than as a status widget bolted
                    * on: without it, a friend who cannot get in and the leader are both
                    * looking at what appears to be a fault.
                    *
                    * Never `notice-error` and never coloured. A full broadcast is the
                    * plan working, and painting it red tells a leader to go looking for a
                    * bug. The second sentence appears only when the cap is real and
                    * reached, and it names the mechanism rather than a purchase.
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
                you&apos;re reading becomes what shows up on their screens, in the same
                key.
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

      {planNotice !== null && <PlanUpgradeModal notice={planNotice} onClose={() => setPlanNotice(null)} />}
    </div>
  )
}
