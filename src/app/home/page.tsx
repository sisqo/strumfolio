import type { Metadata } from 'next'

import { Landing } from '@/app/(home)/Landing'

/**
 * The landing page at a URL that does not care who is asking.
 *
 * `/` is dual-audience — `(home)/layout.tsx` serves the marketing page to a visitor and the
 * reader's own songbooks to a session — which means the one page written to be *shown to
 * people* is the one page nobody working on this app can look at without signing out first.
 * An incognito window answers that, and answers it badly: it is a different browser profile,
 * so no theme, no offer-collapsed cookie, no attribution jar, and nothing to compare against
 * the app sitting in the next tab. This route is the answer instead — same component, same
 * data, no branch.
 *
 * **Unconditional on purpose.** There is no session check here and there must not be one: the
 * whole value of the URL is that it renders the same thing however it is asked for. That also
 * makes it the one page of the public site a signed-in reader can be sent a link to.
 *
 * Not a redirect or a rewrite to `/`, which is the shape that suggests itself and cannot work:
 * whatever the URL, the request would reach `(home)/layout.tsx` carrying the reader's session
 * cookie, and that layout would do exactly what it is written to do and serve them the app.
 *
 * The import crosses a route group, which reads oddly and is the honest spelling: `Landing`
 * belongs to `(home)` — `layout.tsx` beside it is its other half — and this route borrows it.
 * The `@/` alias rather than a relative path for that reason, unlike that layout's own import:
 * the parentheses are a segment of somebody else's segment here, not of this file's.
 */
export const metadata: Metadata = {
  /*
   * Its own title, deliberately not `LANDING_TITLE`. Both tabs are open at once whenever this
   * URL is being used for what it is for, and two tabs reading «Strumfolio — …» is the one
   * thing that makes the comparison harder rather than easier.
   */
  title: 'Public home',
  /*
   * Byte-for-byte the page at `/`, so it must never compete with it in an index — two URLs for
   * one search intent is the problem `/login`'s own `indexable: false` was set to avoid, one
   * step further along. `noindex` rather than a canonical pointing at `/`: a canonical is a
   * hint that these are the same document, `noindex` is an instruction that this one is not a
   * result, and pairing them sends a crawler two answers to one question. Nothing links here,
   * so in practice no crawler finds it — this is the braces to that belt. Note what it is
   * *not*: a `robots.txt` disallow, which would forbid the fetch and so leave this very tag
   * unread.
   */
  robots: { index: false, follow: true },
}

export default function PublicHomePage() {
  return <Landing />
}
