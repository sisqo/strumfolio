'use server'

/**
 * The two courtesy sends — an operator's own click, one account at a time, from an icon on
 * `/accounts`. Owner-gated, unlike `publicActions.ts` next door, which is the one file in this
 * module a signed-out reader is meant to reach.
 *
 * Each send claims and settles its own row in `outreach_actions`, the same shape
 * `sendGiftNotice` (`accounts/actions.ts`) already uses and for the same reason: the
 * claim-before-send ordering is the whole guarantee this app makes about "never twice," and it
 * must not be implemented a third time. Neither kind ever reaches `runOutreach`/`HANDLERS` —
 * both are declared with `trigger: 'elsewhere'` in `lib/outreach/types.ts` for exactly this
 * reason, the same fence `gift_notice` already sits behind.
 */

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { auth } from '@/auth'
import { isOwner, normalizeEmail } from '@/lib/allowlist'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts, outreachActions } from '@/lib/db/schema'
import { courtesyCheckinEmail, courtesyThanksEmail } from '@/lib/email/templates'
import { deliverEmail } from '@/lib/email/send'
import { claimOccurrence, settle } from '@/lib/outreach/claim'
import { occurrenceKeyFor } from '@/lib/outreach/occurrence'
import { OUTREACH } from '@/lib/outreach/types'
import type { OutreachFailure } from '@/lib/outreach/types'
import { requestOrigin } from '@/lib/rateLimit'

import { courtesyUnsubscribeToken } from './unsubscribe'

const COURTESY_FROM = 'Francesco from Strumfolio <info@strumfolio.com>'
const COURTESY_REPLY_TO = 'info@strumfolio.com'

export type CourtesyFailure =
  | 'not-allowed'
  | 'no-database'
  /** `COURTESY_UNSUBSCRIBE_SECRET` is unset — refused before anything is claimed. */
  | 'no-secret'
  | 'unknown-account'
  /** This address has used the one-click link; sending would ignore it. */
  | 'opted-out'
  | 'suspended'
  /** `courtesy_checkin` only: no `done` row for `courtesy_thanks` on this address yet. */
  | 'send-thanks-first'
  /** A `done` row already exists for this occurrence. */
  | 'already-sent'
  | 'in-flight'
  | 'send-failed'
  | 'failed'

export type CourtesyResult = { ok: true } | { ok: false; reason: CourtesyFailure }

export const COURTESY_MESSAGE: Record<CourtesyFailure, string> = {
  'not-allowed': 'Only a global owner may send this.',
  'no-database': 'No database configured: nothing can be sent.',
  'no-secret': 'COURTESY_UNSUBSCRIBE_SECRET is not configured, so no unsubscribe link can be signed.',
  'unknown-account': 'This account no longer exists. Reload the page.',
  'opted-out': 'This reader unsubscribed from courtesy emails.',
  suspended: 'This account is suspended.',
  'send-thanks-first': 'Send the thank-you email first.',
  'already-sent': 'This has already been sent to this account.',
  'in-flight': 'Another send for this account started a moment ago. Wait for it to finish.',
  'send-failed': 'The email did not go out. You can try again.',
  failed: 'Could not send. Please try again.',
}

interface CourtesyAccountRow {
  id: number
  ownerEmail: string
  firstName: string | null
  suspended: boolean
  optedOut: boolean
}

async function operator(): Promise<string | null> {
  const session = await auth()
  const email = session?.user?.email
  if (!isOwner(email, process.env.ALLOWED_EMAILS)) return null
  return email === undefined || email === null ? null : normalizeEmail(email)
}

async function readAccount(ownerEmail: string): Promise<CourtesyAccountRow | null> {
  const rows = await db()
    .select({
      id: accounts.id,
      ownerEmail: accounts.ownerEmail,
      firstName: accounts.firstName,
      suspendedAt: accounts.suspendedAt,
      courtesyOptedOutAt: accounts.courtesyOptedOutAt,
    })
    .from(accounts)
    .where(eq(accounts.ownerEmail, normalizeEmail(ownerEmail)))
    .limit(1)

  const row = rows[0]
  if (row === undefined) return null

  return {
    id: row.id,
    ownerEmail: row.ownerEmail,
    firstName: row.firstName,
    suspended: row.suspendedAt !== null,
    optedOut: row.courtesyOptedOutAt !== null,
  }
}

/** Whether a `done` `courtesy_thanks` row already exists for this address. */
async function thanksAlreadySent(ownerEmail: string): Promise<boolean> {
  const rows = await db()
    .select({ id: outreachActions.id })
    .from(outreachActions)
    .where(
      and(
        eq(outreachActions.kind, 'courtesy_thanks'),
        eq(outreachActions.accountOwnerEmail, normalizeEmail(ownerEmail)),
        eq(outreachActions.status, 'done'),
      ),
    )
    .limit(1)
  return rows[0] !== undefined
}

