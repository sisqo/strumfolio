/**
 * Google's tag, in the browser — loaded only once `decideConsent` answers `load`, and never
 * before. Every function here is a no-op until then, so a caller (the checkout, the signup
 * conversion) never has to ask whether consent was given: the answer is whether this ran.
 *
 * Browser-only: import it from client components alone.
 */

import { serializeConsent, tagPageLocation, tagReferrer, type AdsConfig } from './state'
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_VERSION,
  type AdsConsent,
} from './types'

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

let loadedFor: AdsConfig | null = null

/** A cookie's value from `document.cookie`, or null. */
export function readBrowserCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return null
}

export function deleteBrowserCookie(name: string, domain?: string): void {
  const scope = domain ? `; Domain=${domain}` : ''
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${scope}`
}

/** Record the reader's answer. Essential: it is the record of the consent itself. */
export function storeConsent(ads: AdsConsent): void {
  const value = serializeConsent({ version: CONSENT_VERSION, ads, at: Date.now() })
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`
}

export function gtagLoaded(): boolean {
  return loadedFor !== null
}

/**
 * Load gtag.js with the ad signals granted.
 *
 * `consent default` comes first even in basic mode, all denied, so that the one moment the tag
 * exists without a `consent update` is a moment it can do nothing; `ad_personalization` is never
 * granted, because there is no remarketing, and `allow_ad_personalization_signals: false` says
 * the same thing a second way.
 *
 * `clickId` is the gclid this browser arrived with, recovered from `songbook-attribution` when
 * the reader accepts on a page after the one they landed on — by then the gclid has left the URL
 * and the tag would never write `_gcl_aw`, so every conversion from that click would be
 * unattributed. So it is put back into the URL for exactly as long as the tag takes to read it —
 * measured on 2026-09-27: that writes `_gcl_aw`, while passing it as `page_location` alone does
 * not. Only when the URL has no gclid of its own: a fresh click wins.
 *
 * Fails silently: the app is used offline on stage, and a script that cannot load must neither
 * throw nor wait for anything.
 */
export function loadGtag(config: AdsConfig, clickId: string | null): void {
  if (loadedFor || typeof window === 'undefined') return
  loadedFor = config

  window.dataLayer = window.dataLayer ?? []
  window.gtag = function gtag() {
    // gtag.js reads the `arguments` object itself, not an array copy of it.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments)
  }

  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
  })
  window.gtag('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted' })
  window.gtag('js', new Date())
  tellPage()

  const current = new URL(location.href)
  let restore: string | null = null
  let borrowed: string | null = null

  if (clickId && !current.searchParams.has('gclid')) {
    const withClick = new URL(current)
    withClick.searchParams.set('gclid', clickId)
    borrowed = withClick.href
    restore = current.href
    history.replaceState(history.state, '', borrowed)
  }

  const putBack = () => {
    /* Only if nobody has navigated meanwhile — never drag a reader back to where they were. */
    if (restore !== null && location.href === borrowed) {
      history.replaceState(history.state, '', restore)
    }
    restore = null
  }

  /*
   * The page view is sent by hand so that its `event_callback` says when the tag has read the
   * URL. Restoring on the script's `onload` was measured too early (2026-09-27): the queue is
   * processed after it, the tag read the restored URL, and `_gcl_aw` was never written. The
   * timeout bounds how long the gclid can sit in the address bar when Google does not answer.
   */
  /* `allow_enhanced_conversions: false` so that a switch in the Ads dashboard cannot start
     reading email fields off our forms with no change here. */
  window.gtag('config', config.id, {
    allow_ad_personalization_signals: false,
    allow_enhanced_conversions: false,
    send_page_view: false,
    ...pageFields(),
  })
  window.gtag('event', 'page_view', {
    send_to: config.id,
    ...pageFields(),
    event_callback: putBack,
    event_timeout: 3000,
  })

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.id)}`
  script.onerror = putBack
  document.head.appendChild(script)
  /* A last resort if neither callback ever fires. */
  window.setTimeout(putBack, 5000)
}

/**
 * Tell the tag which page it is on — the sanitised address (`tagPageLocation`), never
 * `location.href`, which on `/verify` carries an email address and the token that chooses the
 * password. Called before the first hit, and by `ConsentManager` on every client navigation,
 * because the tag stays resident across them and would otherwise read the real address.
 */
export function tellPage(): void {
  if (!loadedFor) return
  window.gtag?.('set', pageFields())
}

/**
 * The sanitised address, for `set` and for every hit as well. Measured on 2026-09-27: `set`
 * alone left the first page view of a full load (`/follow/<token>`) on the real address, so
 * `config`, the page view and each conversion carry it explicitly too.
 */
function pageFields(): { page_location: string; page_referrer: string } {
  return {
    page_location: tagPageLocation(location.href),
    page_referrer: tagReferrer(document.referrer, location.origin),
  }
}

/**
 * Withdraw: tell the tag, delete the `_gcl_*` cookies it wrote on this host and its parent
 * domain, and reload so no instance of the tag survives in memory. The reload is the only
 * dependable way to unload a script, and a withdrawal is rare enough to pay for it.
 */
export function withdrawConsent(): void {
  storeConsent('denied')
  window.gtag?.('consent', 'update', { ad_storage: 'denied', ad_user_data: 'denied' })

  const host = location.hostname
  const domains = [undefined, host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`]
  for (const part of document.cookie.split(';')) {
    const name = part.trim().split('=')[0]
    if (!name.startsWith('_gcl_')) continue
    for (const domain of domains) deleteBrowserCookie(name, domain)
  }

  location.reload()
}

export function trackSignup(): void {
  if (!loadedFor) return
  window.gtag?.('event', 'conversion', { send_to: `${loadedFor.id}/${loadedFor.signupLabel}`, ...pageFields() })
}

/**
 * A first purchase. `transactionId` is Paddle's, so Ads counts one conversion per transaction
 * however many times the callback fires. The value is the total charged, tax included — which,
 * with every price `tax_mode: internal`, is the list price (`prices.ts`) less any coupon.
 */
export function trackPurchase(purchase: { transactionId: string; value: number; currency: string }): void {
  if (!loadedFor) return
  window.gtag?.('event', 'conversion', {
    send_to: `${loadedFor.id}/${loadedFor.purchaseLabel}`,
    value: purchase.value,
    currency: purchase.currency,
    transaction_id: purchase.transactionId,
    ...pageFields(),
  })
}
