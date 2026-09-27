/**
 * Every decision the consent UI makes, pure, so `npm test` covers each branch and the browser,
 * the server actions and the middleware all ask the same function.
 *
 * Consent Mode **basic**: Google's tag is either loaded with the ad signals granted, or not
 * loaded at all. Nothing is sent before an answer and nothing after a refusal — there are no
 * «cookieless pings», which is what lets the Cookie Policy say so without an exception.
 */

import type { Attribution } from '@/lib/attribution/touch'
import { isOutsideAppPath, isSessionFreePath } from '@/lib/publicRoutes'

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
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    /* A stray `%` would otherwise throw out of the banner and every server action that asks. */
    return null
  }
  const match = /^(\d+):(granted|denied):(\d+)$/.exec(decoded)
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
 * - `/` is the landing page only for a visitor; a reader's `/` is their songbooks. The caller
 *   says which is on screen (`ConsentManager` reads it from the DOM).
 * - `/follow/…` is a guest reading along during a performance — a reading screen.
 * - `/qa` and `/pay` are not destinations anybody arrives at from an advertisement.
 *
 * «Cookie settings» opens the banner anywhere, whatever this says.
 */
export function bannerAllowedOn(pathname: string, visitor: boolean): boolean {
  if (pathname === '/') return visitor
  if (!tagAllowedOn(pathname)) return false
  if (/^\/checkout\/[^/]+$/.test(pathname)) return true
  return isOutsideAppPath(pathname)
}

/**
 * Pages whose address carries a secret or a person, where Google's tag is never loaded: the
 * token that chooses a password (`/verify`), the reset and unsubscribe links, a guest's read
 * link (`/follow/…`), the QA entry and Paddle's `/pay`. Not a detail of the address — **the tag
 * sends the real `location.href` on its `ccm/collect` page view whatever `page_location` says**
 * (measured 2026-09-27: `/follow/<token>` reached Google with `page_location` set to
 * `/follow`), so the only way to keep a secret out of Google is not to load the tag there.
 */
const TAG_NEVER: ReadonlySet<string> = new Set(['/verify', '/reset-password', '/courtesy-unsubscribe', '/qa', '/pay'])

/**
 * Where Google's tag may be loaded at all: `/` (the landing page, and the reader's home the
 * signup conversion fires on), `/checkout/<plan>` (the purchase), and the public pages an
 * advertisement can land on — `TAG_NEVER` and `/follow/…` excepted. Nowhere else inside the
 * app: no conversion happens there, and every address there is the reader's own content.
 * Once loaded the tag stays resident across client navigations, but sends nothing by itself.
 */
export function tagAllowedOn(pathname: string): boolean {
  if (pathname === '/') return true
  if (/^\/checkout\/[^/]+$/.test(pathname)) return true
  if (pathname.startsWith('/follow/') || TAG_NEVER.has(pathname)) return false
  return isSessionFreePath(pathname)
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

/** Google's own click ids, the only query parameters the tag is ever shown. */
const CLICK_PARAMS = ['gclid', 'gbraid', 'wbraid']

/**
 * The URL Google's tag is told it is on — never the real one.
 *
 * gtag.js puts the page's address on every hit (`dl`), and several of this app's addresses carry
 * a secret or a person: `/verify?email=…&token=…` (whose token chooses the account's password),
 * `/reset-password?…`, `/courtesy-unsubscribe?…`, `/follow/<token>` (a guest's read access),
 * `/accounts/<email>`. The Privacy Policy promises Google no email address, and Google's own
 * policy forbids sending one. So:
 *
 * - the query is dropped, except Google's own click ids;
 * - a public page keeps its path, `/follow/…` excepted, which becomes `/follow`;
 * - `/checkout/<plan>` keeps its path — the plan is what the conversion is about;
 * - anything else — every screen inside the app — becomes `/app`: nothing there is an Ads
 *   landing page, and song and songbook slugs are the reader's own content.
 *
 * The hash is dropped too. Anything unparseable becomes the bare origin-less `/app`.
 */
export function tagPageLocation(href: string): string {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return '/app'
  }

  const kept = new URLSearchParams()
  for (const name of CLICK_PARAMS) {
    const value = url.searchParams.get(name)
    if (value) kept.set(name, value)
  }
  /* `toString()`, not `.size`: Safari before 17 has no `size`, and there the gclid would vanish. */
  const serialized = kept.toString()
  const query = serialized === '' ? '' : `?${serialized}`

  const path = url.pathname
  let shown: string
  if (path.startsWith('/follow/')) shown = '/follow'
  else if (/^\/checkout\/[^/]+$/.test(path) || path === '/' || isSessionFreePath(path)) shown = path
  else shown = '/app'

  return `${url.origin}${shown}${query}`
}

/**
 * The referrer the tag is told: another site is reduced to its origin, one of our own pages goes
 * through `tagPageLocation` — the page a reader came from is exactly as secret as the page they
 * are on (a `/verify` link followed to `/`).
 */
export function tagReferrer(referrer: string, ownOrigin: string): string {
  if (!referrer) return ''
  let url: URL
  try {
    url = new URL(referrer)
  } catch {
    return ''
  }
  return url.origin === ownOrigin ? tagPageLocation(referrer) : `${url.origin}/`
}
