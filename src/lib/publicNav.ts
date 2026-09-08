/**
 * The public site's own sections — where else a visitor can go — in the order both public
 * bars print them.
 *
 * **One list because there are two bars**, and neither may disagree with the other about what
 * this site is made of. `PublicHeader` draws the app's own chrome (`/`, the sign-in pages,
 * `/pricing`, `/changelog`, the four legal documents) and `SiteHeader` draws the paper surface
 * the blog and the free tools share. Two boxes and two palettes on purpose rather than by
 * accident: the `--blog-*` tokens `SiteHeader` is coloured from are scoped to `.blog` and
 * `.tool-page` in globals.css, so that bar cannot leave those two surfaces without dragging a
 * palette onto pages drawn in the app's own. What the two share is this answer, and the reason
 * it is a module rather than a constant in whichever file was written first is the reason
 * `publicRoutes.ts` gives for its own existence: two copies of one answer drift the first time
 * one is edited.
 *
 * Deliberately **not** derived from `PUBLIC_ROUTES`. That list answers "which paths are served
 * without a session", which is a different question and gives the wrong answers here twice
 * over: it holds `/verify` and the two password paths, which are links followed out of an email
 * and belong in no navigation at all, and it holds each of the six tools separately where a bar
 * wants the single word «Tools».
 */
export interface NavSection {
  /** Where the link goes — the section's index, never one page inside it. */
  href: string
  /**
   * What the link says, and also how a page names the section it belongs to (see
   * `navSectionsExcept`). Matched by value, so these strings are load-bearing.
   */
  label: string
}

/**
 * Three, in the order a visitor is most likely to want them: what it costs, what is free to
 * use with no account, what has been written about it.
 *
 * `/` is not among them — the mark on the left of both bars is already the way home, and a
 * second «Home» beside it would only repeat what the logo says. Neither are `/login` and
 * `/register`: those are the two actions, which each bar places on the right of the row rather
 * than among the sections, because they are what a visitor is being asked to *do* rather than
 * where they can go.
 */
export const NAV_SECTIONS: NavSection[] = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/tools', label: 'Tools' },
  { href: '/blog', label: 'Blog' },
]

/**
 * The sections worth printing on a page that is itself one of them — all of them but that one.
 *
 * A link to the page you are already standing on is a dead control, which is the rule
 * `SiteHeader`'s own section pill already states about itself; this is the same rule applied to
 * the row of links beside it. Matched on the **label** rather than on the path, so an article
 * (`/blog/<slug>`) and a single tool (`/tools/capo-calculator`) can each say which section they
 * belong to without either bar having to know how those paths are shaped.
 *
 * `undefined` — a page that is not a section, such as `/` or `/login` — keeps all three.
 */
export function navSectionsExcept(current?: string): NavSection[] {
  return current === undefined ? NAV_SECTIONS : NAV_SECTIONS.filter((section) => section.label !== current)
}
