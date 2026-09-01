import type { ReactNode } from 'react'

import { requirePlanChoice } from '@/lib/plans/gate'

/**
 * `requirePlanChoice`, moved out of `page.tsx` (and `add/page.tsx`, which this layout
 * also wraps) for the same reason `(home)/layout.tsx` exists: `songbooks/[slug]/loading.tsx`
 * wraps the page in a Suspense boundary, so a `redirect()` thrown inside the page's own
 * async body streams a 200 shell first and never becomes a real HTTP redirect — see
 * `(home)/layout.tsx`'s own comment for how that was found. A layout sits outside the
 * boundary its own segment's `loading.tsx` introduces, so `redirect()` here still works.
 */
export default async function SongbookLayout({ children }: { children: ReactNode }) {
  await requirePlanChoice()

  return <>{children}</>
}
