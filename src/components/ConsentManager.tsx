'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { acceptedClickId } from '@/lib/consent/actions'
import {
  deleteBrowserCookie,
  gtagLoaded,
  loadGtag,
  readBrowserCookie,
  storeConsent,
  tellPage,
  trackSignup,
  withdrawConsent,
} from '@/lib/consent/gtag'
import { parseRegion } from '@/lib/consent/region'
import { adsConfig, bannerAllowedOn, decideConsent, parseConsent, tagAllowedOn } from '@/lib/consent/state'
import {
  AD_CLICK_COOKIE,
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
    adClick: readBrowserCookie(AD_CLICK_COOKIE) === '1',
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
  const [asked, setAsked] = useState(false)
  /*
   * Whether the page on screen is the landing page — read from the DOM, not from RoleProvider.
   * `/` is the landing page for a visitor and the songbooks for a reader, and the identity
   * RoleProvider holds can be a navigation behind: `verifyEmail` answers with `redirect('/')`,
   * a client navigation, so for a moment it still says «signed out» over the reader's own home.
   * `.landing-hero` exists only in `Landing`, which only a visitor is ever rendered.
   */
  const [landing, setLanding] = useState(false)
  /* The query the banner is judged with (`bannerAllowedOn`), read with `landing`. Every decision
     to *load* reads `location.search` live instead: a redirect that changes only the query — the
     unverified sign-in's `/login?…&email=…` — keeps the pathname and does not re-run the effect. */
  const [search, setSearch] = useState('')
  const [reopened, setReopened] = useState(false)
  const [granted, setGranted] = useState(false)
  /* True between «Accept» and the tag loading with the recovered gclid: a navigation in that
     window must not load it first without one, since a second `loadGtag` is a no-op. */
  const accepting = useRef(false)
  /* A gclid recovered by an «Accept» given on a page the tag may not load on (through «Cookie
     settings»), kept for the first page it may. */
  const pendingClick = useRef<string | null>(null)

  /* Re-read on every navigation: the signup cookie arrives with a server redirect, which is a
     client navigation for this component — it does not remount. */
  useEffect(() => {
    if (!config) return
    setLanding(document.querySelector('.landing-hero') !== null)
    setSearch(location.search)
    const decision = currentDecision()
    setAsked(decision.ask)
    setGranted(decision.load)
    if (!decision.load) return

    /* During an accept in flight the loader waits for its gclid — see `accepting`. */
    if (accepting.current) return
    if (tagAllowedOn(pathname, location.search)) {
      loadGtag(config, pendingClick.current)
      pendingClick.current = null
    }
    /* Loaded here or on an earlier page of this document, it stays resident — but a hit is only
       ever sent from a page it may be loaded on, since every hit carries the real address. The
       signup cookie waits (ten minutes) for one; `verifyEmail` lands on `/`, which is. */
    if (!gtagLoaded()) return
    tellPage()
    if (!tagAllowedOn(pathname, location.search)) return
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
    accepting.current = true
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
    /* `location`, not the render's `pathname`: the reader may have moved on during the await. */
    if (tagAllowedOn(location.pathname, location.search)) loadGtag(config, clickId)
    else pendingClick.current = clickId
    accepting.current = false
    /* Anything that happened while the gclid was being fetched — a signup cookie on the page
       reached meanwhile — is picked up by the next navigation's pass, like any other page. */
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

  const show = reopened || (asked && bannerAllowedOn(pathname, landing, search))
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
