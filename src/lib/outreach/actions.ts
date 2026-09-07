'use server'

/**
 * The four entry points `/accounts/[email]`'s Outreach tab uses, and the only place in this
 * feature where authorisation lives.
 *
 * Every one of them re-checks `isOwner` itself rather than trusting the page that rendered the
 * panel — the discipline `coupons/actions.ts` and `settings/actions.ts` both state: a server
 * action is reachable by anything holding a session cookie, so a page's `notFound()` is a
 * courtesy to the reader and never the fence. Here that matters more than usual, since what is
 * behind these functions sends mail to somebody else's address.
 *
 * `run.ts` and `read.ts` deliberately carry no session check at all. They take `triggeredBy` as
 * an argument, which is what lets the same code be called by a schedule that has no session to
 * check — see `runDueOutreach`.
 */

import { revalidatePath } from 'next/cache'

import { auth } from '@/auth'
import { isOwner, normalizeEmail } from '@/lib/allowlist'
import { hasDatabase } from '@/lib/db/client'

import { outreachViewFor } from './read'
import type { OutreachView } from './read'
import { runDueOutreach, runOutreach, suppressOutreach } from './run'
import { readOutreachKind } from './types'
import type { OutreachFailure, OutreachKind, OutreachResult } from './types'

/**
 * The signed-in global owner's own address, or null for anybody else.
 *
 * Returned rather than just checked, because it is also what gets written to `triggeredBy`: a
 * row saying who ran something by hand is worth more than one saying `'system'` for everything,
 * and the address is already in hand at the only moment it can be known.
 */
async function operator(): Promise<string | null> {
  const session = await auth()
  const email = session?.user?.email
  if (!isOwner(email, process.env.ALLOWED_EMAILS)) return null
  return email === undefined || email === null ? null : normalizeEmail(email)
}

/**
 * Everything the tab draws. `{ ok: false }` rather than a null view, so the panel can print
 * which of the three things went wrong instead of an empty list — «nothing has ever been sent
 * to this account» is the one sentence this screen must not say by accident.
 */
export async function loadOutreachFor(
  ownerEmail: string,
): Promise<{ ok: true; view: OutreachView } | { ok: false; reason: OutreachFailure }> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  if ((await operator()) === null) return { ok: false, reason: 'not-allowed' }

  const view = await outreachViewFor(ownerEmail, new Date())
  return view === null ? { ok: false, reason: 'failed' } : { ok: true, view }
}

/**
 * Run one action against one account now — the button on a line, whether it reads «Run now» on
 * a fresh occurrence or «Retry» on one that failed. `runOutreach` decides which of the two this
 * is from what is already in the table; the caller does not have to know.
 */
export async function runOutreachNow(rawKind: string, ownerEmail: string): Promise<OutreachResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const who = await operator()
  if (who === null) return { ok: false, reason: 'not-allowed' }

  const kind = readOutreachKind(rawKind)
  if (kind === null) return { ok: false, reason: 'unknown-kind' }

  const result = await runOutreach(kind, ownerEmail, who, new Date())
  revalidatePath(`/accounts/${encodeURIComponent(ownerEmail)}`)
  return result
}

/**
 * Everything due for this account, in one press.
 *
 * Reports the two counts rather than a bare ok: a pass that ran nothing because nothing was due
 * and a pass that ran three things have to read differently on screen, and today — with no
 * handler built — the honest answer is always «nothing was due».
 */
export async function runEverythingDue(
  ownerEmail: string,
): Promise<{ ok: true; ran: OutreachKind[]; refused: OutreachKind[] } | { ok: false; reason: OutreachFailure }> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const who = await operator()
  if (who === null) return { ok: false, reason: 'not-allowed' }

  const result = await runDueOutreach(ownerEmail, who, new Date())
  revalidatePath(`/accounts/${encodeURIComponent(ownerEmail)}`)
  return result
}

/**
 * Deliberately not doing one — recorded, which is the point. It claims the occurrence exactly
 * as a run does, so «skipped» is as binding as «done» until an operator changes their mind.
 */
export async function skipOutreach(rawKind: string, ownerEmail: string, reason: string): Promise<OutreachResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const who = await operator()
  if (who === null) return { ok: false, reason: 'not-allowed' }

  const kind = readOutreachKind(rawKind)
  if (kind === null) return { ok: false, reason: 'unknown-kind' }

  const result = await suppressOutreach(kind, ownerEmail, reason, who, new Date())
  revalidatePath(`/accounts/${encodeURIComponent(ownerEmail)}`)
  return result
}
