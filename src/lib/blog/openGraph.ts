import type { Metadata } from 'next'

import { APP_NAME } from '@/lib/brand'

import type { PostMeta } from './meta'

/**
 * One article's `<head>`, built in one place.
 *
 * It is a helper and not four lines copied into each page for a reason this repo has already
 * written down twice, in `/pricing` and `/changelog`: **Next does not merge `openGraph`.** A
 * page that declares a block of its own replaces the root layout's wholesale, so an article
 * that names its title and forgets `images` does not inherit the app's card — it ships with
 * no card at all, and the only way to notice is to paste the link somewhere. With every
 * article going through here, forgetting is not available.
 */

/** OpenGraph's expected card size, and what both the cover files and the generated card use. */
export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

/** Where an article lives. */
export function postPath(slug: string): string {
  return `/blog/${slug}`
}

/**
 * The image that represents an article when its link is shared.
 *
 * The article's own cover when it has one; otherwise the card drawn from its title by
 * `blog/[slug]/og`. The fallback is what makes a cover optional rather than mandatory — a
 * piece of writing should never wait on somebody sourcing a picture, and an article shared
 * with no card at all looks broken in a way that costs more than a plain card does.
 */
export function socialImage(meta: PostMeta): string {
  return meta.cover ?? `${postPath(meta.slug)}/og`
}

/**
 * Everything an article declares to a search engine and to a link preview.
 *
 * `type: 'article'` rather than the site-wide `'website'`, with the publication date beside
 * it: it is the one place the date is stated in a form a machine reads, and it is what lets a
 * result show when the piece was written.
 *
 * `alternates.canonical` is set even though nothing today serves an article at a second
 * address — it costs one line and it is the difference between a duplicate reached with a
 * tracking parameter being folded into the real page or competing with it.
 */
export function postMetadata(meta: PostMeta): Metadata {
  const image = socialImage(meta)

  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: postPath(meta.slug) },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: postPath(meta.slug),
      siteName: APP_NAME,
      locale: 'en_US',
      type: 'article',
      publishedTime: meta.date,
      /* OpenGraph's `article:tag` takes a list; the blog has one category per piece, so the
       * list is that one value rather than a second field invented to fill the plural. */
      tags: [meta.category],
      images: [{ url: image, width: CARD_WIDTH, height: CARD_HEIGHT, alt: meta.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: meta.description,
      images: [image],
    },
  }
}
