/**
 * The plan columns, the row they select into, and the mapping from one to a `StoredPlan`.
 *
 * A plain sibling of `read.ts` rather than part of it, and **not** by preference: `read.ts`
 * carries `'use server'`, so it may export only async functions. A synchronous mapper and a
 * column-set constant exported from there compile fine and then fail at *build* time with
 * «Server Actions must be async functions» — invisible to `tsc --noEmit`, which is exactly the
 * arrangement `CLAUDE.md` describes for `plans/paddleClient.ts` beside `paddleCheckout.ts` and
 * `newsletter/stamps.ts` beside its own actions.
 *
 * What lives here is the one definition of «so what plan are they actually on» that three
 * callers share: `listAccountPlans` and `getAccountDetail` in `read.ts`, and `/leads`' rollup in
 * `attribution/read.ts`. A second spelling of it on any of the three is the drift this file
 * exists to prevent.
 */

import { accounts } from '@/lib/db/schema'
import { readPendingCycle } from '@/lib/plans/prices'
import { readPendingPlan, readPlan, readPlanStatus } from '@/lib/plans/types'
import type { StoredPlan } from '@/lib/plans/entitlements'

/**
 * The exact column set all three callers select — one shape, so `planLineFrom` and
 * `storedPlanFrom` can resolve either a whole table's worth of rows or a single one with no
 * second copy of the resolution logic.
 */
export const PLAN_COLUMNS = {
  plan: accounts.plan,
  planStatus: accounts.planStatus,
  planExpiresAt: accounts.planExpiresAt,
  pendingPlan: accounts.pendingPlan,
  pendingCycle: accounts.pendingCycle,
  grantedPlan: accounts.grantedPlan,
  grantedUntil: accounts.grantedUntil,
  grantedBy: accounts.grantedBy,
  grantedAt: accounts.grantedAt,
  grantedNote: accounts.grantedNote,
  planChosenAt: accounts.planChosenAt,
} as const

export interface PlanRow {
  plan: string
  planStatus: string
  planExpiresAt: Date | null
  pendingPlan: string | null
  pendingCycle: string | null
  grantedPlan: string | null
  grantedUntil: Date | null
  grantedBy: string | null
  grantedAt: Date | null
  grantedNote: string | null
  planChosenAt: Date | null
}

/**
 * One row's worth of `PLAN_COLUMNS` as a `StoredPlan` — the mapping `planLineFrom` used to hold
 * inline, lifted out so `/leads` can reach it too.
 *
 * Built exactly as `storedPlanOf` (`plans/resolve.ts`) builds it, `readPlan`/`readPlanStatus`
 * included: these values did come out of the database, which is the one place those readers are
 * the right tool. The null rather than a `readPlan` fallback on `grantedPlan` matters for the
 * same reason it does there — it would make every ungifted account the holder of a free grant,
 * and the screen would print the gift.
 */
export function storedPlanFrom(row: PlanRow): StoredPlan {
  return {
    plan: readPlan(row.plan),
    expiresAt: row.planExpiresAt,
    status: readPlanStatus(row.planStatus),
    // `readPendingPlan`/`readPendingCycle`, not `readPlan` — see their own comments.
    pendingPlan: readPendingPlan(row.pendingPlan),
    pendingCycle: readPendingCycle(row.pendingCycle),
    grantedPlan: row.grantedPlan === null ? null : readPlan(row.grantedPlan),
    grantedUntil: row.grantedUntil,
  }
}
