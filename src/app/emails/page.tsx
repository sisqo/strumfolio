import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { EmailPreview } from '@/components/EmailPreview'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { auth } from '@/auth'
import { isOwner } from '@/lib/allowlist'
import { buildEmailPreviews } from '@/lib/email/preview'
import { FROM_ADDRESS } from '@/lib/email/send'
import { requestOrigin } from '@/lib/rateLimit'

export const metadata: Metadata = { title: 'Email previews' }

/** Rendered per request, like `/accounts`: the sample links are built from whatever host this request actually arrived on. */
export const dynamic = 'force-dynamic'

/**
 * A preview of the eight `lib/email/templates.ts` emails `lib/email/preview.ts` knows how to
 * sample — six transactional, plus the two courtesy notes, each its own tab row
 * (`Email Previews.dc.html`) — for a global owner to check without registering, resetting a
 * password, or waiting for the next billing cycle for real. `notFound()` rather than a role
 * notice — same reasoning as every other owner-only page in this app (`/accounts`): "this
 * does not exist" and "this is not yours" should look identical from outside.
 *
 * `FROM_ADDRESS` is read here and handed down as a prop rather than imported by
 * `EmailPreview` itself: that constant lives in `email/send.ts`, which pulls in the Resend
 * SDK, and `EmailPreview` is a client component — see `send.ts`'s own comment on why.
 */
export default async function EmailsPage() {
  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) notFound()

  const previews = buildEmailPreviews(await requestOrigin())

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="emails" />

      <main className="mx-auto max-w-4xl px-4 pb-12 pt-3">
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">Email previews</h1>
          <p className="mt-2 text-sm leading-[1.45] text-muted">
            Every email this app sends, rendered with sample data. Send yourself a real copy to check how it looks in an
            actual inbox.
          </p>
        </header>

        <EmailPreview previews={previews} defaultFrom={FROM_ADDRESS} />

        <Footer />
      </main>
    </PrefsProvider>
  )
}
