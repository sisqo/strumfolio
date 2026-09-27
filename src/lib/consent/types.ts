/**
 * The constants behind the consent banner, shared by the middleware (edge), the server actions
 * and the browser — so nothing here may import anything that is not all three.
 *
 * `src/lib/consent/CLAUDE.md` has the decisions; this file only names things.
 */

/**
 * The reader's answer: `v:ads:at`, e.g. `1:granted:1790000000000`. Not `httpOnly`, because the
 * page's own script is what loads the tag, and essential rather than consented-to, since it is
 * the record of the consent itself.
 */
export const CONSENT_COOKIE = 'songbook-consent'

/**
 * Whether this visit needs to be asked at all: `eea` or `other`, written by the middleware from
 * Vercel's geolocation header. Not `httpOnly` for the same reason as the consent cookie — the
 * landing page, the blog and the tools are prerendered, so only the browser can act on it.
 */
export const REGION_COOKIE = 'songbook-region'

/**
 * `1` when this browser's attribution cookie holds a Google Ads click (a gclid), written by the
 * middleware beside it. Inside the EEA it is what makes the banner appear by itself: a visitor
 * who never arrived from one of our advertisements has no Ads conversion to measure, so they are
 * not asked, and the tag stays unloaded unless they open «Cookie settings» themselves. Not
 * `httpOnly`, since the prerendered pages can only act on it in the browser; `songbook-attribution`
 * itself stays `httpOnly`, and this carries one bit of it, never the click id.
 */
export const AD_CLICK_COOKIE = 'songbook-ad-click'

/**
 * Set by the server on the one request that creates an account, and only when the tag may run;
 * read and deleted by `ConsentManager` on the next page, which fires the signup conversion. It
 * exists only for Google Ads, which is why nothing writes it before a «yes».
 */
export const SIGNUP_CONVERSION_COOKIE = 'songbook-conv-signup'

/** Long enough for the redirect after verification to land, short enough to mean «just now». */
export const SIGNUP_CONVERSION_MAX_AGE_SECONDS = 10 * 60

/**
 * Bumped whenever what a «yes» agrees to changes — a new purpose, a new recipient. A stored
 * answer carrying an older version is treated as no answer, so the banner asks again.
 */
export const CONSENT_VERSION = 1

/**
 * Six months: the Garante's guidance is not to ask again sooner after a refusal, and a consent
 * kept longer than that is the part of the same guidance a regulator would question first.
 */
export const CONSENT_MAX_DAYS = 182

export const CONSENT_MAX_AGE_SECONDS = CONSENT_MAX_DAYS * 24 * 60 * 60

/** Rewritten on any request whose country changed, so a day is plenty. */
export const REGION_MAX_AGE_SECONDS = 24 * 60 * 60

export type AdsConsent = 'granted' | 'denied'

export type Region = 'eea' | 'other'

export interface ConsentChoice {
  version: number
  ads: AdsConsent
  /** Epoch milliseconds of the answer. */
  at: number
}

/** Dispatched on `window` by «Cookie settings» to open the banner wherever the reader is. */
export const CONSENT_OPEN_EVENT = 'strumfolio:consent-open'
