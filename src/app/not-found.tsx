import Link from 'next/link'

/**
 * The one 404 in the whole app, at the root rather than nested under any one section.
 *
 * A nested `not-found.tsx` (tried first, under `blog/` and then under `blog/[slug]/`) turns
 * out not to catch this: `[slug]/page.tsx` sets `dynamicParams = false`, and a slug outside
 * `generateStaticParams` is rejected at the router before it ever reaches that segment's own
 * tree — only the root boundary sees it. That rules out reusing `SiteHeader`/`Footer` here
 * (this fires for a bad `/songs/[slug]` or `/accounts/[email]` too, signed in or not, and
 * neither section's chrome fits both), so this stays deliberately chrome-free: the page's own
 * background and ink already come from `body` in the root layout, and «Home» routes wherever
 * that actually is for whoever's looking, signed in or not.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="screen-title">Page not found</h1>
      <p className="max-w-sm text-[var(--muted)]">
        That page isn&rsquo;t here, or it moved.
      </p>
      <Link href="/" className="mt-2 font-medium text-[var(--accent)] hover:underline">
        Home
      </Link>
    </div>
  )
}
