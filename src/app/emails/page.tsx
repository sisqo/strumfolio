import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { EmailPreview } from '@/components/EmailPreview'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { auth } from '@/auth'
import { isOwner } from '@/lib/allowlist'
import { buildEmailPreviews } from '@/lib/email/preview'
import { requestOrigin } from '@/lib/rateLimit'

export const metadata: Metadata = { title: 'Emails' }

/** Rendered per request, like `/accounts`: the sample links are built from whatever host this request actually arrived on. */
export const dynamic = 'force-dynamic'

/**
 * A preview of the four emails `lib/email/templates.ts` can build, for a global owner to
 * check without registering or resetting a password for real. `notFound()` rather than a
 * role notice — same reasoning as every other owner-only page in this app (`/accounts`):
 * "this does not exist" and "this is not yours" should look identical from outside.
 */
export default async function EmailsPage() {
  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) notFound()

  const previews = buildEmailPreviews(await requestOrigin())

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="emails" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">Emails</h1>
          <p className="mt-2 text-sm leading-[1.45] text-muted">
            Every email this app sends, rendered with sample data. Send yourself a real copy to check how it looks in an
            actual inbox.
          </p>
        </header>

        <EmailPreview previews={previews} />

        <Footer />
      </main>
    </PrefsProvider>
  )
}
