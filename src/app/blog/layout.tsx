import { BlogHeader } from '@/components/BlogHeader'

/**
 * The frame around the blog.
 *
 * `BlogHeader` rather than `PublicHeader`: the design gives this surface its own bar, with the
 * section named beside the mark and two doors out of it — see that component for what it does
 * differently and why.
 *
 * **Nothing here turns translation on, and that is the point worth recording.** The blog is
 * readable by a browser's translator because the root layout no longer forbids it for the
 * whole document — a ban written on `<html>` and `<body>` could not have been lifted from
 * here, since those elements are written in one file and no child can take an attribute off
 * them. Removing it was the change that shipped this decision; see `app/layout.tsx` for the
 * argument and for the rule that replaced it, which is that a surface printing a chord name
 * marks itself.
 *
 * On this side, that rule means: an article's prose translates like any other page, and the
 * chords inside one opt out on their own — see `BlogChord` and `BlogChordTable`.
 */
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="blog">
      <BlogHeader />
      {children}
    </div>
  )
}
