/**
 * Where a visit came from, decided by pure functions — the whole of this feature's judgement,
 * in the one module that can be tested.
 *
 * A plain module with **no `@/lib/db` import, no `'use server'` and no Node built-in**, because
 * its only caller that matters runs in `middleware.ts`, on the edge: there is no database there
 * (the reason `rememberUrlCoupon` is a client effect and not middleware) and there is no
 * `node:crypto` either — a scar `accounts/current.ts` already carries in its own header. Keep
 * it that way. Everything here takes what it needs as an argument and reads no clock of its
 * own, which is what lets `touch.test.ts` state the rules as facts rather than as fixtures.
 *
 * The rules themselves, in three lines, because getting one of them backwards is silent:
 *
 * 1. An arrival carrying any `utm_*` or a click id is **always a new touch**: it fills the
 *    first if there is none, and it always replaces the last.
 * 2. An arrival with an external `Referer` and no parameters fills **only the first touch, and
 *    only when there is none**. It never replaces anything.
 * 3. Anything else — an internal navigation, a denied host, a one-time email link — is not a
 *    touch at all.
 *
 * Rule 2 is not caution, it is a bug that was designed out: after a Google sign-in the browser
 * comes back to the site **with `Referer: accounts.google.com`**, and the return from Paddle
 * does the same. Were any external referer a touch, every single Google sign-in would rewrite
 * that reader's attribution to «google / referral» and erase the campaign that actually brought
 * them — with nothing failing anywhere to say so.
 */

/**
 * The cookie this feature writes, named like its siblings (`songbook-coupon`,
 * `songbook-account`, `songbook-device`).
 */
export const ATTRIBUTION_COOKIE = 'songbook-attribution'

/**
 * Ninety days, the lookback window every advertising network measures conversions over — so
 * these numbers can be read beside Google's and Meta's own without converting anything in your
 * head. The coupon cookie's thirty would have been the tidier number and the wrong one: the
 * ordinary path into this app is a tool or an article found in a search and the app tried
 * months later, which thirty days records as «direct».
 *
 * Restarted on every new touch, not counted from the first: the window is «how long a touch
 * stays relevant», and a reader who came back yesterday has a relevant touch.
 */
export const ATTRIBUTION_COOKIE_MAX_DAYS = 90

/**
 * How long any single recorded value may be.
 *
 * Every one of them is a string chosen by whoever built the URL, which is to say by anybody at
 * all, and it travels in a request header on every subsequent request. Eighty characters is
 * longer than any real campaign name and short enough that a full payload stays well inside
 * `COOKIE_MAX_BYTES` below.
 */
const VALUE_MAX_LENGTH = 80

/**
 * The ceiling on the encoded cookie. Over this the payload is thinned rather than dropped — see
 * `encodeAttribution`, which sheds `term` and `content` first and the whole last touch second,
 * because losing the campaign entirely to save a `utm_content` is the wrong trade.
 */
const COOKIE_MAX_BYTES = 2048

/**
 * Paths that are never an arrival, whatever they carry.
 *
 * All three are opened from a one-time link in an email we sent, so they are in
 * `SESSION_FREE_PATHS` and the middleware does run on them — and without this an empty cookie
 * plus a mail client's own referer would write a first touch of «direct → /verify». It would
 * break nothing (the row already exists by then, and neither seam that fills the pointer reads
 * the cookie) and it would be noise in the one table built to be believed.
 *
 * Deliberately **not** every email link: a newsletter link is an email we sent too, it carries
 * `utm_*`, and recording it is half the point of the feature.
 */
const NEVER_A_TOUCH = new Set(['/verify', '/forgot-password', '/reset-password'])

