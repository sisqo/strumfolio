/**
 * Every path this app serves without a session, in one list.
 *
 * It exists because two places need the answer and used to hold their own copy of it:
 * `middleware.ts`, which decides who gets redirected to `/login`, and `app/sitemap.ts`,
 * which decides what gets offered to a search engine. Two independent lists of "what is
 * public" drift the first time one is edited — a page added to the guard and forgotten by the
 * sitemap is invisible to Google, and the reverse is worse: a sitemap that advertises a URL
 * the guard bounces to `/login`.
 *
 * **Three questions are asked of this list, not one**, which is the reason it is a list of
 * objects rather than of strings and the reason two predicates sit at the bottom of the file
 * rather than one. In the order they arrived:
 *
 * 1. *Is this path served without a session?* — the guard's question (`isSessionFreePath`).
 * 2. *Should a search engine be told it exists?* — the sitemap's (`indexable`).
 * 3. *Is a reader standing here outside the app?* — `isOutsideAppPath`, which arrived with `/`
 *    and is the only one of the three whose answer is not a property of the path alone.
 *
 * **Session-free and indexable are not the same question.** Four of the paths below are
 * reachable without a session
 * only because they are links followed out of an email — a verification token, a password
 * reset — and offering those to a crawler would be offering it a page that cannot work for it.
 * `/register` is the odd one of that group: no token, no email, and a page somebody may
 * genuinely arrive at from a search, so it is indexable like `/login` and `/pricing`.
 *
 * The blog is deliberately **not** here. It is not a fixed set of paths but a prefix with a
 * file-backed set of articles under it, so the guard matches it by prefix and the sitemap
 * enumerates it from `content/blog/` — see both call sites.
 */
export interface PublicRoute {
  /** The path itself, exactly as it is matched and as it is published. */
  path: string
  /**
   * Whether a search engine should be told this page exists. False for the pages that only
   * make sense with a token in the query string.
   */
  indexable: boolean
}

export const PUBLIC_ROUTES: PublicRoute[] = [
  /*
   * The landing page — and the app's own home, which is what makes it unlike every other
   * entry here. See `DUAL_AUDIENCE_PATHS` below: this one line is the reason that set exists.
   *
   * It used to be absent, and `/login` carried the comment this one replaces: `/` required a
   * session and redirected there, so the sign-in form was what an anonymous visitor and a
   * crawler both actually got, and that "is a problem for another day, and still open". This
   * is that day. `(home)/layout.tsx` now renders the marketing page for anybody with no
   * session and the app for anybody with one, and this row is what stops the guard bouncing
   * the first of those two to `/login` before the layout ever runs.
   */
  { path: '/', indexable: true },
  /*
   * The sign-in form, and nothing else since the restructure — no pitch, no features, no FAQ.
   *
   * Public forever, for the reason every entry below it is: whoever needs it has no session
   * by definition. **Not indexable**, unlike almost everything else here, and that is a
   * decision rather than an oversight: what a crawler was being offered under this URL was
   * the whole argument for the product, and that argument now lives at `/`. Two URLs
   * competing for one search intent is exactly what a sitemap is for avoiding. Note what this
   * does *not* do — it is not a `noindex`, so a page already in an index stays there; it only
   * stops this site advertising it.
   */
  { path: '/login', indexable: false },
  /*
   * The landing page again, at a URL that ignores the session — `app/home/page.tsx` renders
   * the same component `/` gives a visitor, to anybody who asks. It exists because `/` is
   * dual-audience, so the public home is the one page of this site that whoever works on it
   * cannot open without signing out first.
   *
   * **Not indexable, and that is the whole of the care it needs.** It is a duplicate of `/`
   * down to the byte, so offering it to a crawler would put two URLs in front of one search
   * intent — the same reason `/login` lost its own row above, at a point where the duplication
   * is total rather than partial. The page carries a `noindex` of its own as well, because
   * this flag only stops *this site* advertising it and says nothing to a crawler that arrives
   * from a link somebody pasted.
   *
   * It is session-free like every row here, but for the opposite reason to most of them:
   * nothing about it needs a reader without a session — it needs not to *care*.
   */
  { path: '/home', indexable: false },
  { path: '/pricing', indexable: true },
  { path: '/changelog', indexable: true },
  { path: '/register', indexable: true },

  /* Landing pages for a link out of an email. Public, never indexable: without the token in
   * the query string every one of them can only render its own failure state. */
  { path: '/verify', indexable: false },
  { path: '/forgot-password', indexable: false },
  { path: '/reset-password', indexable: false },
  /*
   * A courtesy email's one-click unsubscribe. Session-free by construction — a reader who
   * followed this link out of an email has no reason to be signed in, and the HMAC token in
   * the query string is the whole authorization (`lib/courtesy/unsubscribe.ts`), not a cookie.
   * Not indexable, the same reason as the three rows above it: with no token this can only show
   * its own "this link is not valid" state.
   */
  { path: '/courtesy-unsubscribe', indexable: false },

  /*
   * The free pages under `/tools`: four small single-purpose tools that do their whole job in
   * the browser, and two chord charts that simply are the answer. Either way nobody signs in
   * first, they are the reason somebody arrives, so they are indexed.
   *
   * **A new tool needs a line here and will not work without one.** These are exact matches
   * rather than a `/tools/` prefix on purpose — one entry gives both the guard and the
   * sitemap their answer, which is what this module exists for — and the cost is that a route
   * added without one answers a redirect to `/login`. That failure is loud the first time the
   * page is opened, which is the trade being made.
   */
  { path: '/tools/chordpro-converter', indexable: true },
  { path: '/tools/chord-transposer', indexable: true },
  { path: '/tools/capo-calculator', indexable: true },
  { path: '/tools/setlist-length-calculator', indexable: true },
  /* The two chord charts. Reference documents rather than tools — nothing to type into and
   * nothing computed for you — and two paths rather than one page with a switch, because a
   * guitarist and a ukulele player arrive from different searches and each needs a URL that
   * stays what it was when they sent it to somebody. */
  { path: '/tools/guitar-chords', indexable: true },
  { path: '/tools/ukulele-chords', indexable: true },
  /* The index itself. It was a redirect to the only tool that existed while that was true;
   * with six entries it is a page that lists them, so it is indexed like any other. */
  { path: '/tools', indexable: true },

  /* The four legal documents. Reachable by somebody with no session forever — a visitor
   * deciding whether to sign up, a store reviewer, a data protection authority — and worth
   * indexing for the same reason. */
  { path: '/privacy-policy', indexable: true },
  { path: '/terms-of-service', indexable: true },
  { path: '/cookie-policy', indexable: true },
  { path: '/content-copyright-notice', indexable: true },
]

