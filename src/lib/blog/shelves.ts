import type { PostSummary } from './posts'

/**
 * Two decisions about which article goes where, kept out of the pages that draw them.
 *
 * Both are rules rather than layout, and both are the kind that go quietly wrong — an index
 * that hides an article, a «Read next» that offers the piece you just read. `npm test` in this
 * repo reaches plain modules and not React, so a rule written inside `blog/page.tsx` could not
 * be tested at all; here it can, which is the same split `plans/testCard.ts` makes next to
 * `checkout.ts`.
 */

/** How many cards the row under the featured article holds. */
const GRID_SIZE = 3

export interface Shelves {
  /** The newest article, given the width of the page. `null` before anything is published. */
  featured: PostSummary | null
  /** The row of three under it — empty unless all three exist. */
  grid: PostSummary[]
  /** Everything older, as a compact list. */
  earlier: PostSummary[]
}

/**
 * Divides what has been published into the three shapes the design draws.
 *
 * The design draws them full: eight articles fill it, one does not, and the honest failure of
 * a layout like this is not that it looks sparse but that its emptiness reads as a bug — a
 * three-column grid holding a single card, or a heading called «Earlier» with nothing under
 * it, both look like something failed to load.
 *
 * So each block appears only once there is enough to fill it. The newest article is always
 * featured; the next three fill the row **only if all three exist**, because two cards in a
 * row built for three read as a card that failed to render, and two on a row of their own is
 * a layout this design does not have. Whatever is left goes to «Earlier», which is nothing at
 * all until there are five articles.
 *
 * Takes the list already ordered — `listPosts` sorts it — and never reorders it.
 */
export function shelve(posts: readonly PostSummary[]): Shelves {
  const [featured, ...rest] = posts

  const grid = rest.length >= GRID_SIZE ? rest.slice(0, GRID_SIZE) : []
  const earlier = rest.slice(grid.length)

  return { featured: featured ?? null, grid, earlier }
}

/**
 * The two articles offered at the end of one.
 *
 * Same category first, then the newest of whatever is left. Somebody who read to the bottom of
 * a piece about capos has said what they are interested in, and the neighbouring piece is
 * usually more use to them than the most recent one; falling back to newest is what keeps the
 * block populated on a blog where most categories hold a single article.
 *
 * The current article is always excluded, which is the one thing here that would look broken
 * rather than merely unhelpful.
 */
export function pickReadNext(current: PostSummary, all: readonly PostSummary[], count = 2): PostSummary[] {
  const others = all.filter((post) => post.meta.slug !== current.meta.slug)

  const sameCategory = others.filter((post) => post.meta.category === current.meta.category)
  const rest = others.filter((post) => post.meta.category !== current.meta.category)

  return [...sameCategory, ...rest].slice(0, count)
}
