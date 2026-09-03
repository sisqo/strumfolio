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
 * The picture on the page: the wide band above an article, and the article's card on the
 * index.
 *
 * Its own cover when it has one — a photograph on the guides, the drawn «where it runs» card
 * on the comparisons — and otherwise the card generated from the title. The fallback is what
 * makes a cover optional rather than mandatory: a piece of writing should never wait on
 * somebody sourcing a picture.
 */
export function pageImage(meta: PostMeta): string {
  return meta.cover ?? `${postPath(meta.slug)}/og`
}

/**
 * The image that represents an article when its link is shared — **always the generated
 * card**, never the cover.
 *
 * This is the one place the two deliberately differ. A cover earns its place on the page by
 * being warm and human; in a link preview it is a photograph with no words on it, three
 * hundred pixels wide in a chat, next to a title the app may or may not render. The generated
 * card carries the headline, the mark and the colours, and it is legible at that size — which
 * is the only thing a social card has to be.
 *
 * It costs nothing extra: `blog/[slug]/og` is prerendered for every article at build time
 * anyway, because it always was the fallback.
 */
export function socialImage(meta: PostMeta): string {
  return `${postPath(meta.slug)}/og`
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
