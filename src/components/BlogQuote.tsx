/**
 * The one sentence an article stops on.
 *
 * A rule down the accent side on a warm tint, rounded away from the rule — not centred, not
 * italic, not in quotation marks. It is a restatement of the piece's own argument rather than
 * somebody else's words, so it is set as emphasis and not as a citation: `<p>` inside an
 * `<aside>`, never `<blockquote>`, which would tell a screen reader this came from elsewhere.
 *
 * Distinct from the quieter `blockquote` styling `.article-body` gives ordinary markdown `>`
 * quotes — that one is for an aside, this one is for the line the article is remembered by,
 * and an article should hold at most one.
 */
export function BlogQuote({ children }: { children: React.ReactNode }) {
  return (
    <aside className="blog-quote">
      <p>{children}</p>
    </aside>
  )
}
