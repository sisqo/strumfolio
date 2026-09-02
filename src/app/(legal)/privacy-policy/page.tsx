import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Privacy Policy' }

const CONTACT = 'info@strumfolio.com'

export default function PrivacyPolicyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated: 3 September 2026</p>

      <p>
        This Privacy Policy explains how Strumfolio (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses, and
        protects your personal data when you use this service.
      </p>

      <h2>1. Who we are</h2>
      <p>
        Strumfolio (strumfolio.com) is run by an individual developer, with no company behind it,
        offering a free plan and paid plans — see our <Link href="/pricing">Pricing</Link> page for
        details. That individual is the data controller for the personal data described in this
        policy, and can be reached at the contact address below. If you need the controller&apos;s
        full identity — for example to exercise your rights or to file a complaint — write to that
        address and we will provide it without delay. Paid plans are sold through Paddle, our payment
        partner, which is a separate controller for the payment itself — see section 4.
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
        <strong>Account data.</strong> Your first and last name, the email address you use to sign
        in, and:
      </p>
      <ul>
        <li>
          if you sign in with an email address and password, a cryptographic hash of your password —
          we never store or see the password itself. Until you confirm your address, the registration
          waits in a pending list with a hashed one-time link that expires after 24 hours;
        </li>
        <li>
          if you sign in with Google, the email address and basic profile information (your name and
          profile picture) that we receive <strong>from your Google account</strong>; we never
          receive your Google password.
        </li>
      </ul>
      <p>
        We also keep a count of your sign-ins and the time of the last one, and — if you ask for a
        password reset — a hashed one-time link that expires after one hour.
      </p>
      <p>
        <strong>Plan and billing status.</strong> Which plan your account is on, including any paid
        plan, its renewal or expiry date, any upgrade, downgrade or cancellation you have scheduled,
        and a history of your purchases and plan changes (date, plan, amount, billing cycle). When
        you buy a plan, the payment itself is handled by Paddle, our merchant of record: Paddle
        collects your payment details, billing address and the tax information it needs, and{' '}
        <strong>Strumfolio never receives your full card number</strong>. What we receive back from
        Paddle is the confirmation of the payment, the plan, amount and status, and the identifiers
        Paddle assigns to the transaction and the subscription, so that we can match them to your
        account.
      </p>
      <p>
        <strong>Newsletter preference.</strong> Whether you asked to receive our newsletter and how
        often, with the dates you subscribed or unsubscribed. You can change it at any time from the
        settings inside the app. We have not sent a newsletter yet; every issue will carry a link to
        unsubscribe. If you register with Google, nothing asks you at sign-up: the preference starts
        switched off, and the settings are where you turn it on.
      </p>
      <p>
        <strong>Preferences.</strong> Display and reading settings you choose — theme, zoom, scroll
        speed, notation, instrument — and, per song, the key, capo and chord display you last used.
        They are stored with your account, and on your device so that the app behaves the way you left
        it even offline.
      </p>
      <p>
        <strong>Content you create.</strong> The songs, lyrics, chords, songbooks, sections and
        private comments you personally import or create. Apart from the Example songbook — a small,
        fixed set of public-domain songs that a new account starts with, described in our{' '}
        <Link href="/content-copyright-notice">Content &amp; Copyright Notice</Link> — Strumfolio
        does not host or provide any pre-existing lyrics, chords, or song library: all content in
        your collection comes from you, entered manually or imported from files on your own device.
      </p>
      <p>
        <strong>Feedback and feature requests.</strong> If you send us feedback from within the app,
        we receive your message, the category you chose, an optional screenshot you attach, your
        email address and your plan. It arrives in our inbox as an email we can reply to.
      </p>
      <p>
        <strong>Usage and technical data.</strong> Basic technical information needed to run and
        secure the service: log data, device and browser type, and IP address as processed by our
        hosting provider. To limit abuse, we count sign-in, registration, password-reset and feedback
        attempts per IP address and per email address over ten-minute windows. On registration and
        password recovery, a Cloudflare Turnstile challenge tells humans from automated scripts; it
        processes your IP address and technical signals from your browser, and we receive from it only
        a pass or fail.
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
        those participants we process only a random device identifier stored in a cookie, so that a
        browser counts as one device towards the leader&apos;s plan limit, the time it was last seen,
        and the minimum technical data needed to run the session — see section 6 for how long that
        data lasts. The identifier is not linked to a name or an email address.
      </p>
      <p>
        <strong>Notifications to us.</strong> A few events send a short message to the developer,
        through a private Telegram chat, so that the Service can be run without watching a
        dashboard: that an account was created, that a plan was bought (which plan, and the amount),
        scheduled for a downgrade or cancelled, and that a piece of feedback arrived. These messages
        contain <strong>no personal data</strong> — no name, no email address, none of your words —
        only the kind of event.
      </p>
      <p>
        For details on cookies, local storage and the offline cache, see our{' '}
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
            <td>Store, sync and let you access your song collection and preferences</td>
            <td>Performance of a contract — Art. 6(1)(b)</td>
          </tr>
          <tr>
            <td>Sell you a plan, apply it to your account, and keep your payment history</td>
            <td>
              Performance of a contract — Art. 6(1)(b) — and, for keeping records of payments, our
              legal obligations in tax and accounting matters — Art. 6(1)(c)
            </td>
          </tr>
          <tr>
            <td>Run Strum Together sessions, including for participants without an account</td>
            <td>
              Performance of a contract — Art. 6(1)(b) — and, for participants without an account, our
              legitimate interest in delivering the session requested by the leader — Art. 6(1)(f)
            </td>
          </tr>
          <tr>
            <td>Send service emails (email verification, password reset, purchase and plan-change notices)</td>
            <td>Performance of a contract — Art. 6(1)(b)</td>
          </tr>
          <tr>
            <td>Send you the newsletter</td>
            <td>Your consent — Art. 6(1)(a) — which you can withdraw at any time from the settings</td>
          </tr>
          <tr>
            <td>Answer feedback and feature requests you send us</td>
            <td>Performance of a contract — Art. 6(1)(b)</td>
          </tr>
          <tr>
            <td>Keep the service secure and working properly (logs, rate limiting, Turnstile)</td>
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
        <strong>Is providing this data required?</strong> Providing a name and an email address is
        necessary to create an account and use Strumfolio: without them we cannot provide the Service,
        and no account can be created. Everything else — the songs you add, the preferences you set,
        the newsletter, the feedback you send — is entirely up to you.
      </p>
      <p>
        <strong>Automated decision-making.</strong> We do not carry out automated decision-making or
        profiling that produces legal effects for you or similarly significantly affects you. The
        Turnstile challenge and the rate limits only decide whether a single request goes through.
      </p>

      <h2>4. Who processes data on our behalf, and who receives it</h2>
      <p>
        Strumfolio is a small project built on a limited number of technical providers. The following
        act as our data processors, under a data processing agreement:
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
          <strong>Resend</strong> — delivery of the emails we send you (email verification, password
          reset, purchase and plan-change notices, the newsletter once it exists).
        </li>
        <li>
          <strong>Cloudflare, Inc.</strong> — the Turnstile challenge on registration and password
          recovery, which processes your IP address and browser signals to tell a person from a
          script.
        </li>
      </ul>
      <p>
        The operational notifications described in section 2 travel through Telegram, but carry no
        personal data, so Telegram processes none of yours.
      </p>
      <p>Two providers are different, because they are independent data controllers for their part:</p>
      <ul>
        <li>
          <strong>Google LLC</strong> — if you choose to sign in with Google, Google acts as an
          independent controller for your Google account and for the sign-in process itself, under its
          own privacy policy. We only receive the account details listed in section 2 as a result of
          that sign-in.
        </li>
        <li>
          <strong>Paddle</strong> (Paddle.com Market Ltd, United Kingdom, and its affiliate
          Paddle.com Inc. for some countries) — the merchant of record for every purchase. Paddle
          collects and processes your payment details, billing address and tax information as an
          independent controller, issues your invoice, and handles refunds, under its own{' '}
          <a href="https://www.paddle.com/legal/privacy" rel="noopener noreferrer" target="_blank">
            privacy policy
          </a>
          . We share with Paddle the email address of your account, so that the purchase can be
          matched to it, and receive back what section 2 describes.
        </li>
      </ul>
      <p>
        We do not sell your data, and we do not share it with anyone for advertising or marketing
        purposes. We may disclose data where required to do so by law.
      </p>

      <h2>5. International transfers</h2>
      <p>
        Some of these providers are established in the United States or may process data outside the
        European Economic Area. Where that happens, transfers are covered by appropriate safeguards
        under Chapter V GDPR: the EU-U.S. Data Privacy Framework where the provider is certified
        (Vercel, Google and Cloudflare are), and the European Commission&apos;s Standard Contractual
        Clauses in the remaining cases. Paddle.com Market Ltd is established in the United Kingdom,
        which the European Commission recognises as providing adequate protection. You can obtain a
        copy of the safeguards in place, or further details about them, by writing to the contact
        address above.
      </p>

      <h2>6. How long we keep your data</h2>
      <p>
        We keep your account and content data for as long as your account is active. When you delete
        your account from within the app, your account, your songs, your preferences, your comments
        and your newsletter preference are removed immediately from the live service. Residual copies
        remain for a short time in two places, and then disappear on their own: our database
        provider&apos;s restore history, kept for a few days, and our hosting provider&apos;s
        technical logs, also kept for a few days — in both cases no longer than 30 days, except where
        we are required to retain data by law.
      </p>
      <p>
        <strong>Payment records</strong> — the history of purchases and plan changes, with the
        account&apos;s email address — are kept after the account is deleted, for as long as tax and
        accounting rules require (ten years in Italy). Paddle keeps its own records of the sale as
        merchant of record, under its own policy.
      </p>
      <p>
        <strong>Short-lived data.</strong> A pending registration expires 24 hours after the
        verification email is sent, and a password-reset link after one hour. The counters that limit
        repeated attempts hold an IP address or an email address for the ten-minute window they
        measure, and are deleted within a day. Strum Together session data is deleted
        as soon as the leader ends the session, and a session that is never explicitly ended stops
        being usable after eight hours of inactivity; a participant&apos;s device stops counting two
        minutes after it was last seen, and the device cookie in its browser lasts one year.
        Analytics data is aggregated and retained in non-identifying form.
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
        <strong>If you are in the United Kingdom</strong>, you have the same rights under the UK GDPR,
        and you can complain to the Information Commissioner&apos;s Office (ICO).{' '}
        <strong>Wherever else you live</strong>, you can exercise the same rights by writing to us,
        and where the law of your country — for example Canada&apos;s PIPEDA or New Zealand&apos;s
        Privacy Act 2020 — grants you rights over your data, we honour them the same way, and you can
        turn to your own privacy authority.
      </p>
      <p>
        <strong>Your right to object.</strong> Where we process your data on the basis of our
        legitimate interest — namely to keep the Service secure and to measure aggregate traffic and
        performance — <strong>you have the right
        to object to that processing at any time, on grounds relating to your particular
        situation.</strong> If you object, we will stop that processing unless we can demonstrate
        compelling legitimate grounds that override your interests, rights and freedoms. To object,
        write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
      <p>
        Strumfolio lets you <strong>export your full collection, change your newsletter preference and
        delete your account directly from within the app</strong>, at any time and without having to
        ask us. For anything else, or if a self-service option is not working, contact us at{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We aim to respond within 30 days.
      </p>

      <h2>8. Data security</h2>
      <p>
        We take reasonable technical and organizational measures to protect your data against
        unauthorized access, loss, or misuse, including encrypted connections, hashed passwords and
        one-time links, and access limited to what is needed to run the service. No system is 100%
        secure, and we encourage you to keep your account credentials confidential.
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
        notify you through the app or by email before they take effect.
      </p>

      <h2>11. Contact</h2>
      <p>
        For any question about this policy or your data, contact us at{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </>
  )
}
