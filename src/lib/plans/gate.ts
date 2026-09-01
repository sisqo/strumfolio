import { redirect } from 'next/navigation'

import { isOwner } from '@/lib/allowlist'
import { currentUser } from '@/lib/auth/session'
import { hasDatabase } from '@/lib/db/client'
import { hasChosenPlan } from '@/lib/plans/resolve'

/**
 * The mandatory plan-choice gate (PLAN.md, v3.7): an account that has never chosen a plan —
 * Free or paid — is sent to `/pricing` before it sees any of its own repertoire.
 *
 * Extracted from `(home)/page.tsx`, which was the *only* place it lived, and that turned out
 * to be the hole: `/` is the page every sign-in path lands on, but it is not the only page a
 * reader can *arrive* at. A bookmarked song, a PWA shortcut, a link in a browser's history —
 * any of them opened `songs/[slug]` or `songbooks/[slug]` directly and skipped the choice
 * entirely, for as long as the reader never touched the home screen. Nothing was granted by
 * that (a fresh row is `free`/`active` and `entitlementsOf` never reads `planChosenAt`, so the
 * limits applied normally either way) — the gate simply never got to ask.
 *
 * **The bug that moved two of the four call sites out of their pages.** `redirect()` thrown
 * from inside a page's own async body only becomes a real HTTP redirect if no byte of the
 * response has been sent yet. A sibling `loading.tsx` breaks that: Next wraps the page in a
 * Suspense boundary and streams its fallback with a 200 status *before* the page's async body
 * — including this call — has run, so the redirect silently downgrades to a client-side-only
 * navigation in the RSC stream. On `(home)` and `songbooks/[slug]`, which both have a
 * `loading.tsx`, a client-side hooks-order mismatch during that exact transition was swallowing
 * that navigation outright — a brand-new account landed on `/` (or a bookmarked songbook URL)
 * and stayed there, confirmed with a plain `curl` showing `200` where a `307` was expected.
 * Fixed by moving the call into a layout: a layout sits outside the Suspense boundary its own
 * segment's `loading.tsx` introduces, so `redirect()` there is unaffected. `songs/[slug]` and
 * `songs/[slug]/edit` have no `loading.tsx` today, so they don't need this — but a future
 * `loading.tsx` added to either would silently reintroduce this exact bug unless the call moves
 * to a layout at the same time.
 *
 * **Never from a layout broad enough to cover `/pricing` or `/checkout/[plan]`**, though —
 * gating the choice screen behind the choice is a redirect loop. A layout scoped to exactly one
 * content route, like the two above, has no such risk.
 *
 * **Which routes call this, and which deliberately do not.** The four content routes
 * (`songs/[slug]`, `songs/[slug]/edit`, `songbooks/[slug]`, `songbooks/[slug]/add`) are the
 * real deep-link targets and are all already `ƒ` in the build, so gating them costs nothing
 * structurally. `/export` and `/password` are left ungated on purpose: both are `○` (statically
 * prerendered and precached for offline use), and adding a session-dependent redirect would
 * turn them dynamic — the same invariant `TopBar`'s own comment protects. `/pricing`,
 * `/checkout/[plan]` and `/billing` must never call this, for the loop reason above.
 *
 * `isOwner` is checked on the signed-in person's own address, not on `user.role` and not on
 * `accountOwnerEmail` — the two subtleties inherited from the original: every account owner is
 * `'admin'` on their own account, so `role` cannot tell a global owner from an ordinary
 * customer, and a global owner switched into a customer's account for support must not be
 * bounced away by that customer's unfinished onboarding.
 *
 * Fails open at every exit (no database, nobody signed in, an unreadable row — see
 * `hasChosenPlan`'s own comment), because the consequence of failing shut is a lockout for a
 * musician who is most likely trying to get on stage.
 *
 * @param known A user already resolved by the caller, to save a second session read. Pass
 *   nothing to have this resolve it; pass `null` explicitly for "nobody is signed in".
 */
export async function requirePlanChoice(
  known?: { email: string; accountOwnerEmail: string } | null,
): Promise<void> {
  if (!hasDatabase) return

  const user = known === undefined ? await currentUser() : known
  if (user === null) return
  if (isOwner(user.email, process.env.ALLOWED_EMAILS)) return

  if (!(await hasChosenPlan(user.accountOwnerEmail))) redirect('/pricing')
}
