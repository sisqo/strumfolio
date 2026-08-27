import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Privacy Policy' }

const CONTACT = 'info@strumfolio.com'

export default function PrivacyPolicyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated: 21 August 2026</p>

      <p>
        This Privacy Policy explains how Strumfolio (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses, and
        protects your personal data when you use this service.
      </p>

      <h2>1. Who we are</h2>
      <p>
        Strumfolio (strumfolio.com) is run by an individual developer, with no company or commercial
        entity behind it, offering a free plan and paid plans — see our{' '}
        <Link href="/pricing">Pricing</Link> page for details. That individual is the
        data controller for the personal data described in this policy, and can be reached at the
        contact address below. If you need the controller&apos;s full identity — for example to
        exercise your rights or to file a complaint — write to that address and we will provide it
        without delay.
      </p>
      <p>
        For any privacy-related question, you can contact us at:{' '}
        <strong>
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </strong>
        .
      </p>

      <h2>2. What data we collect</h2>
      <p>
        <strong>Account data.</strong> The email address you use to sign in, and:
      </p>
      <ul>
        <li>
          if you sign in with an email address and password, a cryptographic hash of your password —
          we never store or see the password itself;
        </li>
        <li>
          if you sign in with Google, the email address and basic profile information (such as your
          name and profile picture) that we receive <strong>from your Google account</strong>; we
          never receive your Google password.
        </li>
      </ul>
      <p>
        <strong>Plan and billing status.</strong> Which plan your account is on, including any paid
        plan, its renewal or expiry date, and any upgrade, downgrade or cancellation you have already
        scheduled. Strumfolio does not currently collect or transmit any payment card details — see our{' '}
        <Link href="/pricing">Pricing</Link> page for the plans on offer.
      </p>
      <p>
        <strong>Preferences.</strong> Basic display and app settings you choose, stored on your device
        or with your account so that the app behaves the way you left it.
      </p>
      <p>
        <strong>Content you create.</strong> The songs, lyrics, chords, songbooks and sections you
        personally import or create. Strumfolio does not host or provide any pre-existing lyrics,
        chords, or song library — all content in your collection comes from you, entered manually or
        imported from files on your own device.
      </p>
      <p>
        <strong>Usage and technical data.</strong> Basic technical information needed to run and
        secure the service, such as log data, device and browser type, and IP address as processed by
        our hosting provider.
      </p>
      <p>
        <strong>Aggregated analytics.</strong> We use Vercel Web Analytics and Speed Insights to
        understand overall traffic and page performance. These tools do not use cookies and do not
        build cross-site profiles: visitors are identified by a temporary hash that is discarded
        within 24 hours, and only aggregated data is available to us.
      </p>
      <p>
        <strong>Strum Together sessions.</strong> When you create or join a session, we process the
        session identifier and the synchronisation data needed to keep devices in step. Participants
        can join a session through a shared link <strong>without creating an account</strong>; for
        those participants we process only the session identifier and the minimum technical data
        needed to run the session — see section 6 for how long that data lasts.
      </p>
      <p>
        For details on cookies and local storage, see our{' '}
        <Link href="/cookie-policy">Cookie Policy</Link>.
      </p>

      <h2>3. Why we collect it, and on what legal basis</h2>
      <table>
        <thead>
          <tr>
            <th>Purpose</th>
            <th>Legal basis (GDPR)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Create and manage your account</td>
            <td>Performance of a contract — Art. 6(1)(b)</td>
          </tr>
          <tr>
            <td>Store, sync and let you access your song collection</td>
            <td>Performance of a contract — Art. 6(1)(b)</td>
          </tr>
          <tr>
            <td>Run Strum Together sessions, including for participants without an account</td>
            <td>
              Performance of a contract — Art. 6(1)(b) — and, for participants without an account, our
              legitimate interest in delivering the session requested by the leader — Art. 6(1)(f)
            </td>
          </tr>
          <tr>
            <td>Send service emails (email verification, password reset, account notices)</td>
            <td>Performance of a contract — Art. 6(1)(b)</td>
          </tr>
          <tr>
            <td>Keep the service secure and working properly</td>
            <td>
              Legitimate interest in preventing abuse, diagnosing faults and protecting the service and
              its users — Art. 6(1)(f)
            </td>
          </tr>
          <tr>
            <td>Measure aggregate traffic and performance</td>
            <td>Legitimate interest in maintaining and improving the service — Art. 6(1)(f)</td>
          </tr>
        </tbody>
      </table>

      <p>
        <strong>Is providing this data required?</strong> Providing an email address is necessary to
        create an account and use Strumfolio: without it we cannot provide the Service, and no account
        can be created. Everything else — the songs you add, the preferences you set — is entirely up
        to you.
      </p>
      <p>
        <strong>Automated decision-making.</strong> We do not carry out automated decision-making or
        profiling that produces legal effects for you or similarly significantly affects you.
      </p>

      <h2>4. Who processes data on our behalf</h2>
      <p>
        Strumfolio is a small project built on a limited number of technical providers. The following
        act as our data processors under a data processing agreement:
      </p>
      <ul>
        <li>
          <strong>Vercel Inc.</strong> — hosting, application delivery, and Vercel Web Analytics /
          Speed Insights.
        </li>
        <li>
          <strong>Neon</strong> — the PostgreSQL database where your account and content are stored,
          provisioned through Vercel.
        </li>
        <li>
          <strong>Resend</strong> — delivery of transactional emails (email verification, password
          reset, account notices).
        </li>
      </ul>
      <p>
        <strong>Google LLC</strong> is different: if you choose to sign in with Google, Google acts as
        an independent data controller for your Google account and for the sign-in process itself,
        under its own privacy policy. We only receive the account details listed in section 2 as a
        result of that sign-in.
      </p>
      <p>
        We do not sell your data, and we do not share it with anyone for advertising or marketing
        purposes. We may disclose data where required to do so by law.
      </p>

      <h2>5. International transfers</h2>
      <p>
        Some of these providers are established in the United States or may process data outside the
        European Economic Area. Where that happens, transfers are covered by appropriate safeguards
        under Chapter V GDPR — the EU-U.S. Data Privacy Framework where the provider is certified
        (Vercel and Google are), and the European Commission&apos;s Standard Contractual Clauses in the
        remaining cases. You can obtain a copy of these safeguards, or further details about them, by
        writing to the contact address above.
      </p>

      <h2>6. How long we keep your data</h2>
      <p>
        We keep your account and content data for as long as your account is active. When you delete
        your account from within the app, your account and your songs are removed immediately from
        the live service; residual copies in encrypted backups and technical logs are erased within
        our normal backup rotation cycle, except where we are required to retain data by law. Sing
        Together session data is deleted as soon as the broadcaster ends the session, and in any case
        automatically stops being usable after a few hours of inactivity even if it is never
        explicitly ended. Analytics data is aggregated and retained in non-identifying form.
      </p>

      <h2>7. Your rights</h2>
      <p>If you are in the EU/EEA, under the GDPR you have the right to:</p>
      <ul>
        <li>access the personal data we hold about you;</li>
        <li>correct inaccurate data;</li>
        <li>request deletion of your data;</li>
        <li>request a copy of your data in a portable format;</li>
        <li>restrict certain processing;</li>
        <li>withdraw any consent you have given, without affecting processing carried out before withdrawal;</li>
        <li>
          lodge a complaint with your national data protection authority (in Italy, the Garante per la
          Protezione dei Dati Personali).
        </li>
      </ul>
      <p>
        <strong>Your right to object.</strong> Where we process your data on the basis of our
        legitimate interest — namely to keep the Service secure and to measure aggregate traffic and
        performance — <strong>you have the right to object to that processing at any time, on grounds
        relating to your particular situation.</strong> If you object, we will stop that processing
        unless we can demonstrate compelling legitimate grounds that override your interests, rights
        and freedoms. To object, write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
      <p>
        Strumfolio lets you <strong>export your full collection and delete your account directly from
        within the app</strong>, at any time and without having to ask us. For anything else, or if a
        self-service option is not working, contact us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        We aim to respond within 30 days.
      </p>

      <h2>8. Data security</h2>
      <p>
        We take reasonable technical and organizational measures to protect your data against
        unauthorized access, loss, or misuse, including encrypted connections, hashed passwords, and
        access limited to what is needed to run the service. No system is 100% secure, and we
        encourage you to keep your account credentials confidential.
      </p>

      <h2>9. Children</h2>
      <p>
        Strumfolio is a general-purpose tool and is not directed at children. If you are a minor under
        the law of your country, you should use Strumfolio only with the involvement and permission of a
        parent or guardian. If we become aware that we hold data relating to a child in a way that is
        not permitted under applicable law, we will delete it.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. If we make significant changes, we will
        notify you through the app or by email.
      </p>

      <h2>11. Contact</h2>
      <p>
        For any question about this policy or your data, contact us at{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </>
  )
}