/**
 * The same list as a `Set` of paths, for the guard's own lookup.
 *
 * Built once at module load rather than per request: `middleware.ts` runs on every matched
 * request, and a `Set` is what turns the chain of `===` this replaced into one hash lookup.
 */
export const SESSION_FREE_PATHS: ReadonlySet<string> = new Set(PUBLIC_ROUTES.map((route) => route.path))

/** The blog's own prefix, shared by the guard and the sitemap so the two cannot disagree. */
export const BLOG_PREFIX = '/blog'

/**
 * Whether a path belongs to the blog — the index, an article, an article's generated social
 * card, or the feed.
 *
 * A prefix test and not another entry in the list above, deliberately: the guard has to admit
 * `/blog/<slug>` for articles nobody has written yet, and an exact-match list cannot. Getting
 * this wrong is the single most likely way the blog ships broken — every article answering a
 * redirect to `/login`, and nothing indexed at all.
 */
export function isBlogPath(pathname: string): boolean {
  return pathname === BLOG_PREFIX || pathname.startsWith(`${BLOG_PREFIX}/`)
}

/**
 * A Strum Together guest's screen, `/follow/<token>`.
 *
 * Session-free like the blog and not in the list above for the same reason: the set is not
 * fixed, the token is minted per broadcast. It lives here rather than as a regex inside
 * `middleware.ts` — where it used to be its only copy — because it answers the same question
 * this module exists to answer once, and a second reader has since appeared (see
 * `isSessionFreePath`).
 */
export function isFollowPath(pathname: string): boolean {
  return /^\/follow\/[^/]+$/.test(pathname)
}

/**
 * Whether this path is served to somebody with no session at all — the whole of "public", in
 * one predicate: the fixed list, the blog, and a guest's broadcast screen.
 *
 * `middleware.ts` asks the same question in three separate branches and will go on doing so,
 * because each answers it *differently* — `/pricing` lets a signed-in reader keep a cached
 * copy while the blog and `/follow` are marked anonymous unconditionally. This is for the
 * readers that only need the yes or no, and the point of it living here is that a page added
 * to `PUBLIC_ROUTES` is covered by both without anybody remembering a second place.
 *
 * Note what it does **not** mean: not "the visitor is signed out". A reader with a perfectly
 * good session can be standing on `/pricing` or reading the blog. That distinction is the one
 * `FeedbackLauncher` got wrong — see its own comment.
 */
export function isSessionFreePath(pathname: string): boolean {
  return SESSION_FREE_PATHS.has(pathname) || isBlogPath(pathname) || isFollowPath(pathname)
}

/**
 * The paths that are public *and* part of the app — where "public" is a fact about the request
 * and not about the page.
 *
 * `/` is the only one, and it is what the whole set exists to name: with no session it is the
 * landing page a visitor and a crawler get, and with one it is the reader's own repertoire.
 * Every other entry in `PUBLIC_ROUTES` is one thing to everybody.
 *
 * A set rather than a bare `pathname === '/'` in the one function below, because the reason is
 * a property of the list and not of that function: a second dual-audience path added later
 * (a shared songbook, say) has to be declared *here*, where the next reader of this file is
 * already looking, instead of appearing as a magic string inside a predicate about feedback.
 */
const DUAL_AUDIENCE_PATHS: ReadonlySet<string> = new Set(['/'])

/**
 * Whether somebody standing on this path is *outside* the app — reading a page written for
 * whoever has not signed up yet, rather than using the thing they signed up for.
 *
 * Public and outside-the-app were the same question until `/` became the landing page, and
 * `FeedbackProvider` was asking `isSessionFreePath` for this. Left that way, the row in
 * `PUBLIC_ROUTES` for `/` would have silently taken the feedback bubble off the app's own home
 * screen for every signed-in reader — a regression invisible to whoever introduced it, because
 * signed *out* there is no bubble anywhere and the page looks correct however you check it. It
 * is the same shape as the bug `FeedbackLauncher`'s own comment records ("both halves have to
 * hold"), one layer up: that one had the reader half right and the page half missing, and this
 * would have had the page half wrong.
 *
 * So: `/pricing`, the blog, a tool, a legal document and a Strum Together guest's screen are
 * outside the app whoever is reading them. `/` never is — a visitor there has no session, so
 * `FeedbackLauncher`'s own `email !== null` gate already keeps the bubble away from them, and
 * that is the half of the question that belongs to the reader rather than to the path.
 */
export function isOutsideAppPath(pathname: string): boolean {
  return isSessionFreePath(pathname) && !DUAL_AUDIENCE_PATHS.has(pathname)
}
