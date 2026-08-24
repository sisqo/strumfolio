import type { Plan } from './types'

/**
 * Who is reading /pricing, decided server-side by `loadIdentity` and handed down as a prop —
 * see `PricingPlans.tsx`'s own comment on this same shape for the full reasoning behind it.
 *
 * `Viewer` and `mustChooseNow` live in this plain module, not in `PricingPlans.tsx` itself,
 * because that file is `'use client'`: every export of a client module becomes an opaque
 * client reference once bundled, and a Server Component may only *render* such a reference as
 * JSX, never *call* it as a plain function. `pricing/page.tsx` calling `mustChooseNow(viewer)`
 * from its own `<h1>` crashed in production for exactly that reason — "Attempted to call
 * mustChooseNow() from the server but mustChooseNow is on the client" — for every reader, on
 * every load. A plain module has no client/server boundary, so the server page and the client
 * component below can both call the same function directly, which was the whole point of
 * having one function rather than two copies of the same condition.
 */
export interface Viewer {
  /** The reader's address, or `null` when nobody is signed in. */
  email: string | null
  /**
   * Whether the v3.7 plan-choice gate would actually stop this reader — **not** the raw
   * `planChosenAt` fact. See `loadIdentity`'s own comment for why the two differ.
   */
  mustChoosePlan: boolean
  /** The plan in force, gift included — `null` when there is nobody, or nothing enforced. */
  plan: Plan | null
  /** The subscription underneath any gift: what every rank question here is asked of. */
  subscriptionPlan: Plan | null
}

/**
 * Whether this reader is being *made* to choose — the v3.7 gate actually stopping them, which
 * is the state that turns every paid card's button into «Choose <plan>» and the Free card's
 * into «Continue with Free», and the page's own `<h1>` into «Choose your plan».
 *
 * `mustChoosePlan` is already the gate's own question rather than the raw `planChosenAt`, but
 * it is answered `false` for a visitor with no session — who is not being made to do anything,
 * and gets «Sign up».
 */
export function mustChooseNow(viewer: Viewer): boolean {
  return viewer.email !== null && viewer.mustChoosePlan
}
