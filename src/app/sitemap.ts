import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/brand'
import { listPosts } from '@/lib/blog/posts'
import { BLOG_PREFIX, PUBLIC_ROUTES } from '@/lib/publicRoutes'

/**
 * What this site offers to a search engine — the first thing it has ever offered, since this
 * route did not exist before the blog did.
 *
 * **The list of public pages is not written here.** It comes from `lib/publicRoutes.ts`, the
 * same module `middleware.ts` reads to decide who gets redirected to `/login`, because the two
 * are one question asked twice and two copies of the answer drift. The failure is quiet in
 * both directions: a page the guard admits and this file forgets is invisible to search, and a
 * page this file advertises and the guard bounces tells Google every URL here is a redirect to
 * a sign-in form.
 *
 * Only the entries marked `indexable` make it in — `/verify`, `/forgot-password` and
 * `/reset-password` are reachable without a session only because they are opened from an
 * email, and without the token in the query string there is nothing in any of them to index.
 *
 * The articles are enumerated from `content/blog/`, drafts already excluded by `listPosts`.
 *
 * Statically generated: nothing here reads a request, and `middleware.ts` lets `/sitemap.xml`
 * through as a public asset — without that line this document would answer a redirect to
 * `/login`, which is worse than not publishing one at all.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = `https://${SITE_URL}`

  const pages: MetadataRoute.Sitemap = PUBLIC_ROUTES.filter((route) => route.indexable).map((route) => ({
    url: `${origin}${route.path}`,
  }))

  const posts = await listPosts()

  return [
    ...pages,
    { url: `${origin}${BLOG_PREFIX}` },
    ...posts.map((post) => ({
      url: `${origin}${BLOG_PREFIX}/${post.meta.slug}`,
      /* The date the article states about itself. Not the file's mtime, which changes when a
       * typo is fixed and, on a clean build checkout, is the moment of the checkout for every
       * file at once — telling Google the whole archive was rewritten this morning. */
      lastModified: post.meta.date,
    })),
  ]
}
