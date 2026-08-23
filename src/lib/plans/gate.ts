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
 * **Deliberately called from pages, never from a layout.** A layout broad enough to cover the
 * content routes would also cover `/pricing` itself and `/checkout/[plan]`, and gating the
 * choice screen behind the choice is a redirect loop. Per-page is also what keeps the cost
 * where it belongs: this adds a session read plus one `planChosenAt` query, and only the
 * routes that are already server-rendered on demand pay it.
 *
 * **Which routes call this, and which deliberately do not.** The three content routes
 * (`songs/[slug]`, `songs/[slug]/edit`, `songbooks/[slug]`) are the real deep-link targets and
 * are all already `ƒ` in the build, so gating them costs nothing structurally. `/export` and
 * `/password` are left ungated on purpose: both are `○` (statically prerendered and precached
 * for offline use), and adding a session-dependent redirect would turn them dynamic — the same
 * invariant `TopBar`'s own comment protects. `/pricing`, `/checkout/[plan]` and `/billing` must
 * never call this, for the loop reason above.
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
