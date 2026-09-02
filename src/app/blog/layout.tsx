import { PublicHeader } from '@/components/PublicHeader'

/**
 * The frame around the blog: the same public bar every signed-out page wears, at
 * `/changelog`'s own 48rem — a column of prose is a column of prose, and the two should not
 * be two widths.
 *
 * The brand mark stays, for `/changelog`'s reason exactly: somebody who arrived here from a
 * search engine has no other way to find out whose site this is, and the mark in the corner
 * is the only way home on a page that is otherwise all text. No `cta` — `/login` and
 * `/pricing` point at each other because each is the thing the other does not say, while an
 * article's own invitation belongs at the end of it, where somebody has finished reading (see
 * `BlogCta`), not in the chrome above it where it competes with the headline.
 *
 * **Nothing here turns translation on, and that is the point worth recording.** The blog is
 * readable by a browser's translator because the root layout no longer forbids it for the
 * whole document — a ban written on `<html>` and `<body>` could not have been lifted from
 * here, since those elements are written in one file and no child can take an attribute off
 * them. Removing it was the change that shipped this decision; see `app/layout.tsx` for the
 * argument and for the rule that replaced it, which is that a surface printing a chord name
 * marks itself.
 *
 * On this side, that rule means: an article's prose translates like any other page, and a
 * chord written inside one opts out on its own — see `BlogChord`.
 */
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader width="48rem" />
      {children}
    </>
  )
}
