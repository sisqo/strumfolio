import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Terms of Service' }

const CONTACT = 'info@strumfolio.com'

export default function TermsOfServicePage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="legal-updated">Last updated: 22 August 2026</p>

      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of Strumfolio (&ldquo;the
        Service&rdquo;), run at strumfolio.com by an individual developer rather than a company
        (&ldquo;we&rdquo;, &ldquo;us&rdquo;). Strumfolio offers a free plan with no end date, and paid
        plans with additional limits and features — see our <Link href="/pricing">Pricing</Link> page
        for what each plan includes and costs. By accessing or using Strumfolio, including by joining a
        Strum Together session through a shared link, you agree to these Terms.
      </p>

      <h2>1. The Service</h2>
      <p>
        Strumfolio lets you import, organize, edit and export your own collection of lyrics and
        chords, and
        offers features such as key/capo transposition and Strum Together, a feature that syncs a song
        across multiple devices in real time.
      </p>
      <p>
        <strong>Strumfolio does not provide, host, or include any pre-existing song lyrics or chord
        charts.</strong> There is no built-in catalog or library of any kind, and the Service does not
        search, fetch, or download content from third-party websites on your behalf. Every song in
        your collection is content that you personally type in or import from a file on your own
        device — the Service is only a tool for organizing and displaying your own material.
      </p>

      <h2>2. Accounts and access</h2>
      <p>
        Registration is open: you can create an account using an email address and password, or by
        signing in with Google. You are responsible for maintaining the confidentiality of your
        account and for all activity that occurs under it. Notify us promptly if you believe your
        account has been accessed without your authorisation.
      </p>
      <p>
        You may use the Service only if you are legally able to enter into these Terms under the law
        of your country. If you are a minor, you may use Strumfolio only with the permission and
        involvement of a parent or guardian, who accepts these Terms on your behalf.
      </p>
      <p>
        We may refuse, suspend, or remove accounts at our discretion where necessary to protect the
        Service or comply with the law.
      </p>

      <h2>3. Your content</h2>
      <p>
        You retain full ownership of the songs, lyrics, chords and other content you import into
        Strumfolio (&ldquo;Your Content&rdquo;). We do not claim any ownership of it. You grant us only
        the limited technical permission to store, process and display Your Content as needed to
        operate the Service for you and for the participants you invite to a Strum Together session.
      </p>
      <p>
        Your Content can be any song you play, whoever wrote it. What the Service is for is personal
        use — playing, rehearsing, singing — and by using Strumfolio you confirm that:
      </p>
      <ul>
        <li>you came by Your Content lawfully;</li>
        <li>
          you keep it within that personal use, and do not use the Service to publish, sell or
          otherwise distribute a work that is not yours to distribute.
        </li>
      </ul>
      <p>
        Strumfolio is a tool for keeping and reading your own collection — we do not license, provide,
        or claim any rights over song lyrics or chord charts, none are included with the Service, and
        nothing here grants you any right over a work you did not already have. You are solely
        responsible for the legality of the content you import and of what you do with it. Our{' '}
        <Link href="/content-copyright-notice">Content &amp; Copyright Notice</Link> sets out where
        that line falls in each of the Service&apos;s own features, and what happens when a
        rightsholder writes to us.
      </p>

      <h2>4. Strum Together</h2>
      <p>
        When you start a Strum Together session, you act as the session leader and control what is
        displayed on the devices of participants who join via your shared link.{' '}
        <strong>Anyone holding the link can join without an account</strong> and can view the shared
        content for the duration of the session. A session is a private performance among people you
        invited, not a broadcast: how many devices your plan allows changes how many people can be in
        the room, not what the room is. You are responsible for who you share that link with, and for
        keeping the session inside the personal use described in section 3.
      </p>
      <p>
        Participants who join a session are bound by these Terms for the duration of their
        participation, and must not record, redistribute, or otherwise reuse the content displayed to
        them without the rightsholder&apos;s permission.
      </p>

      <h2>5. Exporting and printing</h2>
      <p>
        Strumfolio lets you export Your Content as a backup, or as a typeset PDF booklet meant to be
        printed. Once downloaded, a file is outside the Service and entirely in your own hands. You are
        responsible for having the right to print, copy, or hand out Your Content in that form, the
        same as for anything you import or display within the app — Strumfolio does not review, endorse,
        or track what happens to an exported file once it has left the Service.
      </p>

      <h2>6. Acceptable use</h2>
      <p>You agree not to use Strumfolio to:</p>
      <ul>
        <li>upload or share content that is illegal, infringes third-party rights, or that you do not have the right to use;</li>
        <li>attempt to disrupt, reverse-engineer, or gain unauthorized access to the Service;</li>
        <li>place an unreasonable load on the Service, including through automated or bulk access;</li>
        <li>use the Service for any purpose other than personal, non-commercial use of your own song collection, unless otherwise agreed with us.</li>
      </ul>

      <h2>7. Availability and no warranty</h2>
      <p>
        Strumfolio is provided &ldquo;as is&rdquo; and free of charge, with no warranty of any kind,
        express or implied. While we aim to keep the Service available and reliable, we do not
        guarantee uninterrupted or error-free operation, and we are not liable for temporary
        unavailability of the Service. We may modify, suspend or discontinue the Service, in whole or
        in part, at any time; where reasonably possible we will give advance notice so that you can
        export your collection.
      </p>
      <p>
        <strong>Keep your own backups.</strong> The export feature lets you download your collection
        at any time, and you should use it regularly rather than relying on Strumfolio as your only
        copy.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        Strumfolio is provided free of charge, on a non-commercial basis, and is maintained by a single
        individual rather than by a company. To the extent permitted by law, we are not liable for any
        indirect, incidental, or consequential damages arising from your use of Strumfolio, including
        loss of data or of content you have imported.
      </p>
      <p>
        Nothing in these Terms excludes or limits liability for death or personal injury caused by
        negligence, for fraud or wilful misconduct, or any other liability that cannot be excluded
        under applicable law — including mandatory consumer protection rights.
      </p>

      <h2>9. Termination</h2>
      <p>
        We may suspend or terminate access to the Service for accounts that violate these Terms. You
        may stop using Strumfolio at any time and delete your account, together with all of Your
        Content, directly from within the app. Deletion is immediate on the live service; see the
        Privacy Policy for how residual copies in backups and logs are handled.
      </p>

      <h2>10. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. If we make significant changes, we will notify
        you through the app or by email. Continued use of Strumfolio after changes take effect
        constitutes acceptance of the new Terms.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These Terms are governed by the laws of Italy, without prejudice to any mandatory consumer
        protection rights you may have under the laws of your country of residence. If you are a
        consumer, any dispute is subject to the exclusive jurisdiction of the court of your own place
        of residence or domicile, as Italian consumer law requires. In every other case, the
        competent court is that of the developer&apos;s place of residence, in Italy.
      </p>

      <h2>12. Contact</h2>
      <p>
        For any question about these Terms, contact us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </>
  )
}
