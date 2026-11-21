import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { requireAccount } from '@/lib/auth/session'
import { requirePlanChoice } from '@/lib/plans/gate'
import { resolveSongbook } from '@/lib/songbooks/page'

/**
 * `requirePlanChoice`, moved out of `page.tsx` (and `add/page.tsx`, which this layout
 * also wraps) for the same reason `(home)/layout.tsx` exists: `songbooks/[slug]/loading.tsx`
 * wraps the page in a Suspense boundary, so a `redirect()` thrown inside the page's own
 * async body streams a 200 shell first and never becomes a real HTTP redirect — see
 * `(home)/layout.tsx`'s own comment for how that was found. A layout sits outside the
 * boundary its own segment's `loading.tsx` introduces, so `redirect()` here still works.
 */
export default async function SongbookLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ slug: string }>
}) {
  /* A session whose account no longer exists — see `requireAccount`. Silent for a visitor with
     no session at all, which is the middleware's case and not this one. */
  await requireAccount()

  await requirePlanChoice()

  /* And `notFound()` here for the same reason: a missing songbook, or somebody else's, answered
     200 from the page — see `resolveSongbook`. */
  if ((await resolveSongbook((await params).slug)) === null) notFound()

  return <>{children}</>
}
