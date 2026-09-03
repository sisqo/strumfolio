import Link from 'next/link'

import { APP_NAME } from '@/lib/brand'
import { limitLabel } from '@/lib/plans/limits'
import { PLANS } from '@/lib/plans/types'

/**
 * The promotional panel that closes an article or a tool page — the redesigned one, from the
 * `Blog.dc.html` handoff.
 *
 * It replaces `BlogCta`, which was a dark band carrying one sentence and a button. The design
 * that replaced it does a different job: it says what the product *is* in three lines, each a
 * different reason somebody might want it, and it prices the first step («no card») instead of
 * leaving that to be discovered. A reader who got to the bottom of a piece about capos has
 * earned an actual offer rather than a slogan.
 *
 * **Shared rather than the blog's**, which is what «messo a comune» asked for: it takes no
 * props, reads its numbers from `PLANS`, and belongs to no single surface — the articles and
 * the free tools both close with it, and anything public added later can too. The one thing it
 * does *not* own is how far it bleeds out of the column it sits in: an article's prose column
 * is 720px and a tool page's is 1100px, so the break-out is a rule of the page (see
 * `.blog-article > .promo` in globals.css) and not of the panel.
 *
 * The numbers are read rather than typed, the rule `/login` already follows for the same
 * reason: a cap that changes has to change this sentence with it. It now appears on every
 * article and every tool page, so a stale number here is stale in more places than anywhere
 * else on the site.
 */

/** What the free plan actually gives, in the panel's own words. */
const FREE_PLAN = `${limitLabel(PLANS.free.songbooks, 'songbook')}, ${limitLabel(PLANS.free.songs, 'song')}, no card`

/**
 * The three reasons, in the order the design puts them: own it, use it anywhere, share it.
 *
 * Each opens with the promise and then earns it, because the bold half is what gets scanned
 * and the rest is what makes it true.
 */
const REASONS: { lead: string; rest: string }[] = [
  {
    lead: 'Make it yours',
    rest: 'import your files, edit with chords above the words, export whenever',
  },
  {
    lead: 'Play it anywhere',
    rest: 'any screen you own, offline, in your key with your capo',
  },
  {
    lead: 'Share it live',
    rest: 'anyone can follow from a link, with no account at all',
  },
]

/** The tick beside each reason. Drawn here rather than added to `icons.tsx`: it is one path,
 *  it is only ever this size, and the set in `icons.tsx` is the app's, not the site's. */
function Tick() {
  return (
    <svg
      className="promo-tick"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

export function PromoPanel() {
  return (
    <aside className="promo">
      <div className="promo-body">
        <span className="promo-eyebrow">{APP_NAME}</span>

        <p className="promo-title">
          Your favourite songs. <span className="promo-title-accent">Ready to play.</span>
        </p>

        <p className="promo-lede">
          Stop juggling tabs and screenshots. Your whole repertoire, in your key, in your pocket.
        </p>

        <div className="promo-reasons">
          {REASONS.map((reason) => (
            <p key={reason.lead} className="promo-reason">
              <Tick />
              <span>
                <strong>{reason.lead}</strong> — {reason.rest}
              </span>
            </p>
          ))}
        </div>

        <div className="promo-actions">
          <Link href="/login" className="promo-action">
            Start free
          </Link>
          <span className="promo-note">{FREE_PLAN}</span>
        </div>
      </div>

      {/*
        * The phone the design stands in the right-hand column, overflowing the panel's top
        * edge, is not here yet: `uploads/smartphone2.png` in the handoff is larger than the
        * design MCP will hand over in one piece (it comes back `truncated: true`), and the
        * only phone already in this repo — `brand/device-mockup.webp` — is a three-device
        * group shot on white, which cannot be cut into something that floats on a tint.
        *
        * The column and its clearance are written and waiting in `globals.css`
        * (`.promo-phone`, and `.promo.has-phone`'s extra padding): dropping the file into
        * `public/promo/` and rendering the `<Image>` here is the whole of the remaining work.
        * Until then the panel is one column, which is a shape the design also holds — the
        * grid falls back to it below 60rem anyway.
        */}
    </aside>
  )
}
