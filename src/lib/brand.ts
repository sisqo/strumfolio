/**
 * The app's name and its payoff, in one place.
 *
 * Three surfaces need to agree on the exact string — the page title, the PWA manifest,
 * and the layout's own default description — and a rename typed three times is a
 * rename that drifts the first time only two of the three are found. The public
 * page's hero headline is close to this same idea rather than a copy of it — two
 * short beats instead of one clause — so it keeps its own wording instead of
 * borrowing this one.
 *
 * **British spelling**, and the reach is the point: this string is the page title, the
 * manifest, the root description and the signature under every transactional email, so
 * «favourite» here is what stops `<title>` disagreeing with the H1 a few pixels below it.
 * The target markets are the UK, Ireland, Canada, Australia and New Zealand; `PromoPanel`
 * had already been written that way, which is how the two came to disagree in the first
 * place.
 */
export const APP_NAME = 'Strumfolio'

export const APP_PAYOFF = 'Your favourite songs, ready to play'

/** Bare domain, no protocol — matches how `booklet/document.tsx` and emails print it. */
export const SITE_URL = 'strumfolio.com'
