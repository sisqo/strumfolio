import Link from 'next/link'

/**
 * The invitation at the end of every article — the dark panel the mock closes the piece with.
 *
 * It is the one element on a blog page that does not follow the reader's theme: a warm
 * near-black band on `#3a2415` in light and in dark alike, with cream type and a cream
 * capsule. That is deliberate and it is the point of the design — after a page of paper it
 * reads as a different kind of object, which is what a reader has to notice for an offer to
 * land at all. Following the theme would make it a slightly different card among cards in
 * light, and invisible against the page in dark.
 *
 * The copy is the mock's, and it says something true about the product rather than about the
 * article: keys and capos are separate controls, which is the thing the featured piece spends
 * six minutes explaining. One component, so changing what the blog asks for is one edit and
 * not a sweep through everything ever published.
 *
 * `/login` and not `/pricing`: it is where signing up actually happens, and `/pricing` is a
 * page for somebody already convinced.
 */
export function BlogCta() {
  return (
    <aside className="blog-cta">
      <div className="blog-cta-text">
        <p className="blog-cta-title">Set the key once, let everyone pick their own capo.</p>
        <p className="blog-cta-body">Strumfolio keeps them apart on every sheet, on every screen.</p>
      </div>

      <Link href="/login" className="blog-cta-action">
        Start free
      </Link>
    </aside>
  )
}
