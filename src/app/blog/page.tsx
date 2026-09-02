import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { Footer } from '@/components/Footer'
import { APP_NAME } from '@/lib/brand'
import { postDate } from '@/lib/blog/date'
import { CARD_HEIGHT, CARD_WIDTH, postPath } from '@/lib/blog/openGraph'
import { listPosts } from '@/lib/blog/posts'

const DESCRIPTION = `Guides for musicians who keep their own lyrics and chords — transposing, capos, ChordPro, playing together, and getting a repertoire in order.`

/**
 * `openGraph` repeated rather than inherited, for the reason `/pricing` and `/changelog` each
 * write down: Next replaces the root layout's block wholesale once a page declares one, so a
 * page that names its own title and stops there ships a link card with no image.
 */
export const metadata: Metadata = {
  title: 'Blog',
  description: DESCRIPTION,
  alternates: { canonical: '/blog' },
  openGraph: {
    title: `${APP_NAME} — Blog`,
    description: DESCRIPTION,
    url: '/blog',
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/brand/og-image.png', width: CARD_WIDTH, height: CARD_HEIGHT }],
  },
}

/**
 * Every published article, newest first.
 *
 * Static: the list comes from files in `content/blog/`, read at build time, so there is no
 * `dynamic` and nothing to ask a database. Deliberately **not** in
 * `scripts/precache-routes.ts` either — the same argument `/changelog` makes about release
 * notes, and a stronger one here: an install-time copy of this list would keep showing
 * yesterday's articles to somebody who came back for today's.
 */
export default async function BlogIndexPage() {
  const posts = await listPosts()

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
      <header className="mb-10">
        <h1 className="landing-title">Blog</h1>
        <p className="mt-4 text-[1.03125rem] leading-[1.6] text-muted">{DESCRIPTION}</p>
      </header>

      {posts.length === 0 ? (
        /* The state this ships in, before the first article is written. An honest sentence
         * rather than an empty page, since the route is live and linked from the footer the
         * moment it exists. */
        <p className="text-[0.9375rem] leading-[1.55] text-muted">Nothing published yet. Soon.</p>
      ) : (
        <ul className="flex flex-col gap-8">
          {posts.map(({ meta, readingTime }) => (
            <li key={meta.slug}>
              <article className="blog-card">
                {meta.cover !== null && (
                  <Link href={postPath(meta.slug)} className="blog-card-cover" tabIndex={-1} aria-hidden>
                    {/*
                     * `next/image` rather than a bare `<img>`: these are the only photographic
                     * assets this app serves, they are the heaviest thing on the page, and the
                     * index shows one per article. `sizes` says what the layout already knows —
                     * one 48rem column — so the browser never fetches the 1200px original for a
                     * phone.
                     */}
                    <Image
                      src={meta.cover}
                      alt=""
                      width={CARD_WIDTH}
                      height={CARD_HEIGHT}
                      sizes="(min-width: 48rem) 44rem, 100vw"
                    />
                  </Link>
                )}

                <h2 className="blog-card-title">
                  <Link href={postPath(meta.slug)}>{meta.title}</Link>
                </h2>

                <p className="blog-card-description">{meta.description}</p>

                <p className="blog-meta">
                  <time dateTime={meta.date}>{postDate(meta.date)}</time>
                  <span aria-hidden>&middot;</span>
                  <span>{readingTime} min read</span>
                  {meta.tags.length > 0 && (
                    <>
                      <span aria-hidden>&middot;</span>
                      {/* Labels, not links: there are no tag pages yet, and a tag that looks
                          like a link and is not is worse than one that looks like a word. */}
                      <span>{meta.tags.join(', ')}</span>
                    </>
                  )}
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}

      <Footer />
    </main>
  )
}
