'use client'

import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'

import { mayShowAccountSwitcher } from '@/lib/accounts/read'
import { loadIdentity } from '@/lib/auth/actions'
import type { Plan } from '@/lib/plans/types'
import { type Role, canEdit } from '@/lib/roles'

interface RoleContextValue {
  email: string | null
  /**
   * Which account is actually on screen — equal to `email` except for a global owner
   * switched into another account's view (`mayAccess`, `accounts/current.ts`), which is the
   * one case anything here reads this for at all: `ViewingAsPill` (`TopBar.tsx`) is the sole
   * reader, comparing the two to decide whether to say anything.
   */
  accountOwnerEmail: string | null
  role: Role | null
  /** Whether the server has answered yet. Before that, nothing is offered. */
  known: boolean
  mayEdit: boolean
  /**
   * A true, installation-wide owner (`isOwner`) — what decides whether the header offers
   * `AdminMenu` at all, the one opener that is either present or absent rather than a panel
   * with an entry missing from it. It used to answer for two readers instead: the Accounts
   * entry inside `NavMenu` and the user menu's own "Owner" badge, both of which have gone,
   * so the two menus every reader uses are now the same shape for everybody.
   *
   * `HomeScreen` reads it too, for a different kind of question: whether to offer copying a
   * songbook *into another account*, which is a power over two accounts at once
   * (`copySongbook`'s own comment) and belongs on the songbook's own row rather than in a
   * menu, since it acts on that one songbook.
   */
  isGlobalOwner: boolean
  /**
   * The plan in effect for the account this reader is looking at — null while unknown,
   * and null forever when `SONGBOOK_PLANS` is off, since `effectivePlanOf` answers the
   * same way `Entitlements.state` does: nothing is being enforced, so there is no plan
   * to report. `UserMenu` is the one reader of this today.
   *
   * Unlike `email` and `role`, this can genuinely change while the tab stays open — a
   * grant applied from `/accounts`, a subscription expiring at midnight — and there is
   * no push channel that tells this component so. It is refreshed on the same schedule
   * as everything else here (mount, and again on the `online` event), no more and no
   * less, so a reader gifted a plan mid-session sees the old badge until the next one.
   * Deliberately not a reason to poll: see this file's own comment on why nothing here
   * is cached defensively.
   */
  plan: Plan | null
  /**
   * The **live subscription alone** for the same account — the gift deliberately ignored,
   * where `plan` above is the blend of the two. Null under the same conditions `plan` is, plus
   * one more: an account with no live subscription at all (a genuine Free account, or one
   * whose subscription has lapsed) reports null here while `plan` still says `'free'`.
   *
   * `PricingPlans` is the one reader, and reads it for every rank question — which card says
   * "Your plan", and whether a column is an upgrade or a downgrade. Using `plan` for that let
   * a gifted Premium show as the customer's own plan on the Premium card, so completing that
   * card's checkout converted a free gift into a real purchase; `planNamesOf`
   * (`lib/plans/resolve.ts`) carries the reasoning in full. The badge in `UserMenu` still
   * reads `plan`, because "what are my limits right now" is the question a gift *should*
   * answer.
   */
  subscriptionPlan: Plan | null
  /**
   * Whether the account this reader is looking at has completed the mandatory plan-choice
   * step (PLAN.md, v3.7) — `true` while unknown, the safe default that keeps `PricingPlans`'
   * Free card reading as already settled rather than briefly offering "Continue with Free"
   * to someone who may turn out to be signed out. The actual gate is a server-side redirect
   * in `(home)/page.tsx`; this only decides what the Free card on `/pricing` offers, same as
   * everything else in this context.
   */
  planChosen: boolean
}

const RoleContext = createContext<RoleContextValue>({
  email: null,
  accountOwnerEmail: null,
  role: null,
  known: false,
  mayEdit: false,
  isGlobalOwner: false,
  plan: null,
  subscriptionPlan: null,
  planChosen: true,
})

/**
 * The reader's role, for the screens that have to leave things out.
 *
 * It arrives after mount, like preferences do, because there is nowhere earlier it could:
 * these pages are generated at build time and served from a precache, so no render knows
 * who is looking. It sits in the root layout, so one answer serves every screen and
 * survives navigation between them.
 *
 * **Nothing is cached, deliberately.** A remembered "admin" would draw buttons for
 * somebody whose account had since been deleted, or whose global-owner status had since
 * been revoked — buttons that refuse when pressed, which is worse than buttons that were
 * never there. And the cost of not caching is nothing: everything a role unlocks needs
 * the network anyway.
 *
 * Which is also why the answer is *hide until known* rather than show-then-hide. A
 * control that appears and vanishes is a control someone will have already reached for;
 * one that arrives a moment late is a control that is simply not there yet — and offline,
 * where it never arrives, it is a control that could not have worked.
 *
 * This is not the permission. Every action re-reads the table on the server: this only
 * decides what to draw.
 */
export function RoleProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null)
  const [accountOwnerEmail, setAccountOwnerEmail] = useState<string | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [known, setKnown] = useState(false)
  const [switcher, setSwitcher] = useState(false)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [subscriptionPlan, setSubscriptionPlan] = useState<Plan | null>(null)
  const [planChosen, setPlanChosen] = useState(true)

  useEffect(() => {
    let alive = true

    const ask = async () => {
      try {
        const [identity, showSwitcher] = await Promise.all([loadIdentity(), mayShowAccountSwitcher()])
        if (alive) {
          setEmail(identity?.email ?? null)
          setAccountOwnerEmail(identity?.accountOwnerEmail ?? null)
          setRole(identity?.role ?? null)
          setSwitcher(showSwitcher)
          setPlan(identity?.plan ?? null)
          setSubscriptionPlan(identity?.subscriptionPlan ?? null)
          setPlanChosen(identity?.planChosen ?? true)
          setKnown(true)
        }
      } catch {
        // Offline, or signed out: nothing is offered, which is the safe direction.
      }
    }

    void ask()

    /*
     * And again when the network comes back.
     *
     * Without this, one failed attempt was the last word for the life of the document: open
     * the app in a tunnel and an editor would have no way into the editor even after the
     * signal returned, until they reloaded by hand. Asking again on `online` also picks up a
     * role changed while the tab sat open — the actions were already re-checking it, so this
     * only brings the screen into line with what the server would have said anyway.
     */
    window.addEventListener('online', ask)
    return () => {
      alive = false
      window.removeEventListener('online', ask)
    }
  }, [])

  const value = useMemo<RoleContextValue>(
    () => ({
      email,
      accountOwnerEmail,
      role,
      known,
      mayEdit: known && canEdit(role),
      isGlobalOwner: known && switcher,
      plan,
      subscriptionPlan,
      planChosen,
    }),
    [email, accountOwnerEmail, role, known, switcher, plan, subscriptionPlan, planChosen],
  )

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole(): RoleContextValue {
  return useContext(RoleContext)
}
