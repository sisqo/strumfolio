'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { useRole } from '@/components/RoleProvider'
import { acceptedClickId } from '@/lib/consent/actions'
import {
  deleteBrowserCookie,
  loadGtag,
  readBrowserCookie,
  storeConsent,
  trackSignup,
  withdrawConsent,
} from '@/lib/consent/gtag'
import { parseRegion } from '@/lib/consent/region'
import { adsConfig, bannerAllowedOn, decideConsent, parseConsent } from '@/lib/consent/state'
import {
  CONSENT_COOKIE,
  CONSENT_OPEN_EVENT,
  REGION_COOKIE,
  SIGNUP_CONVERSION_COOKIE,
} from '@/lib/consent/types'

const config = adsConfig()

function currentDecision() {
  return decideConsent({
    configured: config !== null,
    choice: parseConsent(readBrowserCookie(CONSENT_COOKIE), Date.now()),
    region: parseRegion(readBrowserCookie(REGION_COOKIE)),
  })
}

/**
 * The consent banner and the tag loader, mounted once in the root layout.
 *
 * **The loader runs on every page, the banner only on some.** The tag has to be present wherever
 * a conversion happens — the signed-in `/` a verification lands on, the checkout — while the
 * banner appears by itself only where `bannerAllowedOn` says, and anywhere at all when «Cookie
 * settings» asks for it. Withdrawing is as easy as agreeing, on every screen the tag runs on.
 *
 * Renders nothing and loads nothing when Ads is not configured.
 */
export function ConsentManager() {
  const pathname = usePathname()
  const { known, email } = useRole()
  const [asked, setAsked] = useState(false)
  const [reopened, setReopened] = useState(false)
  const [granted, setGranted] = useState(false)

  /* Re-read on every navigation: the signup cookie arrives with a server redirect, which is a
     client navigation for this component — it does not remount. */
  useEffect(() => {
    if (!config) return
    const decision = currentDecision()
    setAsked(decision.ask)
    setGranted(decision.load)
    if (!decision.load) return

    loadGtag(config, null)
    if (readBrowserCookie(SIGNUP_CONVERSION_COOKIE) !== null) {
      deleteBrowserCookie(SIGNUP_CONVERSION_COOKIE)
      trackSignup()
    }
  }, [pathname])

  useEffect(() => {
    const open = () => setReopened(true)
    window.addEventListener(CONSENT_OPEN_EVENT, open)
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open)
  }, [])

  const accept = useCallback(async () => {
    if (!config) return
    storeConsent('granted')
    setAsked(false)
    setReopened(false)
    setGranted(true)
    /* After the cookie is written, so the server action sees the «yes» it waits for. */
    let clickId: string | null = null
    try {
      clickId = await acceptedClickId()
    } catch {
      // Offline: the tag loads without the recovered click, which is the lesser loss.
    }
    loadGtag(config, clickId)
  }, [])

  const reject = useCallback(() => {
    setAsked(false)
    setReopened(false)
    /* A tag already running has to be unloaded, and only a reload does that. */
    if (granted) {
      withdrawConsent()
      return
    }
    storeConsent('denied')
  }, [granted])

  if (!config) return null

  const visitor = known && email === null
  const show = reopened || (asked && bannerAllowedOn(pathname, visitor))
  if (!show) return null

  return (
    <section className="consent-banner" role="dialog" aria-modal="false" aria-labelledby="consent-title">
      <button type="button" className="consent-banner-close" aria-label="Reject and close" onClick={reject}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
      <h2 id="consent-title" className="consent-banner-title">
        Measure our ads?
      </h2>
      <p className="consent-banner-text">
        If you accept, Google Ads sets cookies so we can tell which of our ads led to a sign-up or a
        purchase. No personalised ads, no profile of you. Rejecting changes nothing else on the site.{' '}
        <Link href="/cookie-policy">Cookie Policy</Link>
      </p>
      {reopened && (
        <p className="consent-banner-state">
          {/* «on», not «accepted»: outside the EEA it can be on without anybody having said yes. */}
          Ad measurement is currently {granted ? 'on' : 'off'}.
        </p>
      )}
      <div className="consent-banner-actions">
        <button type="button" className="btn" onClick={reject}>
          Reject
        </button>
        <button type="button" className="btn" onClick={() => void accept()}>
          Accept
        </button>
      </div>
    </section>
  )
}