/**
 * Maps `claimOccurrence`'s own failure vocabulary onto this feature's. In practice it only
 * ever answers `already-done`, `in-flight` or `failed` for these two kinds — the wider
 * `OutreachFailure` union exists for the whole engine, not for one caller of it — so anything
 * else falls back to `failed` rather than the type ever refusing to compile.
 */
function claimFailure(reason: OutreachFailure): CourtesyFailure {
  if (reason === 'in-flight') return 'in-flight'
  if (reason === 'already-done') return 'already-sent'
  return 'failed'
}

function unsubscribeUrlFor(origin: string, ownerEmail: string, token: string): string {
  const url = new URL('/courtesy-unsubscribe', origin)
  url.searchParams.set('email', ownerEmail)
  url.searchParams.set('token', token)
  return url.toString()
}

/** Every check both sends share, before either ever claims an occurrence. */
async function preflight(ownerEmail: string): Promise<{ ok: true; account: CourtesyAccountRow } | { ok: false; reason: CourtesyFailure }> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  if ((await operator()) === null) return { ok: false, reason: 'not-allowed' }

  const account = await readAccount(ownerEmail)
  if (account === null) return { ok: false, reason: 'unknown-account' }
  if (account.suspended) return { ok: false, reason: 'suspended' }
  if (account.optedOut) return { ok: false, reason: 'opted-out' }

  return { ok: true, account }
}

export async function sendCourtesyThanks(ownerEmail: string): Promise<CourtesyResult> {
  const pre = await preflight(ownerEmail)
  if (!pre.ok) return pre
  const { account } = pre

  const now = new Date()
  const who = (await operator()) ?? 'system'

  let token: string
  let origin: string
  try {
    token = courtesyUnsubscribeToken(account.ownerEmail)
    origin = await requestOrigin()
  } catch (error) {
    console.error('sendCourtesyThanks could not sign the unsubscribe link', error)
    return { ok: false, reason: 'no-secret' }
  }

  const occurrenceKey = occurrenceKeyFor(OUTREACH.courtesy_thanks.cadence, now)
  const claim = await claimOccurrence(
    { accountId: account.id, ownerEmail: account.ownerEmail },
    'courtesy_thanks',
    occurrenceKey,
    'email',
    who,
    now,
  )
  if (!claim.ok) {
    return { ok: false, reason: claimFailure(claim.reason) }
  }

  const template = courtesyThanksEmail({
    firstName: account.firstName,
    unsubscribeUrl: unsubscribeUrlFor(origin, account.ownerEmail, token),
  })

  const outcome = await deliverEmail({
    to: account.ownerEmail,
    subject: template.subject,
    html: template.html,
    text: template.text,
    from: COURTESY_FROM,
    replyTo: COURTESY_REPLY_TO,
  })

  await settle(claim.id, outcome.ok ? { ok: true, detail: template.subject } : { ok: false, reason: outcome.reason }, now)

  revalidatePath('/accounts')
  return outcome.ok ? { ok: true } : { ok: false, reason: 'send-failed' }
}

export async function sendCourtesyCheckin(ownerEmail: string): Promise<CourtesyResult> {
  const pre = await preflight(ownerEmail)
  if (!pre.ok) return pre
  const { account } = pre

  /*
   * The code enforcement for "Sono sempre Francesco" / "una seconda e ultima volta": both
   * sentences in this template's own copy are false for an address that never received the
   * first one. Checked here, not only by the icon's own disabled state on the client — the
   * screen is a courtesy, this is the fence.
   */
  if (!(await thanksAlreadySent(account.ownerEmail))) {
    return { ok: false, reason: 'send-thanks-first' }
  }

  const now = new Date()
  const who = (await operator()) ?? 'system'

  let token: string
  let origin: string
  try {
    token = courtesyUnsubscribeToken(account.ownerEmail)
    origin = await requestOrigin()
  } catch (error) {
    console.error('sendCourtesyCheckin could not sign the unsubscribe link', error)
    return { ok: false, reason: 'no-secret' }
  }

  const occurrenceKey = occurrenceKeyFor(OUTREACH.courtesy_checkin.cadence, now)
  const claim = await claimOccurrence(
    { accountId: account.id, ownerEmail: account.ownerEmail },
    'courtesy_checkin',
    occurrenceKey,
    'email',
    who,
    now,
  )
  if (!claim.ok) {
    return { ok: false, reason: claimFailure(claim.reason) }
  }

  const template = courtesyCheckinEmail({
    firstName: account.firstName,
    unsubscribeUrl: unsubscribeUrlFor(origin, account.ownerEmail, token),
  })

  const outcome = await deliverEmail({
    to: account.ownerEmail,
    subject: template.subject,
    html: template.html,
    text: template.text,
    from: COURTESY_FROM,
    replyTo: COURTESY_REPLY_TO,
  })

  await settle(claim.id, outcome.ok ? { ok: true, detail: template.subject } : { ok: false, reason: outcome.reason }, now)

  revalidatePath('/accounts')
  return outcome.ok ? { ok: true } : { ok: false, reason: 'send-failed' }
}
