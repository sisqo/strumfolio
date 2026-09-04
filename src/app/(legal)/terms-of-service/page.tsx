import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Terms of Service' }

const CONTACT = 'info@strumfolio.com'

/**
 * The legal name of the payment partner, said once. Paddle acts as merchant of record — the
 * seller on the receipt — so it appears in the billing, refund and privacy text in that
 * role, never as a mere "processor".
 */
const PADDLE = 'Paddle.com Market Ltd'

/**
 * The notice we owe before the Service can close, and before a change that costs a paying
 * reader something takes effect. One number, read by two sections below, so the two never
 * come to promise different things.
 */
const NOTICE_DAYS = 30

export default function TermsOfServicePage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="legal-updated">Last updated: 4 September 2026</p>

      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of Strumfolio (&ldquo;the
        Service&rdquo;), run at strumfolio.com by an individual developer rather than a company
        (&ldquo;we&rdquo;, &ldquo;us&rdquo;). Strumfolio offers a free plan with no end date, and paid
        plans with higher limits and additional features — see our <Link href="/pricing">Pricing</Link>{' '}
        page for what each plan includes and costs. You accept these Terms when you create an
        account, when you buy a plan, and when you join a Strum Together session through a shared
        link. If you do not agree with them, please do not use the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        Strumfolio lets you import, organize, edit and export your own collection of lyrics and
        chords, and offers features such as key/capo transposition, chord diagrams, a printable
        booklet and Strum Together, a feature that syncs a song across multiple devices in real
        time. The Service is a web app that also works offline once installed on your device.
      </p>
      <p>
        <strong>Strumfolio is not a song library.</strong> There is no catalog to browse or search,
        and the Service does not search, fetch, or download content from third-party websites on your
        behalf. Every song in your collection is content that you personally type in or import from
        a file on your own device, with one exception: the &ldquo;Example songbook&rdquo;, a small,
        fixed set of traditional, public-domain songs that a new account is created with, and that
        you can rename, edit or delete like any other songbook. Our{' '}
        <Link href="/content-copyright-notice">Content &amp; Copyright Notice</Link> describes it in
        full. Apart from that one set, the Service is only a tool for organizing and displaying
        your own material.
      </p>

      <h2>2. Accounts and access</h2>
      <p>
        Registration is open: you can create an account using your name, an email address and a
        password, or by signing in with Google. You are responsible for maintaining the
        confidentiality of your account and for all activity that occurs under it. Notify us
        promptly if you believe your account has been accessed without your authorisation.
      </p>
      <p>
        You may use the Service only if you are legally able to enter into these Terms under the law
        of your country. If you are a minor, you may use Strumfolio only with the permission and
        involvement of a parent or guardian, who accepts these Terms on your behalf. Buying a plan
        requires being of age to do so under the law of your country.
      </p>
      <p>
        We may refuse, suspend, or remove accounts where necessary to protect the Service, to comply
        with the law, or as described in section 11.
      </p>

      <h2>3. Your content</h2>
      <p>
        You retain full ownership of the songs, lyrics, chords, comments and other content you import
        into or create within Strumfolio (&ldquo;Your Content&rdquo;). We do not claim any ownership of
        it. You grant us only the limited technical permission to store, process and display Your
        Content as needed to operate the Service for you and for the participants you invite to a
        Strum Together session.
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
        or claim any rights over song lyrics or chord charts, and nothing here grants you any right
        over a work you did not already have. You are solely responsible for the legality of the
        content you import and of what you do with it. Our{' '}
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
        <li>
          use the Service for anything other than keeping and reading your own song collection — for
          example to publish or redistribute content, or to offer the Service to others as your own —
          unless otherwise agreed with us. Playing from your collection at a paid engagement is
          ordinary use, not a breach of this rule.
        </li>
      </ul>

      <h2>7. Paid plans and billing</h2>
      <p>
        <strong>What is on offer.</strong> The <Link href="/pricing">Pricing</Link> page is the
        authoritative description of each plan: its limits, its features and its price at the moment
        you buy. Prices are in euro and include VAT or any other applicable sales tax — the amount
        shown is the amount charged. If your card is not in euro, your bank may apply its own
        exchange rate and fees, which are not ours. There is no free trial: the free plan itself is
        the way to try Strumfolio, for as long as you like.
      </p>
      <p>
        <strong>Who sells you the plan.</strong> Purchases are processed by our payment partner{' '}
        {PADDLE} (&ldquo;Paddle&rdquo;), which acts as <strong>merchant of record</strong>: Paddle is the
        seller on your receipt, collects the payment and the tax, issues the invoice, and handles the
        payment side of refunds. Your payment details are collected by Paddle under its own terms and
        privacy policy, and Strumfolio never receives your full card number. Using Strumfolio itself
        remains governed by these Terms.
      </p>
      <p>
        <strong>Subscriptions renew automatically.</strong> Standard, Plus and Premium are
        subscriptions, billed monthly or yearly as you choose at checkout. At the end of each period
        the plan renews for another period of the same length, charged to the payment method on file
        at the price then in force, until you cancel. We tell you at checkout the day the next renewal
        falls, and the Billing page inside the app always shows it. Cancelling stops the next
        renewal, not the plan you already hold: you keep it until the end of the period you have paid
        for, and the account then returns to the free plan.
      </p>
      <p>
        <strong>Changing plan.</strong> An upgrade to a higher plan takes effect immediately. A
        downgrade to a lower paid plan, or a cancellation, takes effect at the end of the period
        already paid for, and nothing is charged for it today; until then you keep the plan you paid
        for, and you can undo a scheduled change from the Billing page at any time before it lands.
        Changing the billing cycle of the plan you hold starts a new period from the day you confirm.
        Whenever a change would replace a period you have already paid for with a shorter one, the
        checkout says so before you confirm.
      </p>
      <p>
        <strong>If a payment fails.</strong> When a renewal cannot be charged, Paddle retries the
        payment for a while and lets you update your payment method. Your plan stays active during
        those retries. If the payment still does not go through, the subscription ends and the account
        returns to the free plan.
      </p>
      <p>
        <strong>Lifetime.</strong> The Lifetime plan is a single payment that grants the Premium
        plan with no renewal ever due.{' '}
        <strong>&ldquo;Lifetime&rdquo; means the lifetime of the Service</strong>, for as long as
        Strumfolio is operated — not a fixed number of years, and not the lifetime of a person. It is
        tied to the account that bought it and cannot be transferred, and it ends only if you delete
        your account or if we terminate it under section 11.
      </p>
      <p>
        A Lifetime plan follows Premium upwards and never downwards: you get every feature and every
        limit increase that Premium gains later, and you keep at least the features and limits
        Premium had on the day you bought — if Premium is ever reduced, your plan is not. If the
        Service is discontinued, section 9 applies: at least {NOTICE_DAYS} days&apos; notice, export
        available throughout, and — because a Lifetime plan has no period to refund — a refund of the
        price in proportion to the months missing to 24 from the day you bought, and no refund if the
        Service is discontinued later than that. Nothing else about a Lifetime plan can be changed to
        your detriment under section 12.
      </p>
      <p>
        <strong>When a paid plan ends.</strong> Nothing you have put in is deleted. Your songs stay
        readable and exportable on the free plan, the features reserved to paid plans stop being
        available, and if the collection is over a free-plan limit you can only delete until you are
        back under it — you cannot add until then. A Lifetime plan does not expire.
      </p>

      <h2>8. Right of withdrawal and refunds</h2>
      <p>
        <strong>Fourteen days to change your mind.</strong> If you are a consumer in the European
        Union, the European Economic Area or the United Kingdom, you have a legal right to withdraw
        from a purchase within 14 days of making it, without giving any reason. We extend the same
        fourteen days to every reader wherever they live, and to the Lifetime plan as well.
      </p>
      <p>
        <strong>Access starts right away.</strong> When you buy a plan, you ask us to make it available
        immediately rather than only after the fourteen days have passed, and you acknowledge that
        you start using it during the withdrawal period. If you then withdraw within 14 days, we do
        not deduct anything for the days you used: you receive the full amount back, to the payment
        method you paid with, normally within 14 days of your request.
      </p>
      <p>
        <strong>How to withdraw.</strong> Write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a> from the
        email address of your account, saying that you withdraw from your purchase — no form is
        required, but you may use this one: &ldquo;I hereby withdraw from my contract for the
        Strumfolio plan bought on [date], under the account [email address].&rdquo; You can also contact
        Paddle directly, as merchant of record, through the address on your receipt. Paddle carries
        out the refund.
      </p>
      <p>
        <strong>Renewals.</strong> The way to avoid a renewal charge is to cancel before the renewal
        date, which you can do at any time from the Billing page. If a renewal goes through that you
        did not mean to keep, write to us within 14 days of the charge and we refund it, in which case
        the plan ends at once. Outside these cases, refunds are at our discretion, except where the
        law of your country entitles you to one — for example because the Service failed to work as
        described and we could not fix it.
      </p>

      <h2>9. Availability, conformity and warranty</h2>
      <p>
        While we aim to keep the Service available and reliable, it is maintained by a single
        individual and we do not guarantee uninterrupted or error-free operation. If you are a
        consumer, the Service must conform to what these Terms and the Pricing page describe, and we
        will provide the updates needed to keep it doing so, as mandatory consumer law requires — this
        applies to the free plan too. Beyond that, and to the extent the law allows, the Service is
        provided without any further warranty, express or implied.
      </p>
      <p>
        We may modify, suspend or discontinue the Service, in whole or in part. If we decide to
        discontinue the Service, or a feature you have paid for, we will give you at least{' '}
        {NOTICE_DAYS} days&apos; notice by email, keep export working until the end, and refund the
        unused part of any period you have already paid for (for a Lifetime plan, the refund
        described in section 7). Only circumstances outside our control can shorten that notice.
      </p>
      <p>
        <strong>Keep your own backups.</strong> The export feature lets you download your collection
        at any time, and you should use it regularly rather than relying on Strumfolio as your only
        copy.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the extent permitted by law, we are not liable for indirect, incidental, or consequential
        damages arising from your use of Strumfolio, including loss of data or of content you have
        imported, nor for damage caused by content that a user put into their own collection. Where
        liability cannot be excluded but can be limited, our total liability towards you for all
        claims in any twelve-month period is limited to the amount you paid us for the Service in
        those twelve months, or to €50 if you paid nothing.
      </p>
      <p>
        Nothing in these Terms excludes or limits liability for death or personal injury caused by
        negligence, for fraud or wilful misconduct, for gross negligence, or any other liability that
        cannot be excluded under applicable law — including mandatory consumer protection rights,
        which prevail over anything in these Terms that would reduce them.
      </p>

      <h2>11. Suspension, termination and notices about content</h2>
      <p>
        You may stop using Strumfolio at any time and delete your account, together with all of Your
        Content, directly from within the app. Deletion is immediate on the live service; see the{' '}
        <Link href="/privacy-policy">Privacy Policy</Link> for how residual copies in backups and
        logs are handled.
      </p>
      <p>
        We may suspend or terminate access to the Service for accounts that violate these Terms.
        Because Strumfolio stores content on your behalf, it is a hosting service in the sense of
        the EU Digital Services Act (Regulation (EU) 2022/2065). Our{' '}
        <Link href="/content-copyright-notice">Content &amp; Copyright Notice</Link> describes how
        anyone can notify us of content they believe to be illegal or infringing, and what we do
        with such a notice. We do not routinely monitor accounts, which are private. When we restrict
        or disable an account because of its content, we tell the account holder why, what the
        restriction is, and how to reply — and a reply to <a href={`mailto:${CONTACT}`}>{CONTACT}</a>{' '}
        is always read by a person. That address is also our single point of contact for authorities
        and for users on these matters; write to us in English or Italian.
      </p>

      <h2>12. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. For a change that affects a plan you are paying
        for to your detriment — a higher price at renewal, a plan losing a feature or a limit, a
        stricter billing rule — we give you at least {NOTICE_DAYS} days&apos; notice by email before it
        takes effect. If you do not accept the change, you can cancel before that date at no cost, and
        we refund the unused part of any period you have already paid for. A Lifetime plan is not
        affected by such changes: section 7 sets out what it keeps. Changes required by law,
        changes that only add to what a plan includes, and clarifications that do not change your
        rights can take effect sooner, and we announce them through the app. Continued use of
        Strumfolio after a change takes effect constitutes acceptance of the new Terms.
      </p>

      <h2>13. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of Italy, without prejudice to any mandatory consumer
        protection rights you may have under the laws of your country of residence. If you are a
        consumer, any dispute is subject to the exclusive jurisdiction of the court of your own place
        of residence or domicile, as Italian consumer law requires. In every other case, the
        competent court is that of the developer&apos;s place of residence, in Italy.
      </p>
      <p>
        If something goes wrong, write to us first: most problems are solved by email within a few
        days. We are not a member of any alternative dispute resolution body and are not obliged to
        take part in one; if you are a consumer and would like to use one available in your country,
        tell us and we will consider it in good faith. You can also turn to the consumer protection
        authorities of your country at any time.
      </p>

      <h2>14. Contact</h2>
      <p>
        For any question about these Terms, contact us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </>
  )
}
