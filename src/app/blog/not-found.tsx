import Link from 'next/link'

import { Footer } from '@/components/Footer'
import { IconChevronLeft } from '@/components/icons'

/**
 * A stray or stale `/blog/<slug>`.
 *
 * Search is this surface's only door in, and this project's own slugs have already moved
 * once — a lost reader landing on Next's own bare 404 (no header, no footer, no way back)
 * would have nowhere to go on exactly the surface built to keep them reading. `SiteHeader`
 * already wraps this from `blog/layout.tsx`; this only has to supply the rest of the page,
 * reusing the article column and the same back link a real article opens with.
 */
export default function BlogNotFound() {
  return (
    <main className="blog-article">
      <Link href="/blog" className="blog-back">
        {/* 15px, the mock's own size — `Icon` already marks itself `aria-hidden`. */}
        <IconChevronLeft size={15} />
        <span>All notes</span>
      </Link>

      <h1 className="blog-article-title">Page not found</h1>
      <p className="blog-not-found-message">
        That note isn&rsquo;t here, or it moved. Everything published is on the index.
      </p>

      <Footer />
    </main>
  )
}
