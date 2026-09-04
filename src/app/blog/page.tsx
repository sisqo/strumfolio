import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { Footer } from '@/components/Footer'
import { APP_NAME } from '@/lib/brand'
import { postDate } from '@/lib/blog/date'
import { CARD_HEIGHT, CARD_WIDTH, pageImage, postPath } from '@/lib/blog/openGraph'
import { listPosts } from '@/lib/blog/posts'
import { shelve } from '@/lib/blog/shelves'

/**
 * The blog is called «Playing notes», and the word Blog is only the section it lives in — the
 * pill in the bar. Both come straight from the design, which prints the two separately and
 * uses the publication's name again in the article's «All notes» link back here.
 */
const BLOG_TITLE = 'Playing notes'

/**
 * The lede, and also this page's meta description — one sentence doing both jobs.
 *
 * **Widened by one clause from what the mock drew.** The design's line was «Short guides on
 * capo, keys and chord shapes — the parts of a song sheet that change depending on who is
 * holding the instrument», written when the blog was imagined as guides and nothing else. It
 * now also carries comparisons of the apps a musician might be choosing between, and a lede
 * that promises only capo and keys over an index whose top three entries are app comparisons
 * is a page arguing with itself — in the hero and, worse, in the search snippet. The mock's
 * closing image is kept, because it is the good half of the sentence.
 */
const DESCRIPTION =
  'Guides on capo, keys and chord shapes, and comparisons of the apps that show them — written for whoever is holding the instrument.'

/**
 * `openGraph` repeated rather than inherited, for the reason `/pricing` and `/changelog` each
 * write down: Next replaces the root layout's block wholesale once a page declares one, so a
 * page that names its own title and stops there ships a link card with no image.
 */
export const metadata: Metadata = {
  title: BLOG_TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/blog' },
  openGraph: {
    title: `${APP_NAME} — ${BLOG_TITLE}`,
    description: DESCRIPTION,
    url: '/blog',
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/brand/og-image.png', width: CARD_WIDTH, height: CARD_HEIGHT }],
  },
}

/**
 * Every published article.
 *
 * Static: the list comes from files in `content/blog/`, read at build time, so there is no
 * `dynamic` and nothing to ask a database. Deliberately **not** in
 * `scripts/precache-routes.ts` either — the same argument `/changelog` makes about release
 * notes, and a stronger one here: an install-time copy of this list would keep showing
 * yesterday's articles to somebody who came back for today's.
 */
export default async function BlogIndexPage() {
  const posts = await listPosts()
  const { featured, grid, earlier } = shelve(posts)

  return (
    <>
      <div className="site-hero">
        {/* Two painted layers, both inert: a warm glow from the top edge, and the ruled lines
            of a stave fading out under the headline. Drawn in CSS rather than shipped as an
            image — see `.site-hero-glow`/`.site-hero-stave` for the gradients themselves. */}
        <div aria-hidden className="site-hero-glow" />
        <div aria-hidden className="site-hero-stave" />

        <div className="site-hero-inner">
          <h1 className="site-hero-title">{BLOG_TITLE}</h1>
          <p className="site-hero-lede">{DESCRIPTION}</p>
        </div>
      </div>

      <main className="site-main">
        {featured === null ? (
          /* The state this ships in, before the first article is written. An honest sentence
           * rather than an empty page, since the route is live and linked from the footer the
           * moment it exists. */
          <p className="blog-empty">Nothing published yet. Soon.</p>
        ) : (
          <Link href={postPath(featured.meta.slug)} className="blog-featured" aria-label={featured.meta.title}>
            <span className="blog-featured-image">
              <Image
                src={pageImage(featured.meta)}
                alt=""
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
                sizes="(min-width: 60rem) 36rem, 100vw"
                priority
              />
            </span>

            <span className="blog-featured-body">
              <span className="blog-category blog-category-pill">{featured.meta.category}</span>
              {/* A real heading so a screen reader's skim-by-heading finds the article title —
                  `aria-label` on the link above keeps the link's own announced name just the
                  title rather than the whole card's concatenated text. */}
              <h2 className="blog-featured-title">{featured.meta.title}</h2>
              <span className="blog-featured-description">{featured.meta.description}</span>
              <span className="flex-1" />
              <span className="blog-meta">
                <time dateTime={featured.meta.date}>{postDate(featured.meta.date)}</time>
                <span aria-hidden>&middot;</span>
                <span>{featured.readingTime} min read</span>
              </span>
            </span>
          </Link>
        )}

        {grid.length > 0 && (
          <div className="blog-grid">
            {grid.map(({ meta, readingTime }) => (
              <Link key={meta.slug} href={postPath(meta.slug)} className="blog-card" aria-label={meta.title}>
                <span className="blog-card-image">
                  <Image
                    src={pageImage(meta)}
                    alt=""
                    width={CARD_WIDTH}
                    height={CARD_HEIGHT}
                    sizes="(min-width: 60rem) 22rem, 100vw"
                  />
                </span>

                <span className="blog-card-body">
                  <span className="blog-category">{meta.category}</span>
                  <h2 className="blog-card-title">{meta.title}</h2>
                  <span className="blog-card-description">{meta.description}</span>
                  <span className="flex-1" />
                  <span className="blog-card-meta">
                    <time dateTime={meta.date}>{postDate(meta.date)}</time> &middot; {readingTime} min
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}

        {earlier.length > 0 && (
          <>
            <div className="blog-earlier-head">
              <h2 className="blog-earlier-title">Earlier</h2>
              {/* The year of the oldest thing on the list, which is what the column of dates
                  below is counting back towards. */}
              <span className="blog-earlier-year">{earlier[earlier.length - 1].meta.date.slice(0, 4)}</span>
            </div>

            <div className="blog-earlier">
              {earlier.map(({ meta, readingTime }) => (
                <Link
                  key={meta.slug}
                  href={postPath(meta.slug)}
                  className="blog-earlier-row"
                  aria-label={meta.title}
                >
                  <time dateTime={meta.date} className="blog-earlier-date">
                    {postDate(meta.date)}
                  </time>
                  <h3 className="blog-earlier-headline">{meta.title}</h3>
                  <span className="blog-earlier-time">{readingTime} min</span>
                </Link>
              ))}
            </div>
          </>
        )}

        <Footer />
      </main>
    </>
  )
}
