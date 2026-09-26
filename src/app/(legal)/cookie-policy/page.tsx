import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'Which cookies and local storage Strumfolio uses, why, and how to clear them.',
  alternates: { canonical: '/cookie-policy' },
}

const CONTACT = 'info@strumfolio.com'

export default function CookiePolicyPage() {
  return (
    <>
      <h1>Cookie Policy</h1>
      <p className="legal-updated">Last updated: 26 September 2026</p>

      <p>
        This Cookie Policy explains how Strumfolio uses cookies and similar technologies — local
        storage and the offline cache — when you use the Service.
      </p>

      <h2>1. What cookies and similar technologies are</h2>
      <p>
        Cookies are small text files stored on your device by your browser, and sent back to the
        site that set them on every request. Local storage is a space where a site can keep settings
        on your device without sending them anywhere. The offline cache (technically, a service worker
        and the browser&apos;s Cache Storage) is a copy of pages and files that the browser keeps so
        that a site can open with no connection. All three live only on your device, and you can
        clear all three from your browser.
      </p>

      <h2>2. What we use</h2>
      <p>
        <strong>Essential cookies.</strong> A session cookie keeps you signed in for up to ninety
        days, together with the short-lived security cookies the sign-in process needs. When you
        follow a Strum Together link, a cookie holding a random identifier, valid for one year, lets
        your browser count as one device towards the leader&apos;s plan limit — it identifies the
        browser, not you, and is set whether or not you have an account. Administrators of the
        installation have one more cookie, remembering which account they are viewing. Once you are
        signed in, a further cookie, valid for one year and readable by the page itself, holds a
        short code derived from your account, so that the settings this device keeps (below) are
        kept apart for each account that signs in on it and are cleared when another one does; it
        grants no access to anything. All of these are necessary for the Service to work and cannot
        be disabled without affecting core functionality.
      </p>
      <p>
        <strong>Local storage — your settings, on your device.</strong> We store the theme you chose,
        your reading preferences (zoom, scroll speed, notation, instrument), the key, capo and chord
        display you last used on each song, which sections you folded, a copy of your comments and of
        your songbook list, whether you are showing favourites only, and the edits you made while
        offline until they reach the server; a few interface states last only until you close the
        tab. This is what lets the app
        behave the way you left it, and keep working, with no connection. It is essential to the
        Service and is never sent to anyone but our own servers, in the form of your saved
        preferences.
      </p>
      <p>
        <strong>The offline cache — the heart of the app.</strong> Once you have signed in, a service
        worker keeps on your device a copy of the app itself and of every song and songbook in your
        collection, downloaded in the background, so that it opens on stage with no signal. The copy
        is refreshed whenever you are online and has no expiry: it is emptied when you sign out, when
        another account signs in on the same browser, or when you clear your site data. It refuses to
        keep anything that was served to a signed-out visitor. It exists only in your browser: nothing in it is sent to us or to anyone else, and
        clearing your site data removes it entirely — the app simply downloads what it needs again the
        next time you open it online.
      </p>
      <p>
        <strong>Cloudflare Turnstile — on registration and password recovery.</strong> The challenge
        that tells a person from an automated script is provided by Cloudflare and runs only inside
        those forms and when you ask for a verification email again. To do its job, Cloudflare may set cookies or use storage on its own domain and
        reads technical signals from your browser, under its own privacy policy. It is strictly
        necessary to protect the Service from abuse, and no advertising or cross-site tracking is
        involved.
      </p>
      <p>
        <strong>Paddle — only when you open the checkout.</strong> When you buy a plan, the payment is
        processed by Paddle, our merchant of record. Paddle&apos;s checkout sets the cookies it needs
        to process the payment, remember the state of your order and prevent fraud, under
        Paddle&apos;s own cookie and privacy policies. They are necessary to complete a purchase and
        are set only on the checkout, and on the payment page that an email from Paddle may link
        to.
      </p>
      <p>
        <strong>Google sign-in cookies — only if you choose that method.</strong> Signing in with an
        email and password sets none of these. If you choose to sign in with Google instead, Google
        sets its own cookies on your device as part of that sign-in flow, before you ever reach
        Strumfolio. Those cookies are set and controlled by Google under its own cookie and privacy
        policies, not by us.
      </p>
      <p>
        <strong>A discount you followed — one first-party cookie and one stored value.</strong> If
        you reach Strumfolio from a link that carries one of our discount codes, or type one in, we
        keep that code
        in a cookie of our own for up to 30 days, or until the offer ends if that is sooner, so that
        the discount is still there when you reach the checkout and so that we can count which
        offer led to a purchase. The same code is kept in your browser&apos;s local storage, with no
        expiry, so that the offer can be shown again on a later visit while it is still running. The
        cookie holds the code with a signature our server adds so that it cannot be forged; the
        stored value holds the code alone. If you close the offer bar, a cookie remembers that you did
        for 14 days, so the bar stays closed. When you are signed in, we also record on our side
        that your account was shown the offer, and — if you buy with it — the redemption: see
        section 2 of our <Link href="/privacy-policy">Privacy Policy</Link>.
      </p>
      <p>
        <strong>Where you came from — one first-party cookie.</strong> If you reach Strumfolio from a
        link that carries campaign parameters — the <code>utm_…</code> values a newsletter, a social
        post or an advertisement adds to a URL — or from another website, we keep that information in
        a single cookie of our own, for 90 days: the campaign&apos;s own labels, the identifier the
        advertising network added to the click, the website you came from and the first page you
        opened, for your first arrival and for your most recent one. It records{' '}
        <strong>where a visit came from, never what you do</strong> on the site, and it is read once
        only — at the moment you register, or sign in for the first time — so that we can tell which
        channels bring musicians to Strumfolio. It is set by us, on our own domain, is never sent to
        anyone else, and builds no profile of you across other websites. It holds no name, no email
        address and no account identifier, so until you register it is linked to no one. Clearing
        your site data removes it.
      </p>
      <p>
        <strong>Aggregate analytics — without cookies.</strong> We use Vercel Web Analytics and Speed
        Insights to measure overall traffic and page performance. These tools{' '}
        <strong>do not set cookies</strong> and do not track you across other websites: visitors are
        identified by a temporary hash that is discarded within 24 hours, and only aggregated data is
        available to us. Because no information is stored on or read from your device for this
        purpose, no consent banner is required for it.
      </p>
      <p>
        <strong>No advertising or third-party tracking.</strong> Apart from the Cloudflare, Paddle
        and Google cookies described above, which those providers set only inside their own forms,
        no third party sets cookies through Strumfolio; we load no advertising or profiling scripts, and shares no data with advertising
        networks. The attribution and discount cookies described above are our own and stay on our own
        domain: we use them to measure how well our own announcements and offers work, never to
        target you, and they follow you to no other website.
      </p>

      <h2>3. Managing cookies and stored data</h2>
      <p>
        Everything described above is either strictly necessary to provide the Service you
        requested or, in the case of the attribution and discount cookies, used only to measure how
        people find Strumfolio and which offers they use. We place no advertising, profiling or
        third-party cookies, and we would ask for your consent before ever doing so. Because the
        attribution and discount cookies rest on our legitimate interest rather than on your
        consent, you have the right to object to them: see section 7 of our <Link href="/privacy-policy">Privacy Policy</Link>, or simply
        clear your site data.
      </p>
      <p>
        You can manage or delete cookies, local storage and the offline cache through your browser
        settings, usually under &ldquo;site data&rdquo;. Doing so signs you out, forgets the
        preferences kept on that device, and removes the offline copy of your collection — the app
        re-downloads it the next time you open it online. Your songs and your account are not
        affected: they live on our servers, as described in the{' '}
        <Link href="/privacy-policy">Privacy Policy</Link>.
      </p>

      <h2>4. Changes to this policy</h2>
      <p>
        We may update this Cookie Policy from time to time. Significant changes will be communicated
        through the app or by email.
      </p>

      <h2>5. Contact</h2>
      <p>
        For any question about this policy, contact us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </>
  )
}
