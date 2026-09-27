/**
 * Every decision the consent UI makes, pure, so `npm test` covers each branch and the browser,
 * the server actions and the middleware all ask the same function.
 *
 * Consent Mode **basic**: Google's tag is either loaded with the ad signals granted, or not
 * loaded at all. Nothing is sent before an answer and nothing after a refusal — there are no
 * «cookieless pings», which is what lets the Cookie Policy say so without an exception.
 */

import type { Attribution } from '@/lib/attribution/touch'
import { isOutsideAppPath } from '@/lib/publicRoutes'

import {
  CONSENT_MAX_DAYS,
  CONSENT_VERSION,
  type AdsConsent,
  type ConsentChoice,
  type Region,
} from './types'

/** The Google Ads account and the two conversion actions. All three, or the feature is off. */
export interface AdsConfig {
  id: string
  signupLabel: string
  purchaseLabel: string
}

/**
 * The configuration, from whichever environment the caller has. Returns null unless all three
 * values are present and the id looks like an Ads id: an `AW-` typo must switch the feature off,
 * never load a tag that reports to nobody behind a banner that asked for nothing.
 *
 * Takes the values rather than reading `process.env` itself because `NEXT_PUBLIC_*` is inlined
 * only where it is written out literally — see `adsConfig()` below.
 */
export function adsConfigFrom(
  id: string | undefined,
  signupLabel: string | undefined,
  purchaseLabel: string | undefined,
): AdsConfig | null {
  const cleanId = id?.trim() ?? ''
  const signup = signupLabel?.trim() ?? ''
  const purchase = purchaseLabel?.trim() ?? ''
  if (!/^AW-\d+$/.test(cleanId) || signup === '' || purchase === '') return null
  return { id: cleanId, signupLabel: signup, purchaseLabel: purchase }
}

/** This build's configuration. Spelled out in full so Next.js inlines each variable. */
export function adsConfig(): AdsConfig | null {
  return adsConfigFrom(
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
    process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL,
    process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL,
  )
}

export function serializeConsent(choice: ConsentChoice): string {
  return `${choice.version}:${choice.ads}:${choice.at}`
}

/**
 * A stored answer, or null when there is none worth honouring: malformed, from an older
 * `CONSENT_VERSION`, dated in the future, or older than `CONSENT_MAX_DAYS`. The cookie's own
 * `Max-Age` already expires it; the date check is for a browser that kept it anyway.
 */
export function parseConsent(raw: string | null | undefined, now: number): ConsentChoice | null {
  if (!raw) return null
  const match = /^(\d+):(granted|denied):(\d+)$/.exec(decodeURIComponent(raw))
  if (!match) return null

  const version = Number(match[1])
  const ads = match[2] as AdsConsent
  const at = Number(match[3])
  if (version !== CONSENT_VERSION) return null
  if (at > now + 60_000) return null
  if (now - at > CONSENT_MAX_DAYS * 24 * 60 * 60 * 1000) return null

  return { version, ads, at }
}

export interface ConsentDecision {
  /** Load Google's tag, with `ad_storage` and `ad_user_data` granted. */
  load: boolean
  /** Show the banner by itself (where `bannerAllowedOn` also agrees). «Cookie settings» opens it regardless. */
  ask: boolean
}

/**
 * What to do for this browser.
 *
 * - Not configured: nothing at all — no banner, no tag.
 * - An answer on record wins everywhere, a «no» from outside the EEA included: «Cookie settings»
 *   is available to everybody precisely so that it means something.
 * - No answer, outside the EEA/UK/CH: the tag runs and nobody is asked.
 * - No answer, inside (or unknown, which `parseRegion` already folded into `eea`), arrived from
 *   one of our advertisements (`adClick`): ask, and load nothing until the answer.
 * - No answer, inside, never arrived from an advertisement: nothing — no banner, no tag. There
 *   is no Ads conversion of theirs to measure, so an organic visitor is not interrupted; the
 *   cost is the view-through conversions of somebody who saw an ad and came back by search.
 */
export function decideConsent(input: {
  configured: boolean
  choice: ConsentChoice | null
  region: Region
  adClick: boolean
}): ConsentDecision {
  if (!input.configured) return { load: false, ask: false }
  if (input.choice) return { load: input.choice.ads === 'granted', ask: false }
  if (input.region === 'other') return { load: true, ask: false }
  return { load: false, ask: input.adClick }
}

/**
 * Where the banner may appear on its own. The public pages and the checkout — where somebody
 * arriving from an advertisement is — and never a reading or editing screen: the installed app
 * is used on stage, and a card over a song is the one thing it must never show.
 *
 * - `/` is the landing page only for a visitor; a reader's `/` is their songbooks.
 * - `/follow/…` is a guest reading along during a performance — a reading screen.
 * - `/qa` and `/pay` are not destinations anybody arrives at from an advertisement.
 *
 * «Cookie settings» opens the banner anywhere, whatever this says.
 */
export function bannerAllowedOn(pathname: string, visitor: boolean): boolean {
  if (pathname === '/') return visitor
  if (pathname.startsWith('/follow/')) return false
  if (pathname === '/qa' || pathname === '/pay') return false
  if (/^\/checkout\/[^/]+$/.test(pathname)) return true
  return isOutsideAppPath(pathname)
}

/**
 * The gclid to hand the tag after a late «yes»: the most recent Google click this browser's
 * attribution cookie remembers, or null. The last touch first, since it is the click the
 * conversion belongs to; the first touch only when the last one was not a Google click at all
 * (`last` is null when it would repeat `first`).
 */
export function gclidOf(attribution: Attribution | null): string | null {
  if (!attribution) return null
  for (const touch of [attribution.last, attribution.first]) {
    if (touch?.clickIdKind === 'gclid' && touch.clickId) return touch.clickId
  }
  return null
}
