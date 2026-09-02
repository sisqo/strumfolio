import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BlogCta } from '@/components/BlogCta'
import { Footer } from '@/components/Footer'
import { postDate } from '@/lib/blog/date'
import { CARD_HEIGHT, CARD_WIDTH, postMetadata } from '@/lib/blog/openGraph'
import { loadPost, publishedSlugs } from '@/lib/blog/posts'

/**
 * One article.
 *
 * Fully static: `generateStaticParams` lists the published slugs at build time and
 * `dynamicParams = false` refuses everything else, so a URL that is not an article is a 404
 * decided at build rather than a function invocation that reads the file system in
 * production — which matters because `content/` is a build input, not something the deployed
 * app should ever need to open.
 *
 * That same flag is what makes `draft: true` mean something. Drafts are filtered out of
 * `publishedSlugs`, so an unfinished article has no page at all rather than an unlisted one:
 * an URL nobody links to is still an URL, and a guessable address is published whether it was
 * meant to be or not.
 */
export const dynamicParams = false

export async function generateStaticParams() {
  return (await publishedSlugs()).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { meta } = await loadPost(slug)

  /* Every article's head comes from one helper — see `lib/blog/openGraph.ts` on why this is
   * not four lines copied per article. */
  return postMetadata(meta)
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const { meta, readingTime, Body } = await loadPost(slug)

  /* Unreachable while `dynamicParams` is false — a draft has no params entry — but the check
   * costs nothing and is what keeps a future change to that flag from quietly publishing every
   * unfinished piece in the folder. */
  if (meta.draft) notFound()

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
      <article className="article">
        <header className="mb-8">
          <h1 className="landing-title">{meta.title}</h1>

          <p className="blog-meta mt-4">
            <time dateTime={meta.date}>{postDate(meta.date)}</time>
            <span aria-hidden>&middot;</span>
            <span>{readingTime} min read</span>
            {meta.tags.length > 0 && (
              <>
                <span aria-hidden>&middot;</span>
                <span>{meta.tags.join(', ')}</span>
              </>
            )}
          </p>
        </header>

        {meta.cover !== null && (
          <Image
            className="article-cover"
            src={meta.cover}
            /*
             * Empty alt on purpose: the cover repeats the headline directly above it, and a
             * screen reader announcing the title twice serves nobody. A picture that carries
             * information the prose does not belongs in the body of the article, with an alt
             * that says what it shows.
             */
            alt=""
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            sizes="(min-width: 48rem) 44rem, 100vw"
            priority
          />
        )}

        {/*
          * The prose gets a container of its own rather than being styled through `.article`,
          * so that the rules for "a paragraph in an article" cannot also land on the byline
          * above — which is a `<p>` too, and would inherit an article paragraph's size and
          * spacing the moment those rules were written one level up.
          */}
        <div className="article-body">
          <Body />
        </div>
      </article>

      <BlogCta />

      <p className="mt-10 text-[0.9375rem]">
        <Link href="/blog">&larr; All articles</Link>
      </p>

      <Footer />
    </main>
  )
}
