/**
 * What this site tells a search engine that a page *is*, rather than what it says.
 *
 * Everything else in `lib/blog/` describes a page to a person who will read it: a title, a
 * description, a card that looks right in a chat window. Structured data is the other
 * audience — the one that wants to know that this URL is an article, published on a date, by
 * a publisher, or that this one is a piece of software that costs nothing to use. Google
 * reads it to decide whether a result gets a date beside it, whether an FAQ gets its own
 * accordion, whether a tool page is treated as a tool.
 *
 * **It was missing entirely until now**, which is why this file exists: the site had a
 * sitemap, a feed and OpenGraph cards, and then said nothing at all about the *kind* of thing
 * each page was.
 *
 * Three shapes, and no more, because three is what this site actually has:
 *
 * - `articleJsonLd` — every blog article.
 * - `softwareToolJsonLd` — every page under `/tools`, which really is a small free program.
 * - `faqJsonLd` — the questions block, generated from the same array that renders it (see
 *   `components/Faq.tsx`), so the two cannot drift. A schema block claiming a question the
 *   page does not show is the kind of mismatch that gets structured data ignored sitewide.
 *
 * Pure and returning plain objects, so `npm test` can hold them: a mistake here is invisible
 * on the page, which is precisely the class of bug this repo puts in a tested module.
 */

import { APP_NAME, SITE_URL } from '@/lib/brand'

import type { PostMeta } from './meta'
import { postPath, socialImage } from './openGraph'

const ORIGIN = `https://${SITE_URL}`

/** Absolute, because structured data is read out of context and a `/path` means nothing there. */
function absolute(path: string): string {
  return path.startsWith('http') ? path : `${ORIGIN}${path}`
}

/**
 * The publisher, repeated into every block that wants one.
 *
 * **There is no author and that is deliberate**, not an omission to fix later:
 * `PLAN-blog.md` decided against an author field on the grounds that while one person writes
 * everything it is «a constant dressed up as metadata». The honest structured-data answer to
 * "who wrote this" is therefore the same as the honest answer everywhere else — the
 * publication did.
 */
const PUBLISHER = {
  '@type': 'Organization',
  name: APP_NAME,
  url: ORIGIN,
  logo: { '@type': 'ImageObject', url: `${ORIGIN}/brand/og-image.png` },
} as const

/**
 * One article, as an `Article`.
 *
 * `datePublished` comes from `meta.date` — the same field the page prints under the headline
 * and the sitemap sends as `lastModified` — so a reader, a crawler and the sitemap cannot be
 * told three different days. There is no `dateModified`, for the reason the plan gives about
 * an `updatedAt`: a date that stops being maintained is worse than no date.
 */
export function articleJsonLd(meta: PostMeta): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: meta.title,
    description: meta.description,
    datePublished: meta.date,
    /* The generated card, not the cover — the same choice `socialImage` explains: it is the
       one image that is legible at the size a result or a preview shows it. */
    image: absolute(socialImage(meta)),
    articleSection: meta.category,
    inLanguage: 'en',
    mainEntityOfPage: { '@type': 'WebPage', '@id': absolute(postPath(meta.slug)) },
    publisher: PUBLISHER,
    isAccessibleForFree: true,
  }
}

/** What a tool page declares itself to be. */
export interface ToolFacts {
  name: string
  description: string
  /** Absolute path, e.g. `/tools/capo-calculator`. */
  path: string
}

/**
 * One tool, as a `SoftwareApplication` that costs nothing.
 *
 * `WebApplication` rather than a plain `WebPage` because that is what these are: they run in
 * the browser, they take input, they produce a result, and nothing about them is a document.
 * The `offers` block with a price of zero is the part worth stating explicitly — «free» is
 * the single most load-bearing word in every one of these pages' titles, and this is where a
 * machine can read it rather than infer it from copy.
 */
export function softwareToolJsonLd(tool: ToolFacts): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: tool.name,
    description: tool.description,
    url: absolute(tool.path),
    applicationCategory: 'MultimediaApplication',
    /* It runs in the page. There is no install, which is most of the point of these existing
       at all, and «any browser» is the honest requirement rather than a platform list. */
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    isAccessibleForFree: true,
    publisher: PUBLISHER,
  }
}

/** One question and its answer, as both the page and the schema need it. */
export interface FaqItem {
  question: string
  /** Plain text: the schema wants a string, and a paragraph is what a person wants too. */
  answer: string
}

/**
 * A block of questions, as a `FAQPage`.
 *
 * Generated from the array the component renders, never written twice. That is the whole
 * design constraint here: the commonest way structured data goes wrong is a block that
 * describes a page as it used to be, and the only reliable defence is having one source for
 * both.
 */
export function faqJsonLd(items: readonly FaqItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}

/**
 * The JSON that goes inside the `<script>` tag, with the one escape that matters.
 *
 * `</script>` appearing inside a JSON string would end the tag early and drop the rest of the
 * document into the page as markup. Escaping `<` as `<` is the standard fix and costs
 * nothing, because JSON parsers read the escape and the HTML parser never sees a bracket. It
 * is here rather than in the component so that a test can hold it: this is a security detail
 * that looks like a formatting detail.
 */
export function jsonLdText(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
