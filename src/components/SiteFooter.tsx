import Link from 'next/link'

import { SITE_URL } from '@/lib/brand'
import { COPYRIGHT_YEAR } from '@/lib/changelog'

/**
 * The public site's foot, and not the app's `Footer`.
 *
 * Shared by the blog and the free tools, for the same reason `SiteHeader` is.
 *
 * The mock draws something quieter and centred, and two of its differences from the shared
 * footer are decisions rather than drawing:
 *
 * - **No version and no commit hash.** Those exist for whoever is diagnosing a deployment,
 *   which is nobody who arrived here from a search engine — see `Footer`'s own comment
 *   admitting the hash is the one thing no reader has a use for.
 * - **Fewer links.** The mock lists Privacy, Terms, Cookies and «Brand». Brand is not shipped
 *   here: it became an owner-only page, and putting it in front of the blog's entire audience
 *   would be advertising a `notFound()`. Changelog takes that slot instead — of the entries
 *   the mock drops, it is the one a visitor might actually want — and «Content copyright»
 *   stays out, since it answers a question about songs readers upload, which an article has
 *   nothing to do with.
 *
 * The year comes from `lib/changelog.ts`, the same source the shared footer uses, so the two
 * cannot disagree about what year it is.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p className="site-footer-credit">
        &copy; {COPYRIGHT_YEAR} {SITE_URL}
      </p>

      <nav className="site-footer-links" aria-label="Legal and changelog">
        <Link href="/privacy-policy">Privacy</Link>
        <Link href="/terms-of-service">Terms</Link>
        <Link href="/cookie-policy">Cookies</Link>
        <Link href="/changelog">Changelog</Link>
      </nav>
    </footer>
  )
}
