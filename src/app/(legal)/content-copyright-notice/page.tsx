import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Content & Copyright Notice' }

const CONTACT = 'info@strumfolio.com'

export default function ContentCopyrightNoticePage() {
  return (
    <>
      <h1>Content &amp; Copyright Notice</h1>
      <p className="legal-updated">Last updated: 23 August 2026</p>

      <p>
        Strumfolio (strumfolio.com) is a tool for managing your own personal song collection, run by an
        individual developer rather than a company, with a free plan and paid plans. This notice
        clarifies how content and copyright work within the Service, regardless of which plan an
        account is on.
      </p>

      <h2>1. No built-in song library</h2>
      <p>
        <strong>Strumfolio does not contain a song catalog or library to browse.</strong> There is
        nothing pre-loaded into your collection and nothing to search through before you have added
        anything of your own. Every song that appears in your collection is either content you have
        personally typed in or imported from a file on your own device, or the one exception below,
        which you still add yourself with a deliberate action of your own.
      </p>
      <p>
        <strong>The one exception</strong> is the optional “Example songbook”: an account with no
        songbook yet may add it with a single click, and it brings in a small, fixed set of
        traditional songs — hymns and folk ballads with no living author and no active copyright
        anywhere, kept in this app the same way any public-domain text is kept in any other. Nothing
        else is ever added this way, on this account or any other, and the option itself is only ever
        offered to an account with no songbook yet.
      </p>
      <p>
        The Service does not search the web, scrape third-party sites, or fetch content from external
        sources on your behalf. Nothing enters your collection unless you put it there — including the
        example songbook above, which only ever arrives on your own click, never on its own.
      </p>

      <h2>2. What you may keep here</h2>
      <p>
        Strumfolio does not ask what a song is or where it came from. Your collection can hold any song
        you play — your own, someone else&apos;s, one you have known for thirty years. What the Service
        is built for, and all it supports, is <strong>personal use</strong>: playing, rehearsing,
        singing.
      </p>
      <p>Two things stay yours to answer for:</p>
      <ul>
        <li>that you came by the song lawfully, and</li>
        <li>that it stays inside that personal use.</li>
      </ul>
      <p>
        Strumfolio neither grants nor can grant any right over the underlying work, and nothing here is
        a licence to reproduce or distribute it. Whether a personal copy is yours to keep is between you
        and the law where you live; making a work available to other people is what the law reserves to
        the rightsholder, and that is the line this notice is about.
      </p>
      <p>
        Strumfolio does not review, verify, index, or endorse the content you import, and does not make
        any user&apos;s content publicly searchable or browsable by other users.
      </p>

      <h2>3. Where personal use ends</h2>
      <p>
        Three things this app can do touch that line — a live session, a backup, a printed booklet.
        Here is where each of them falls.
      </p>
      <p>
        <strong>Strum Together</strong> shows a song, live, on the screens of people who opened your
        link. That is a private performance among people you invited: nobody reaches a session without
        the link you handed them, and what is shown ends when the session does. It is not a broadcast,
        and it is not a publishing or distribution feature — it grants no rights over the underlying
        work to Strumfolio or to anyone in the session, and participants should not record or
        redistribute what they were shown. How many devices your plan allows changes how many people
        can be in the room; it does not change what the room is.
      </p>
      <p>
        <strong>The backup and the printable booklet</strong> hand you your own collection, as a file or
        on paper, for yourself. Strumfolio does not review what comes out of either, and what you do
        with it afterwards is yours to answer for rather than something the Service authorizes.
      </p>

      <h2>4. Copyright concerns</h2>
      <p>
        If you believe that content stored by a user of Strumfolio infringes your copyright, contact us
        at <a href={`mailto:${CONTACT}`}>{CONTACT}</a> with details of the content, the work you claim
        is infringed, and your contact information.
      </p>
      <p>
        Content on Strumfolio lives inside private, individual accounts that we do not routinely access
        or review — see our <Link href="/privacy-policy">Privacy Policy</Link>. Because of that, we
        cannot verify the substance of a claim ourselves. What we do instead: within a few business
        days, we forward a complete notice to the account holder and ask them to remove the content or
        explain why it does not infringe; if the notice is clear-cut or they do not respond, we
        restrict or disable access to the account rather than inspect its private content ourselves.
      </p>
      <p>
        The account holder may reply with a counter-notice — for example, that the content is their
        own work, is in the public domain, is used under a license they hold, or is a personal copy
        they keep for playing and do not distribute — which we will pass back to you. If the two of you cannot resolve it this way, the dispute remains between you and
        the account holder, to pursue through whatever legal channels apply.
      </p>

      <h2>5. Changes to this notice</h2>
      <p>
        We may update this notice from time to time. Significant changes will be communicated through
        the app or by email.
      </p>
    </>
  )
}
