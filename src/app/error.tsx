'use client'

import Link from 'next/link'
import { useEffect } from 'react'

/**
 * What a render error, or a database or network failure thrown out of a page, shows instead of
 * Next's bare «Application error» (2026-10-16; there was no boundary before). Chrome-free for the
 * reason `not-found.tsx` gives, and in the same shape, with the one thing a reader can do about
 * it: try again, or go home.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="screen-title">Something went wrong</h1>
      <p className="max-w-sm text-[var(--muted)]">
        This page could not be shown. If you are offline, the songs you have opened before are still on this device.
      </p>
      <div className="mt-2 flex gap-4">
        <button type="button" className="font-medium text-[var(--accent)] hover:underline" onClick={reset}>
          Try again
        </button>
        <Link href="/" className="font-medium text-[var(--accent)] hover:underline">
          Home
        </Link>
      </div>
    </div>
  )
}
