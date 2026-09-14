/**
 * The QA accounts this installation already has, for the list on `/qa`.
 *
 * A plain module rather than a function in `qa/actions.ts`: that file is `'use server'`, so
 * everything it exports is an endpoint the browser can call by id, and «list the test accounts»
 * has no business being one. The same separation `redeemable.ts` was moved out of `checkout.ts`
 * for.
 *
 * **The `LIKE` is not the guard.** It narrows the query; `isQaEmail` decides. A pattern is the
 * wrong shape for a security boundary — `%@strumfolio.test` matches `a@b@strumfolio.test` and
 * a hand-written row could be anything — so every row is put through the same predicate the
 * entry point itself uses before it is offered as something to sign in as.
 */

import { desc, like } from 'drizzle-orm'

import { db, hasDatabase } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { type Plan, readPlan } from '@/lib/plans/types'
import { QA_DOMAIN, isQaEmail } from './entry'

export interface QaAccount {
  email: string
  name: string | null
  plan: Plan
  planStatus: string
  createdAt: Date
}

/** The most recent QA accounts, newest first. Never throws: this page is a tool, not a screen. */
export async function qaAccounts(limit = 20): Promise<QaAccount[]> {
  if (!hasDatabase) return []

  try {
    const rows = await db()
      .select({
        email: accounts.ownerEmail,
        firstName: accounts.firstName,
        lastName: accounts.lastName,
        plan: accounts.plan,
        planStatus: accounts.planStatus,
        createdAt: accounts.createdAt,
      })
      .from(accounts)
      .where(like(accounts.ownerEmail, `%@${QA_DOMAIN}`))
      .orderBy(desc(accounts.createdAt))
      .limit(limit)

    return rows
      .filter((row) => isQaEmail(row.email))
      .map((row) => ({
        email: row.email,
        name: [row.firstName, row.lastName].filter((part) => part !== null && part !== '').join(' ') || null,
        plan: readPlan(row.plan),
        planStatus: row.planStatus,
        createdAt: row.createdAt,
      }))
  } catch (error) {
    console.error('qaAccounts failed', error)
    return []
  }
}
