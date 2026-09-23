import { eq } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'

/**
 * Marks an account just created as a test account — for `/qa`, whose addresses can belong to
 * nobody, and for «Create account» when its box is ticked.
 *
 * A second write after `provisionAccount` rather than a field on its insert, so an account can
 * still be created on a database that has not had `0051` yet. **It never throws**: the account
 * already exists by then, and a flag that did not land is one click away on the detail page,
 * which is a smaller wrong than reporting the whole creation as failed. Not a server action —
 * this module has no `'use server'`, so it is reachable only through the callers that already
 * checked who is asking.
 */
export async function markTestAccount(ownerEmail: string): Promise<boolean> {
  try {
    await db().update(accounts).set({ isTest: true }).where(eq(accounts.ownerEmail, ownerEmail))
    return true
  } catch (error) {
    console.error('markTestAccount failed', error)
    return false
  }
}
