import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import type { ComponentType } from 'react'

import { byNewest, isValidSlug, parsePostMeta, type PostMeta } from './meta'
import { readingTimeMinutes } from './readingTime'

/**
 * Reading the articles off disk — the one place that knows an article is a file.
 *
 * Four surfaces need the list (the index, an article's own page, the sitemap and the feed),
 * and every one of them must agree on what is published. So the filtering of drafts and the
 * ordering both happen here, once, rather than in each of the four — a draft that leaks into
 * the feed because one call site forgot the filter is a piece of unfinished writing mailed to
 * subscribers, and it cannot be recalled.
 *
 * Server-side only: it reads the file system. Nothing calls it during a request either —
 * every blog route is statically generated, so this runs at build time and the deployed app
 * never looks for `content/` at all.
 */

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog')

/**
 * What an `.mdx` module gives back once compiled.
 *
 * `meta` is `unknown` because it truly is unchecked — `@types/mdx` describes an `.mdx` file
 * as a component and nothing else, and no compiler has looked at the object the file exports
 * beside it. `parsePostMeta` is what turns it into something with a shape; this cast only
 * says the property may be there at all.
 */
interface MdxModule {
  default: ComponentType
  meta?: unknown
}

/** One article, ready to render: what it says about itself, and the article itself. */
export interface LoadedPost {
  meta: PostMeta
  readingTime: number
  Body: ComponentType
}

/**
 * Every article's slug, in no particular order.
 *
 * A badly named file fails here rather than becoming a URL with a space in it — and fails the
 * build, which is the point: the alternative is a page that exists at an address nobody can
 * link to correctly.
 */
export async function listSlugs(): Promise<string[]> {
  let entries: string[]
  try {
    entries = await readdir(BLOG_DIR)
  } catch {
    /* No articles yet is a legitimate state — the blog ships before the writing does — and an
     * empty index is the correct rendering of it, not a build failure. */
    return []
  }

  return entries
    .filter((entry) => entry.endsWith('.mdx'))
    .map((entry) => entry.replace(/\.mdx$/, ''))
    .map((slug) => {
      if (!isValidSlug(slug)) {
        throw new Error(`content/blog/${slug}.mdx: the file name becomes the URL, so it must be lowercase words joined by hyphens`)
      }
      return slug
    })
}

/**
 * One article, checked.
 *
 * The dynamic import has a static prefix on purpose: that is what lets the bundler compile
 * every `.mdx` under `content/blog/` ahead of time and resolve this by slug, instead of
 * needing a file system at run time.
 *
 * The source is read a second time, as text, only to count its words — see `readingTime.ts`.
 * Cheap at build time, and it keeps the estimate honest by deriving it from the same bytes
 * that were compiled.
 */
export async function loadPost(slug: string): Promise<LoadedPost> {
  if (!isValidSlug(slug)) throw new Error(`Not an article slug: ${JSON.stringify(slug)}`)

  const imported = (await import(`../../../content/blog/${slug}.mdx`)) as unknown as MdxModule
  const source = await readFile(path.join(BLOG_DIR, `${slug}.mdx`), 'utf8')

  return {
    meta: parsePostMeta(slug, imported.meta),
    readingTime: readingTimeMinutes(source),
    Body: imported.default,
  }
}

/** One article's entry in a list: everything but the article. */
export interface PostSummary {
  meta: PostMeta
  readingTime: number
}

/**
 * Every published article, newest first — drafts excluded.
 *
 * Loads each article to read its meta, which is the price of keeping the metadata inside the
 * file it describes rather than in a second list somebody has to remember to update. It is
 * paid once per build, on a handful of files.
 */
export async function listPosts(): Promise<PostSummary[]> {
  const slugs = await listSlugs()
  const loaded = await Promise.all(slugs.map(async (slug) => await loadPost(slug)))

  const published = loaded.filter((post) => !post.meta.draft)

  return byNewest(published.map((post) => post.meta)).map((meta) => {
    const post = published.find((candidate) => candidate.meta.slug === meta.slug)
    /* `published` is what `meta` was derived from, so this cannot miss; the check is here so
     * the non-null assertion this would otherwise need does not have to be. */
    if (post === undefined) throw new Error(`Unreachable: no loaded post for ${meta.slug}`)
    return { meta: post.meta, readingTime: post.readingTime }
  })
}

/**
 * The slugs that get built into pages: published articles only.
 *
 * A draft has no page at all, rather than a page nobody links to — an unlisted URL is still a
 * URL, and an unfinished article at a guessable address is published whether it was meant to
 * be or not.
 */
export async function publishedSlugs(): Promise<string[]> {
  return (await listPosts()).map((post) => post.meta.slug)
}
