import Link from 'next/link'

import { APP_NAME } from '@/lib/brand'

/**
 * The invitation at the end of every article.
 *
 * The blog exists to be found by musicians who have never heard of this app; an article that
 * teaches somebody something and then lets them leave has done the expensive half of the work
 * and skipped the cheap half. So this sits after the last paragraph of every article, without
 * exception — one component rather than a paragraph each writer improvises, so that changing
 * what the blog asks for is one edit and not a sweep through everything ever published.
 *
 * At the end and not floating over the text, and no banner in the middle: `PRODUCT.md`'s
 * anti-references are ad-heavy chord sites, and a blog that interrupts its own article to
 * sell is the same mistake in a smaller size. Somebody who read to the bottom has earned a
 * plain offer, and somebody who did not was never going to take it.
 *
 * `/login` rather than `/pricing`: it is the page that explains what this is, and it is where
 * signing up actually happens. `/pricing` is a page for somebody already convinced.
 */
export function BlogCta() {
  return (
    <aside className="blog-cta">
      <p className="blog-cta-title">Your songs, ready when you are</p>
      <p className="blog-cta-body">
        {APP_NAME} keeps your own lyrics and chords readable on stage — transpose to the key you sing in, set a capo,
        scroll hands-free, and play with no signal. Free to use, with paid plans for bigger repertoires.
      </p>
      <Link href="/login" className="btn btn-primary blog-cta-action">
        Try {APP_NAME}
      </Link>
    </aside>
  )
}
