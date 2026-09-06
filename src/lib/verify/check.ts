/**
 * The read-only half of `/verify` (v3.2) — whether a pending
 * registration's token still checks out, with nothing written.
 *
 * Kept out of `verify/actions.ts` on purpose, and with no `'use server'` directive: this
 * runs straight from the page's own render, on a GET, and an email scanner that "clicks" a
 * link to see where it goes must be free to run this as many times as it likes without
 * ever burning the token — see that file's own comment on why the actual verification is
 * a separate, explicit action instead.
 */

import { eq } from 'drizzle-orm'

import { normalizeEmail } from '@/lib/allowlist'
import { hashToken } from '@/lib/auth/tokens'
import { db, hasDatabase } from '@/lib/db/client'
import { pendingRegistrations } from '@/lib/db/schema'

export type PendingRegistrationCheck =
  | { status: 'no-database' }
  | { status: 'valid' }
  /**
   * `canResend` is true whenever a row still exists for this address, whatever made the
   * token itself fail — expired, or simply wrong. False only means there is nothing left
   * to extend: the address belongs on `/register` to start over with a real password,
   * not here with a link that no longer points at anything.
   */
  | { status: 'invalid'; canResend: boolean }

export async function checkPendingRegistration(
  email: string | undefined,
  token: string | undefined,
): Promise<PendingRegistrationCheck> {
  if (!hasDatabase) return { status: 'no-database' }
  if (!email || !token) return { status: 'invalid', canResend: false }

  try {
    const rows = await db()
      .select({
        verificationTokenHash: pendingRegistrations.verificationTokenHash,
        expiresAt: pendingRegistrations.expiresAt,
      })
      .from(pendingRegistrations)
      .where(eq(pendingRegistrations.email, normalizeEmail(email)))
      .limit(1)

    const row = rows[0]
    if (row === undefined) return { status: 'invalid', canResend: false }

    const matches = hashToken(token) === row.verificationTokenHash
    const expired = row.expiresAt.getTime() <= Date.now()
    if (matches && !expired) return { status: 'valid' }

    return { status: 'invalid', canResend: true }
  } catch (error) {
    // Fails closed, unlike `checkRateLimit`'s fail-open: a false "invalid" here costs one
    // support question, but a false "valid" would be a page that thinks an unreadable
    // database has already vouched for an address it never checked.
    console.error('checkPendingRegistration failed', error)
    return { status: 'invalid', canResend: false }
  }
}
