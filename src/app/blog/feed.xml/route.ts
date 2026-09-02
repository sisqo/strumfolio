import { renderFeed } from '@/lib/blog/feed'
import { listPosts } from '@/lib/blog/posts'

/**
 * `/blog/feed.xml` — the articles, for whoever wants them delivered.
 *
 * A route segment named literally `feed.xml`, sitting beside `[slug]`: Next matches a static
 * segment before a dynamic one, so there is no ambiguity with an article that might one day
 * be called `feed`.
 *
 * `force-static`, like every other blog route: the content is files read at build time, so
 * this document is written once per deploy and served as a file. Nothing here is per-request,
 * and a feed that woke a function up for every polling reader would be paying for the privilege
 * of returning the same bytes.
 *
 * The document itself is built by `lib/blog/feed.ts` — a pure function, because hand-written
 * XML is precisely what wants a test and a route handler is what this repo cannot test.
 */
export const dynamic = 'force-static'

export async function GET() {
  const posts = await listPosts()

  return new Response(renderFeed(posts), {
    headers: {
      /* `application/rss+xml` with an explicit charset: readers that guess get it wrong on
       * the first article with an apostrophe in the title. */
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  })
}