/**
 * Hosts whose referer is discarded even for a first touch.
 *
 * Each is a place a reader is sent *by us* and comes back from, so the referer names our own
 * plumbing rather than anything about where they came from. `accounts.google.com` is the live
 * one — every Google sign-in returns through it — and Paddle's checkout is the same shape.
 *
 * **`google.com` is deliberately absent.** A referer of `www.google.com` is organic search,
 * which is a genuine and valuable answer; only the OAuth host is ours.
 *
 * A constant, and there is no alternative that works: `app_settings` lives in the database and
 * this runs on the edge, and an environment variable is baked in at build time — so changing
 * one without a code change needs the manual `vercel redeploy` the root `CLAUDE.md` records as
 * blocked by the auto-mode classifier. This list is therefore the only form of it that can be
 * changed, tested and read in a diff. **A host missing from it breaks nothing and says
 * nothing**: it quietly dirties the first touch of readers who had none. Add the reason beside
 * any new entry, so the next person does not prune it.
 */
const DENIED_REFERER_HOSTS = new Set(['accounts.google.com', 'checkout.paddle.com', 'buy.paddle.com', 'sandbox-checkout.paddle.com'])

/** Every host this installation has ever answered on, so its own pages never read as a referral. */
const OWN_HOSTS = new Set(['strumfolio.com', 'www.strumfolio.com', 'strumfolio.sisqo.dev', 'songbook.sisqo.dev', 'localhost'])

/** The click id parameters worth keeping, in the order a single click would be believed. */
const CLICK_ID_PARAMS: readonly { param: string; kind: string }[] = [
  { param: 'gclid', kind: 'gclid' },
  { param: 'fbclid', kind: 'fbclid' },
  { param: 'msclkid', kind: 'msclkid' },
]

/**
 * Paths recorded exactly as they arrived, because which one converted is information.
 *
 * `/blog` and `/tools` are prefixes rather than entries: which article, and which tool, is half
 * the value of this feature for a product that publishes — and both are finite sets of
 * hand-written pages, so they cannot grow into thousands of distinct values the way a song slug
 * could. Everything else falls to `normalizeLandingPath`'s collapse.
 */
const WHOLE_PATHS = new Set(['/', '/login', '/pricing', '/register', '/changelog'])
const WHOLE_PREFIXES = ['/blog', '/tools']

/**
 * Paths recorded as the prefix alone, whatever follows it.
 *
 * `/follow/<token>` is the reason this exists and, at present, the whole of it: the segment
 * after it is a broadcast token, which must never reach a marketing table, and collapsing to
 * `/follow` is also what gives `readTouch` a single value to recognise the word-of-mouth
 * channel by. The generic collapse below would answer `/follow/*`, which is neither.
 */
const COLLAPSED_PREFIXES = ['/follow']

/** One arrival, as it is stored. `null` everywhere means «we know nothing about that field». */
export interface Touch {
  source: string | null
  medium: string | null
  campaign: string | null
  term: string | null
  content: string | null
  clickIdKind: string | null
  clickId: string | null
  refererHost: string | null
  /** Always known: it is the path the request asked for, normalized. */
  landingPath: string
  /** ISO 8601, passed in rather than read, so the tests can state a date. */
  at: string
}

/**
 * What the cookie holds. `last` is `null` when it would repeat `first`, which is the ordinary
 * case — one arrival — and keeps the payload at half its worst size.
 */
export interface Attribution {
  first: Touch
  last: Touch | null
}

/**
 * A candidate touch and whether it is allowed to replace the last one. `overwrites` is true for
 * rule 1 and false for rule 2, and it is the only difference between them.
 */
export interface TouchRead {
  touch: Touch
  overwrites: boolean
}

/** Trim, cap, and treat an empty string as absence — a `?utm_source=` is not a source. */
function readValue(raw: string | null): string | null {
  if (raw === null) return null
  const trimmed = raw.trim()
  if (trimmed === '') return null
  return trimmed.slice(0, VALUE_MAX_LENGTH)
}

/**
 * A landing path with nothing unbounded and no token left in it.
 *
 * Two jobs at once. **No secret**: `/follow/<token>` collapses to `/follow`, so a broadcast
 * token never reaches a marketing table. **A finite set of values**: without the collapse every
 * song and every invitation is its own value, and no `GROUP BY` on this column says anything at
 * all. The query string is dropped by the caller before this is ever reached.
 */
