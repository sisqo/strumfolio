import Link from 'next/link'

import { SITE_URL } from '@/lib/brand'
import { COPYRIGHT_YEAR, CURRENT_VERSION } from '@/lib/changelog'

/**
 * The identity line at the foot of every internal page: whose this is, which version of it, and
 * which build. Three things on one line rather than three, because they answer one question
 * between them — *what is this, and which one of it am I looking at* — and a footer that grows a
 * row per fact ends up taller than the page it is under.
 *
 * It used to read "by SisQo · commit hash", borrowed from `easy-guitar-tuner`, and the
 * attribution is gone at the owner's own request. Nothing replaced it: the copyright line names
 * who this belongs to already, which is the fact the byline was carrying. (The Ko-fi badge that
 * once sat above all this is long gone too — no design this app shipped ever showed one.)
 *
 * The version is a link to `/changelog`, which is the whole reason it is worth printing: a
 * number nobody can look up is decoration. It is deliberately still *also* reachable by the
 * word "Changelog" in the row below — the two are not redundant, they are two ways of
 * scanning. Somebody who wants to know what changed looks for the word; somebody who has been
 * told "fixed in 1.1" looks for the number, sees they are on 1.0, and clicks it.
 *
 * The commit hash stays, and stays last: it is for whoever is diagnosing a deployment, and it
 * is the one thing here no reader has any use for.
 *
 * `COMMIT_HASH` unset reads `dev`, which is what a local run is. Both the year and the version
 * come from `lib/changelog.ts`, derived from the newest release — see their own comments on why
 * neither is a `new Date()` nor a second hand-maintained copy.
 *
 * A plain server component: nothing here is interactive, so nothing needs to ship to
 * the client.
 */
export function Footer() {
  return (
    <footer className="app-footer">
      <p className="app-footer-credit">
        &copy; {COPYRIGHT_YEAR} {SITE_URL} &middot;{' '}
        <Link href="/changelog">v{CURRENT_VERSION}</Link> &middot;{' '}
        <span className="font-mono">{process.env.COMMIT_HASH ?? 'dev'}</span>
      </p>

      {/*
       * The one place every legal document is reachable from, since it is the one
       * piece of chrome every screen that renders `Footer` already shares — no
       * separate placement to keep in sync with this list as pages come and go.
       *
       * `/brand` used to close this row too, back when it was a public page reachable with
       * no session; now that it is owner-only like `/accounts` or `/design-system`
       * (`middleware.ts`, `src/app/brand/page.tsx`), it no longer belongs beside four links
       * every one of which — legal documents and the changelog — every visitor must reach.
       */}
      {/*
        * Each entry carries its own trailing separator (drawn by CSS on `.app-footer-item`)
        * rather than sitting beside a separator of its own. The dots used to be flex items in
        * their own right, which meant a wrapped row could *begin* with one — «· Tools» on a
        * second line, which is what a phone showed the moment this row grew a seventh entry.
        * A separator glued to the end of the item before it cannot start a line.
        */}
      <nav className="app-footer-legal" aria-label="Site and legal">
        <span className="app-footer-item">
          <Link href="/privacy-policy">Privacy</Link>
        </span>
        <span className="app-footer-item">
          <Link href="/terms-of-service">Terms</Link>
        </span>
        <span className="app-footer-item">
          <Link href="/cookie-policy">Cookies</Link>
        </span>
        {/*
          * «Content copyright», not «Copyright», since the credit line above now opens with a
          * © of its own: that one is this site's, while this is the notice about the songs
          * *readers* put in — whose they are, and what to do if one of them is yours. Two
          * different questions that the single word answered ambiguously the moment the © was
          * added. Two words rather than the destination's full «Content & Copyright Notice»:
          * a footer label wants to be scannable, and an ampersand among middle dots reads as
          * one more separator.
          */}
        <span className="app-footer-item">
          <Link href="/content-copyright-notice">Content copyright</Link>
        </span>
        {/* A reader looking for "what's new" has nowhere else to look, and a release note is
            worth nothing if only the person who wrote it can find it. */}
        <span className="app-footer-item">
          <Link href="/changelog">Changelog</Link>
        </span>
        {/* The one place the blog is linked from inside the app. It is written for people who
            have not arrived yet — a visitor lands on an article from a search, not from here —
            so this row, which every screen already carries, is the whole of its billing:
            `PublicHeader` holds one CTA and it is spent on the pair /login and /pricing. */}
        <span className="app-footer-item">
          <Link href="/blog">Blog</Link>
        </span>
        {/*
          * The free tools, for the same reason the blog is here: they are written to be found
          * from a search, so nothing inside the app pointed at them and a visitor who landed
          * on one had no way to the rest.
          *
          * Pointed at `/tools` rather than at the one tool that exists today. That address is
          * a redirect for now (`app/tools/page.tsx` explains why it is not yet an index — one
          * card is a thin page), and aiming the durable label at the durable address means the
          * day it becomes a real index this line does not have to be found and changed.
          */}
        <span className="app-footer-item">
          <Link href="/tools">Tools</Link>
        </span>
      </nav>
    </footer>
  )
}
