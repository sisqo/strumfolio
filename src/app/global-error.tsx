'use client'

/**
 * The last boundary, for an error in the root layout itself, which `error.tsx` sits inside and
 * cannot catch. It replaces the whole document, so it brings its own `<html>` and no stylesheet:
 * plain and readable in either theme rather than styled and broken.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem 1.5rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem' }}>Something went wrong</h1>
        <p>Strumfolio could not start this page.</p>
        <p>
          <button type="button" onClick={reset} style={{ font: 'inherit', textDecoration: 'underline', background: 'none', border: 0, cursor: 'pointer' }}>
            Try again
          </button>{' '}
          {/* A full load on purpose: the root layout is what failed, so nothing client-side is trusted. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          · <a href="/">Home</a>
        </p>
      </body>
    </html>
  )
}
