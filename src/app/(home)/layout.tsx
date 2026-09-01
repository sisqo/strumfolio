import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'

import { currentUser } from '@/lib/auth/session'
import { hasDatabase } from '@/lib/db/client'
import { requirePlanChoice } from '@/lib/plans/gate'

/**
 * Both redirects that used to live in `page.tsx` itself, moved here for one reason:
 * `(home)/loading.tsx` wraps the page (not this layout) in a Suspense boundary, so Next
 * has already streamed a 200 shell by the time a `redirect()` thrown inside the page's
 * own async body would run — downgrading it from a real HTTP redirect to a client-side-only
 * navigation embedded in the RSC stream, which a hooks-order mismatch during that exact
 * transition was silently swallowing outright. A brand-new account landed on `/` and
 * stayed there, gate or no gate — confirmed with a plain `curl`, no JS involved, which is
 * what a real HTTP redirect does not depend on and this one, wrongly, did.
 *
 * A layout sits outside the Suspense boundary its own segment's `loading.tsx` introduces,
 * so `redirect()` here still produces a genuine top-level redirect, the same as every
 * route with no sibling `loading.tsx` (`songs/[slug]`, `songs/[slug]/edit`) already gets
 * for free. See `songbooks/[slug]/layout.tsx` for the other route this same bug hit.
 */
export default async function HomeLayout({ children }: { children: ReactNode }) {
  /*
   * `middleware.ts` already refuses anyone with no session at all before this ever
   * runs. What it does not catch is a session that is still valid but no longer
   * admitted anywhere — every membership pulled, no owner status either — which
   * `currentUser` alone can tell, by asking the database this page needs to ask
   * anyway. Back to `/login` is the truthful next step: there is no account left to
   * show, and signing in again is what would explain that.
   */
  const user = hasDatabase ? await currentUser() : null
  if (hasDatabase && user === null) redirect('/login')

  /* The mandatory plan-choice gate (PLAN.md, v3.7) — `/` is the page every sign-in path
   * lands on. */
  await requirePlanChoice(user)

  return <>{children}</>
}
