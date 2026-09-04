'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { OFFER_COLLAPSED_COOKIE } from '@/lib/coupons/types'

/**
 * The offer, as a ticket stub fixed to the foot of the page.
 *
 * Implemented from `Coupon Overlay.dc.html` in the Claude Design project, matched literally —
 * the 136px stub, the 38px numeral, the perforation between them, the dashed code chip in mono,
 * the pill, the × and the collapsed tab. Every value comes from that file's inline styles; the
 * ones that map onto this app's own tokens use the token (`--promo-bg`, `--promo-line`,
 * `--accent`, `--ink`, `--muted`, `--faint`, `--on-accent` are all exact matches), and the three
 * warm tones the mock introduces for the ticket effect are new — see `.coupon-ticket*` in
 * `globals.css`, which also gives them the dark values the mock has no opinion about.
 *
 * **Three pages, not "any page".** The mock's own note says it sits over any page; in this app
 * that would include `/songs/[slug]`, which is read while playing, where a bar fixed to the
 * bottom covers the last lines of a lyric and the auto-scroll control. Mounted on `/pricing`,
 * `/login` and `/checkout/[plan]` instead — the three screens where somebody is deciding
 * whether to pay.
 *
 * **The offer here is not yet applied.** That is what the mock's own controls say: a code to
 * copy and a link to the plans, never an «Apply». So this is the advertisement, and `CouponBar`
 * remains the applied state — the two never show at once (see the pages that mount them). The
 * one thing added beyond the mock: «See the plans» carries `?coupon=`, so pressing it applies
 * the offer rather than leaving the reader to paste back a code they were just shown. A
 * prototype has no querystring to demonstrate that with.
 */
export function CouponOverlay({
  code,
  percent,
  duration,
  headline,
  deadline,
  href,
  initiallyCollapsed = false,
}: {
  code: string
  /** «30» — the numeral alone; the sign is drawn separately at half the size. */
  percent: string
  /** «12 months» / «Forever» — the stub's lower line, upper-cased in CSS. */
  duration: string
  /** «A full year at 30% off, price locked.» — derived by `offerCopy`, never stored. */
  headline: string
  /** «30 days left» / «Ends 20 October» / null for a campaign with no expiry. */
  deadline: string | null
  /** `/pricing?coupon=CODE` — the CTA, which applies the offer as well as going there. */
  href: string
  /**
   * Whether this reader has already collapsed the bar — read from the cookie **by the page**,
   * server-side, and handed down.
   *
   * A prop rather than a `useEffect` reading `document.cookie`, and the first draft did it the
   * other way round. Reading it here meant the component had to render nothing until it had
   * mounted, which cost three things: the bar arrived a frame late, it was absent from the
   * server-rendered HTML entirely, and it needed JavaScript to appear at all. The pages that
   * mount this already call `cookies()` for the coupon itself, so the server read is free — the
   * same argument `Viewer` on `/pricing` makes about a prop that cannot be wrong for a moment
   * first.
   *
   * The *write* stays client-side, through `document.cookie`: this is a per-viewer convenience,
   * not a value anything trusts, so it needs neither `httpOnly` nor a server action. Not
   * `localStorage`, because the server has to be able to read it — and because a promo bar that
   * reappears open on every navigation after being dismissed is exactly what the × exists to
   * prevent.
   */
  initiallyCollapsed?: boolean
}) {
  const [open, setOpen] = useState(!initiallyCollapsed)
  const [copied, setCopied] = useState(false)

  const remember = (collapsed: boolean) => {
    /* Scoped to the whole site and a fortnight — long enough that dismissing means dismissed,
       short enough that the next campaign gets its own chance to be seen. */
    document.cookie = `${OFFER_COLLAPSED_COOKIE}=${collapsed ? '1' : '0'}; path=/; max-age=${collapsed ? 1_209_600 : 0}; samesite=lax`
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      /* No clipboard permission, or an insecure origin. The code is on screen either way, so
         the label still confirms — pretending the copy failed would be less useful than
         letting the reader select it by hand. */
    }
    setCopied(true)
  }

  /* The label goes back to «Copy» on its own, so a reader who returns to the bar later is not
     told a copy they no longer remember making is still in their clipboard. */
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])

  if (!open) {
    return (
      <div className="coupon-overlay">
        <button
          type="button"
          className="coupon-tab"
          onClick={() => {
            setOpen(true)
            remember(false)
          }}
        >
          <span className="coupon-tab-figure">
            {percent}
            <span className="coupon-percent-sign">%</span>
          </span>
          <span className="coupon-tab-label">off for a year</span>
        </button>
      </div>
    )
  }

  return (
    <div className="coupon-overlay">
      {/*
        * `role="region"` with a name rather than `role="complementary"`: this is one named
        * thing on the page, and its name is what tells a screen-reader user why a landmark
        * called "offer" is here at all. Not `role="alert"` — nothing has happened, and an
        * alert interrupts.
        */}
      <div className="coupon-ticket" role="region" aria-label="Current offer">
        <span className="coupon-ticket-stub">
          <span className="coupon-figure">
            {percent}
            <span className="coupon-percent-sign">%</span>
          </span>
          <span className="coupon-off">OFF</span>
          <span className="coupon-duration">{duration}</span>
        </span>
        {/* The perforation. `aria-hidden` because a dashed line is a picture of a ticket, and
            read aloud it is nothing at all. */}
        <span className="coupon-perforation" aria-hidden />

        <span className="coupon-ticket-body">
          <span className="coupon-lines">
            <span className="coupon-headline">{headline}</span>
            <span className="coupon-sub">
              <span>Every songbook, every device, Strum Together included.</span>
              {deadline !== null && (
                <span className="coupon-deadline">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <circle cx="12" cy="12" r="8.5" />
                    <path d="M12 7.6V12l2.8 1.8" />
                  </svg>
                  <span className="coupon-deadline-text">{deadline}</span>
                </span>
              )}
            </span>
          </span>

          <span className="coupon-actions">
            <button type="button" className="coupon-code" onClick={() => void copy()}>
              <span className="coupon-code-text">{code}</span>
              {/* `aria-live` on the label alone, so the confirmation is announced without the
                  whole button being re-read. */}
              <span className="coupon-code-copy" aria-live="polite">
                {copied ? 'Copied' : 'Copy'}
              </span>
            </button>
            <Link href={href} className="coupon-cta">
              See the plans
            </Link>
          </span>

          <button
            type="button"
            className="coupon-close"
            aria-label="Collapse the offer"
            onClick={() => {
              setOpen(false)
              remember(true)
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </span>
      </div>
    </div>
  )
}
