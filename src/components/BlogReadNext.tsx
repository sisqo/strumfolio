import Link from 'next/link'

import { postPath } from '@/lib/blog/openGraph'
import type { PostSummary } from '@/lib/blog/posts'

/**
 * Two more articles, at the foot of the one just finished.
 *
 * **Which two is decided by `pickReadNext` in `lib/blog/shelves.ts`, not here** — see it for
 * the rule, and for why it lives in a plain module. This component
 * only draws them, and draws nothing at all when there is nothing to offer: a heading called
 * «Read next» over an empty row is worse than no heading, and the blog spends its first months
 * in exactly that state.
 */
export function BlogReadNext({ posts }: { posts: PostSummary[] }) {
  if (posts.length === 0) return null

  return (
    <section className="blog-read-next">
      <h2 className="blog-read-next-title">Read next</h2>

      <div className="blog-read-next-grid">
        {posts.map(({ meta }) => (
          <Link key={meta.slug} href={postPath(meta.slug)} className="blog-read-next-card">
            <span className="blog-category">{meta.category}</span>
            <span className="blog-read-next-headline">{meta.title}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
