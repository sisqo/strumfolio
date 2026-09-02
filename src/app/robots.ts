import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/brand'

/**
 * What a crawler is asked to leave alone, and where the map is.
 *
 * The `Sitemap:` line is the point of the file: it is how a crawler that arrived at some page
 * finds out the rest exists, without anybody submitting anything by hand.
 *
 * The disallow list is not a security measure and must not be read as one — every path below
 * already answers an anonymous request with a redirect to `/login`, enforced by
 * `middleware.ts`, and a crawler that ignored this file would learn nothing it is not already
 * refused. What it buys is that a crawler does not spend its budget for this site discovering
 * that a few thousand private URLs all redirect to the same page, instead of reading the
 * articles that were written to be read.
 *
 * `/follow/` is on the list for a different reason worth stating: those pages *are* reachable
 * without a session, on purpose, and they must still never be indexed — a Strum Together link
 * is somebody's rehearsal, shared with the people in the room, and it has no business in a
 * search result.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/songs/', '/songbooks/', '/checkout/', '/booklet', '/export', '/api/', '/follow/'],
    },
    sitemap: `https://${SITE_URL}/sitemap.xml`,
  }
}
