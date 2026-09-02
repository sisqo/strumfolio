/**
 * A chord name written inside an article.
 *
 * It exists for one reason, and the reason is not typography: `translate="no"`. Blog pages
 * deliberately let a browser translate them — see `app/blog/layout.tsx` — because an article
 * that cannot be read by somebody whose English is shaky is an article that fails at the one
 * job the blog has. But a chord is not prose. `A` translated into Italian is `La`, `B` into
 * `Si`, and a paragraph explaining *why* the note is called `A` becomes nonsense the moment a
 * translator rewrites the `A` in it.
 *
 * So the page is translatable and each chord in it is not, one by one. This is the same
 * device `SongSheet` and `GraphicEditor` already use on their own containers, applied at the
 * only granularity that works here.
 *
 * Available to every article without an import — see `src/mdx-components.tsx`.
 */
export function BlogChord({ children }: { children: React.ReactNode }) {
  return (
    <code className="blog-chord" translate="no">
      {children}
    </code>
  )
}
