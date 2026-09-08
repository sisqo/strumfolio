/**
 * The public site's own sections — where else a visitor can go — in the order `SiteHeader`
 * prints them on the blog and the free tools.
 *
 * **One reader, and it briefly had two.** It was written for both public bars on the day `/`
 * stopped being the sign-in form, on the reasoning that neither may disagree with the other
 * about what this site is made of. Then `Home.dc.html` arrived and drew the app's own bar with
 * no sections at all — theme, «Pricing», «Sign in», «Start free» — and the mock won. So
 * `PublicHeader` carries none of this, deliberately, and the list is the paper bar's alone:
 * a reader who is *in* the blog or the tools can move around them, and everybody else has
 * `Footer`'s row, which every page carries.
 *
 * Kept as a module rather than folded into `SiteHeader` for the reason it was extracted: the
 * next surface written to be found from a search will want the same names in the same order,
 * and a constant inside one component is where the second copy comes from.
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
