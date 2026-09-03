import { SiteHeader } from '@/components/SiteHeader'

/**
 * The frame around the free tools.
 *
 * Same bar as the blog, with a different word in the pill — see `SiteHeader`. Both are pages
 * written to be found rather than signed in to, and a visitor who arrives at a converter from
 * a search and then clicks through to an article should not feel they changed sites.
 *
 * `.tool-page` carries the same paper tokens `.blog` does (globals.css), which is why the two
 * share a palette without sharing a class name that would read as a lie on one of them.
 */
export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="tool-page">
      <SiteHeader section="Tools" />
      {children}
    </div>
  )
}
