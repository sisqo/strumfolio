import { currentUser } from '@/lib/auth/session'

/**
 * What the public bar shows, decided in one place for all eight pages that draw one.
 *
 * `PublicHeader` is the bar on every page that is not the app's and not the blog's — the
 * landing page, the five sign-in pages, pricing, the changelog, the four legal pages,
 * `/checkout/<plan>`, `/pay` and `/qa`. It has never had a notion of a session, and the
 * decision was left at each call site on the argument that only one of them had a reader who
 * might already be signed in. That was true while `/pricing` was the only dual-audience page:
 * it grew the branch, wrote the reasoning, and the other seven went on offering «Sign in» to
 * people who were already inside — the exact defect `/pricing` had fixed, still live in seven
 * places because the fix had nowhere to live but the one file that needed it.
 *
 * So the rule moved here, and it is one sentence: **the mark leads to the public page, and the
 * bar carries exactly one action, which is «Sign in» for a visitor and «My songbooks» for a
 * reader.** Two actions side by side — «Sign in» quiet and «Start free» loud — asked for two
 * different things from the same corner and were reported as confusing; the landing page's own
 * hero button still asks for the second one, where somebody has just read what this is.
 *
 * **Why the mark's destination is not a constant.** `/` is two pages: the marketing home for a
 * visitor, the reader's own songbooks for everybody else. A bar on `/pricing` pointing at `/`
 * therefore takes a signed-in reader *into the app* when what they clicked was the way back to
 * the public site — and now that the bar has a button for going into the app, that is the
 * wrong door twice over. `/home` is the same landing page at a URL that ignores the session,
 * so it is where a signed-in reader is sent. A crawler is never signed in, so it never meets
 * that link: `/home` stays `noindex`, stays out of the sitemap, and `/` keeps every internal
 * link that decides how it ranks.
 *
 * **`currentUser()` and not `auth()`, which is the one trap in here.** `auth()` answers «yes»
 * for a session whose account has since been deleted, and that reader would be offered «My
 * songbooks» pointing at `/` — which, for them, resolves to the landing page they are standing
 * on. A button that returns you to the page you are on is the dead control this repo already
 * refuses elsewhere, and here it would be a loop. `currentUser()` answers `null` in that case,
 * through `accountExists`, so the bar only ever offers an account that is there to open.
 *
 * The cost, stated because this file is where somebody will come to reduce it: for a visitor
 * it is a cookie read and nothing more — `auth()` answers null and the database is never
 * reached — and for a signed-in reader it is one indexed lookup, memoized per request by
 * `accountExists` and skipped outright for a global owner. Seven light pages (the four legal
 * ones, `/changelog`, `/register`, `/forgot-password`) stop being prerendered because of it,
 * which was the trade taken knowingly: the alternative is deciding in the browser, and that
 * shows «Sign in» to a signed-in reader for a frame on every public page.
 *
 * **The blog and the tools are deliberately not here.** `SiteHeader` draws their bar, is still
 * synchronous and still session-blind, and `/blog/<slug>` is prerendered with
 * `generateStaticParams` and `dynamicParams = false`. Those are the pages a search sends
 * people to, so the same trade costs more there and was declined for now — see `CLAUDE.md`.
 */
export interface BarLink {
  href: string
  label: string
}

export interface PublicBar {
  /** Where the mark in the corner leads — the public home, whoever is reading. */
  brandHref: string
  /** The quiet pills, left of the capsule. Passed straight through from the call site. */
  links: BarLink[]
  /** The one action, as an accent capsule. Absent where a page deliberately offers none. */
  cta?: BarLink
  /**
   * Whether the capsule is the long one. «My songbooks» measures 116px against «Sign in»'s 63,
   * and with the mark now taking 149px of the row that difference is the whole of what does or
   * does not fit on a phone — so `PublicHeader` hands it to CSS and the narrow-width rules key
   * on it. Without it the pill would have to step out by width alone, which takes «Pricing»
   * off a visitor's 360px phone to solve a problem only a signed-in reader has. It is not the
   * same question as "is there a capsule": `action: false` leaves none at all.
   */
  wideAction: boolean
}

export interface PublicBarOptions {
  /**
   * The quiet pills this page wants — «Pricing» on most of them, nothing on `/pricing` itself,
   * since a bar that links to the page it stands on is a dead control.
   */
  links?: BarLink[]
  /**
   * `false` suppresses the capsule entirely. Three pages need it and each for its own reason:
   * `/checkout/<plan>` and `/pay` are the funnel and carry no way out of it, and `/pricing`
   * has a third reader — the one `requirePlanChoice` redirected *there* — for whom every
   * destination is a bounce back to this same page.
   */
  action?: false
}

const SIGN_IN: BarLink = { href: '/login', label: 'Sign in' }

/**
 * «My songbooks», plural and lower-case, because that is what the app calls the screen it
 * opens and a reader has more than one. These are the words `/pricing` has printed since it
 * grew the branch this module generalises; a second spelling of them would be the "two places
 * must agree" failure this repo keeps a section of `CLAUDE.md` about.
 */
const MY_SONGBOOKS: BarLink = { href: '/', label: 'My songbooks' }

/**
 * The rule, as a pure function — kept separate from the read below so `npm test` can cover it,
 * which is this repo's home for a synchronous decision worth checking, and so `/pricing` can
 * apply it to the `CurrentUser` it has already resolved for its own third case rather than
 * asking a second time.
 */
export function publicBarFrom(signedIn: boolean, options: PublicBarOptions = {}): PublicBar {
  const { links = [], action } = options

  return {
    brandHref: signedIn ? '/home' : '/',
    links,
    cta: action === false ? undefined : signedIn ? MY_SONGBOOKS : SIGN_IN,
    wideAction: action !== false && signedIn,
  }
}

/**
 * The same rule for a call site that has not already asked who is reading, which is seven of
 * the eight.
 *
 * `action: false` does not make this free, and it looks as though it should: `brandHref` turns
 * on the same answer, so the question is asked either way and only the capsule is discarded.
 * On `/checkout/<plan>` that costs nothing — `requireAccount()` above it has already called
 * `currentUser()`, and `accountExists` is memoized per request — while `/pay` pays one read it
 * does not use, accepted as cheaper than a prop that exists to avoid it.
 */
export async function publicBarFor(options: PublicBarOptions = {}): Promise<PublicBar> {
  return publicBarFrom((await currentUser()) !== null, options)
}