export function normalizeLandingPath(pathname: string): string {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (WHOLE_PATHS.has(path)) return path
  if (WHOLE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return path.slice(0, VALUE_MAX_LENGTH)
  }

  const collapsed = COLLAPSED_PREFIXES.find((prefix) => path === prefix || path.startsWith(`${prefix}/`))
  if (collapsed !== undefined) return collapsed

  const segments = path.split('/').filter((segment) => segment !== '')
  if (segments.length === 0) return '/'
  const first = `/${segments[0]}`
  return segments.length > 1 ? `${first}/*` : first
}

/**
 * Whether a referer host tells us nothing. True for our own pages, for the hosts we send
 * readers to ourselves, and for every preview deployment — a `*.vercel.app` referer is this
 * same app under another name.
 */
export function isDeniedRefererHost(host: string, requestHost: string): boolean {
  const lower = host.toLowerCase()
  const bare = lower.replace(/:\d+$/, '')
  if (bare === requestHost.toLowerCase().replace(/:\d+$/, '')) return true
  if (OWN_HOSTS.has(bare)) return true
  if (bare.endsWith('.vercel.app')) return true
  return DENIED_REFERER_HOSTS.has(bare)
}

/** The hostname of a `Referer` header, or `null` when there is none or it will not parse. */
function refererHostOf(referer: string | null): string | null {
  if (referer === null || referer === '') return null
  try {
    return new URL(referer).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Read one arrival, or answer `null` because this is not one.
 *
 * `requestHost` is passed rather than derived so that every host this app answers on counts as
 * its own — a preview deployment included — and `now` is passed for the same reason nothing
 * here reads a clock.
 */
export function readTouch(url: URL, referer: string | null, requestHost: string, now: Date): TouchRead | null {
  const landingPath = normalizeLandingPath(url.pathname)
  if (NEVER_A_TOUCH.has(landingPath)) return null

  const params = url.searchParams
  const source = readValue(params.get('utm_source'))
  const medium = readValue(params.get('utm_medium'))
  const campaign = readValue(params.get('utm_campaign'))
  const term = readValue(params.get('utm_term'))
  const content = readValue(params.get('utm_content'))

  const click = CLICK_ID_PARAMS.map((entry) => ({ kind: entry.kind, value: readValue(params.get(entry.param)) })).find(
    (entry) => entry.value !== null,
  )

  const host = refererHostOf(referer)
  const externalHost = host !== null && !isDeniedRefererHost(host, requestHost) ? host : null

  const tagged = source !== null || medium !== null || campaign !== null || term !== null || content !== null || click !== undefined

  const at = now.toISOString()

  /* Rule 1: anything tagged is a touch that replaces the last one. */
  if (tagged) {
    return {
      overwrites: true,
      touch: {
        source,
        medium,
        campaign,
        term,
        content,
        clickIdKind: click?.kind ?? null,
        clickId: click?.value ?? null,
        refererHost: externalHost,
        landingPath,
        at,
      },
    }
  }

  /*
   * A Strum Together link, opened untagged: the truest word-of-mouth this product has, arriving
   * from WhatsApp or from a QR code that carries no referer at all. Named as a channel so «how
   * many accounts start with one musician inviting another» is a row on the screen rather than
   * a deduction from landing paths.
   *
   * `overwrites: false`, like every other untagged arrival: a leader who invites the same friend
   * to four rehearsals must not overwrite the campaign that friend actually arrived from.
   */
  if (landingPath === '/follow') {
    return {
      overwrites: false,
      touch: {
        source: 'strum-together',
        medium: 'referral',
        campaign: null,
        term: null,
        content: null,
        clickIdKind: null,
        clickId: null,
        refererHost: externalHost,
        landingPath,
        at,
      },
    }
  }

  /* Rule 2: an external referer, and nothing else, fills a first touch that is missing. */
  if (externalHost !== null) {
    return {
      overwrites: false,
      touch: {
        source: externalHost,
        medium: 'referral',
        campaign: null,
        term: null,
        content: null,
        clickIdKind: null,
        clickId: null,
        refererHost: externalHost,
        landingPath,
        at,
      },
    }
  }

  /* Rule 3. */
  return null
}

/** Whether two touches say the same thing about provenance — the date is not part of it. */
function sameProvenance(a: Touch, b: Touch): boolean {
  return (
    a.source === b.source &&
    a.medium === b.medium &&
    a.campaign === b.campaign &&
    a.term === b.term &&
    a.content === b.content &&
    a.clickIdKind === b.clickIdKind &&
    a.clickId === b.clickId &&
    a.landingPath === b.landingPath
  )
}

/**
 * Fold an arrival into what the browser already carried, or answer `null` because nothing
 * changed and there is no reason to write a cookie.
 *
 * The `null` matters beyond tidiness: without it every page view of a signed-out reader would
 * reissue the cookie and restart its ninety days, which would turn «90 days from the last
 * arrival that counted» into «90 days from the last page they looked at».
 */
export function mergeTouch(existing: Attribution | null, read: TouchRead): Attribution | null {
  if (existing === null) return { first: read.touch, last: null }
  if (!read.overwrites) return null

  /* A repeat of the campaign somebody first arrived from is not a second touch worth storing;
     dropping it keeps `last === null` meaning «one provenance, ever». */
  if (sameProvenance(existing.first, read.touch)) return null
  if (existing.last !== null && sameProvenance(existing.last, read.touch)) return null

  return { first: existing.first, last: read.touch }
}

/** The last touch when there is one, else the first — what «where did they come from, most recently» means. */
export function effectiveLastTouch(attribution: Attribution): Touch {
  return attribution.last ?? attribution.first
}

function thinTouch(touch: Touch): Touch {
  return { ...touch, term: null, content: null }
}

/**
 * The cookie value: compact JSON, thinned rather than abandoned when it will not fit.
 *
 * The order of shedding is the order of what is least worth keeping — `utm_term` and
 * `utm_content` first, both of which qualify a campaign already named; the whole last touch
 * second, since the first is the one that cannot be recovered later.
 *
 * **At `VALUE_MAX_LENGTH` of 80 none of that can happen**: two touches with every field at its
 * cap encode to well under `COOKIE_MAX_BYTES`, which `touch.test.ts` pins as a fact rather than
 * leaving to arithmetic. The thinning is here for whoever raises that cap, and the test above it
 * is what tells them the order this sheds in was chosen and not stumbled into.
 */
export function encodeAttribution(attribution: Attribution): string | null {
  const candidates: Attribution[] = [
    attribution,
    { first: thinTouch(attribution.first), last: attribution.last === null ? null : thinTouch(attribution.last) },
    { first: thinTouch(attribution.first), last: null },
  ]

  for (const candidate of candidates) {
    const encoded = JSON.stringify(candidate)
    if (encoded.length <= COOKIE_MAX_BYTES) return encoded
  }

  return null
}

/** Only the shape is trusted: the cookie is `httpOnly`, but a stale one from an older deploy is not. */
function readTouchShape(value: unknown): Touch | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  const landingPath = typeof raw.landingPath === 'string' ? raw.landingPath : null
  const at = typeof raw.at === 'string' ? raw.at : null
  if (landingPath === null || at === null) return null

  const text = (key: string): string | null => (typeof raw[key] === 'string' ? readValue(raw[key] as string) : null)

  return {
    source: text('source'),
    medium: text('medium'),
    campaign: text('campaign'),
    term: text('term'),
    content: text('content'),
    clickIdKind: text('clickIdKind'),
    clickId: text('clickId'),
    refererHost: text('refererHost'),
    landingPath: landingPath.slice(0, VALUE_MAX_LENGTH),
    at,
  }
}

/**
 * Parse the cookie back, answering `null` for anything that is not a whole `Attribution`.
 *
 * Never throws: an unparseable cookie has to read as «this browser carries nothing», so the
 * next real arrival simply starts a first touch. Throwing here would take a sign-in down with
 * it, which no bookkeeping in this repo is allowed to do.
 */
export function decodeAttribution(raw: string | null | undefined): Attribution | null {
  if (raw === null || raw === undefined || raw === '') return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const record = parsed as Record<string, unknown>
    const first = readTouchShape(record.first)
    if (first === null) return null
    return { first, last: readTouchShape(record.last) }
  } catch {
    return null
  }
}
