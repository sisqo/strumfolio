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
 * **Session-free and indexable are not the same question**, which is the reason this is a list
 * of objects rather than of strings. Four of the paths below are reachable without a session
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
   * The landing page, in practice: `/` requires a session and redirects here, so this is what
   * an anonymous visitor and a crawler both actually get. That it is also the sign-in form is
   * a problem for another day — see `PLAN-blog.md`, *Domande aperte*.
   */
  { path: '/login', indexable: true },
  { path: '/pricing', indexable: true },
  { path: '/changelog', indexable: true },
  { path: '/register', indexable: true },

  /* Landing pages for a link out of an email. Public, never indexable: without the token in
   * the query string every one of them can only render its own failure state. */
  { path: '/verify', indexable: false },
  { path: '/forgot-password', indexable: false },
  { path: '/reset-password', indexable: false },

  /*
   * The free tools: small single-purpose pages that do their whole job in the browser, before
   * anybody signs in. They are the reason somebody arrives, so they are indexed.
   *
   * **A new tool needs a line here and will not work without one.** These are exact matches
   * rather than a `/tools/` prefix on purpose — one entry gives both the guard and the
   * sitemap their answer, which is what this module exists for — and the cost is that a route
   * added without one answers a redirect to `/login`. That failure is loud the first time the
   * page is opened, which is the trade being made.
   */
  { path: '/tools/chordpro-converter', indexable: true },
  /* The bare prefix, which today only redirects to the one tool — see `app/tools/page.tsx`.
   * Not indexable while it is a redirect; it becomes so when it becomes a real index. */
  { path: '/tools', indexable: false },

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
