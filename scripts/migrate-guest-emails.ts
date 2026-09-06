/**
 * Gives each address admitted only through `members` — the table this deploy stops
 * consulting and a later one drops entirely — its own account, ahead of time.
 *
 * Run by hand, once, **before** the new code reaches production: from that deploy on,
 * `isAdmitted` decides who gets in by whether an address already owns a row in `accounts`,
 * not by a row in `members` (v3.1 — niente più ospiti). An address
 * with neither would be shut out the instant the deploy lands, with no path left to earn
 * one — `provisionAccount` never runs for someone `admitted()` has already refused.
 *
 * Run with `npx tsx scripts/migrate-guest-emails.ts`.
 */

import { loadEnv } from './load-env'

/** Already lowercase, so nothing here needs `normalizeEmail` — `provisionAccount` does its own. */
const GUEST_EMAILS = [
  'lconsegni@yahoo.it',
  'marcomassetti1980@gmail.com',
  'albano.nicola@gmail.com',
  'ing.paolo.guarducci@gmail.com',
]

async function main() {
  loadEnv()

  const { eq } = await import('drizzle-orm')
  const { provisionAccount } = await import('../src/lib/accounts/provision')
  const { closeDatabase, db, hasDatabase } = await import('../src/lib/db/client')
  const { accounts } = await import('../src/lib/db/schema')

  if (!hasDatabase) {
    console.error('DATABASE_URL is not set. Run `vercel env pull .env.local` first.')
    process.exit(1)
  }

  const database = db()

  const hasAccount = async (email: string): Promise<boolean> => {
    const rows = await database
      .select({ ownerEmail: accounts.ownerEmail })
      .from(accounts)
      .where(eq(accounts.ownerEmail, email))
      .limit(1)
    return rows.length > 0
  }

  /*
   * One at a time, not `Promise.all`: each is its own account-plus-Example clone inside
   * its own transaction, and running four of those concurrently buys nothing here while
   * making the log below harder to read in order.
   */
  for (const email of GUEST_EMAILS) {
    if (await hasAccount(email)) {
      console.log(`${email}: already has an account, left untouched.`)
      continue
    }

    /*
     * Failures are logged and swallowed inside `provisionAccount` itself (see its own
     * comment) so that a sign-in can never fail on account of provisioning — which means
     * the only way this script can tell success from failure is to look again afterwards.
     */
    await provisionAccount(email)

    console.log(
      (await hasAccount(email))
        ? `${email}: account created.`
        : `${email}: FAILED — still no account after provisionAccount, see the error logged above.`,
    )
  }

  await closeDatabase()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
