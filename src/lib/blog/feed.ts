import { APP_NAME, SITE_URL } from '@/lib/brand'

import type { PostSummary } from './posts'

/**
 * The RSS feed, as a string.
 *
 * A plain function rather than the body of the route handler, because that is the difference
 * between testable and not in this repo: `npm test` is `node:test` over pure modules and there
 * is no way to render a route. XML built by hand is exactly the kind of code that wants a test
 * — one unescaped ampersand in a title and the whole document stops parsing, in a reader
 * nobody here uses and nobody will report from.
 */

/**
 * The five characters that cannot appear raw in XML.
 *
 * `&` first, and the order is load-bearing: escaping it after the others would turn the `&`
 * of every `&lt;` back into `&amp;lt;`.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * `2026-09-02` → `Tue, 02 Sep 2026 00:00:00 GMT`, the date format RSS asks for.
 *
 * Built at UTC midnight and printed as GMT, so the day in the feed is the day in the article
 * — the same trap `postDate` avoids, arrived at from the other side: here a `Date` really is
 * needed (only it knows which weekday a date falls on), so it is built explicitly in UTC and
 * read back with the UTC getters, never the local ones.
 */
export function rfc822(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date

  const day = DAYS[parsed.getUTCDay()]
  const month = MONTHS[parsed.getUTCMonth()]
  const dayOfMonth = String(parsed.getUTCDate()).padStart(2, '0')

  return `${day}, ${dayOfMonth} ${month} ${parsed.getUTCFullYear()} 00:00:00 GMT`
}

const ORIGIN = `https://${SITE_URL}`

/**
 * The whole document.
 *
 * Full absolute URLs throughout, unlike everywhere else in this app: a feed is read outside
 * the site, by something that has no idea what the site's origin was, so a relative link in it
 * points at nothing.
 *
 * `lastBuildDate` is the newest article's date and not the moment of the build, on purpose. A
 * build stamp changes every deploy, which tells every subscriber's reader that something
 * happened each time a CSS rule moved; the newest article's date changes when there is
 * genuinely something new.
 */
export function renderFeed(posts: readonly PostSummary[]): string {
  const items = posts
    .map(({ meta }) => {
      const url = `${ORIGIN}/blog/${meta.slug}`

      return `    <item>
      <title>${escapeXml(meta.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${escapeXml(meta.description)}</description>
      <pubDate>${rfc822(meta.date)}</pubDate>
${meta.tags.map((tag) => `      <category>${escapeXml(tag)}</category>`).join('\n')}
    </item>`
    })
    .join('\n')

  /* The newest article, or nothing at all before the first one is written — a feed with no
   * items is still a valid feed, and it is the honest answer while the blog is empty. */
  const lastBuildDate = posts.length > 0 ? `\n    <lastBuildDate>${rfc822(posts[0].meta.date)}</lastBuildDate>` : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(APP_NAME)} — Blog</title>
    <link>${ORIGIN}/blog</link>
    <description>${escapeXml(
      'Guides for musicians who keep their own lyrics and chords — transposing, capos, ChordPro, and getting a repertoire in order.',
    )}</description>
    <language>en</language>
    <atom:link href="${ORIGIN}/blog/feed.xml" rel="self" type="application/rss+xml" />${lastBuildDate}
${items}
  </channel>
</rss>
`
}
