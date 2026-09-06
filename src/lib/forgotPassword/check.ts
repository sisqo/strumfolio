/**
 * The read-only half of `/reset-password` (v3.2) — whether a reset
 * token still checks out, with nothing written. Shared, unlike `verify/check.ts`'s own
 * version of this question: `resetPassword` below reuses this directly for its own
 * recheck, since neither call sits inside an explicit transaction, unlike `/verify`'s
 * write — see that flow's own comment on why the two cannot share code the same way.
 *
 * No `'use server'`: this runs from the page's own render on a GET, same reasoning as
 * `verify/check.ts`, even though nothing here needs the GET-safety argument quite as much
 * — typing and submitting a new password is already the explicit action a scanner never
 * takes, so `/reset-password` shows the form directly rather than a button first (see
 * that page's own comment). This still checks without writing, because the check itself
 * has nothing to write.
 */

import { eq } from 'drizzle-orm'

import { normalizeEmail } from '@/lib/allowlist'
import { hashToken } from '@/lib/auth/tokens'
import { db, hasDatabase } from '@/lib/db/client'
import { passwordResetTokens } from '@/lib/db/schema'

export type PasswordResetCheck = 'no-database' | 'valid' | 'invalid'

export async function checkPasswordResetToken(
  email: string | undefined,
  token: string | undefined,
): Promise<PasswordResetCheck> {
  if (!hasDatabase) return 'no-database'
  if (!email || !token) return 'invalid'

  try {
    const rows = await db()
      .select({ tokenHash: passwordResetTokens.tokenHash, expiresAt: passwordResetTokens.expiresAt })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.email, normalizeEmail(email)))
      .limit(1)

    const row = rows[0]
    if (row === undefined) return 'invalid'
    if (hashToken(token) !== row.tokenHash) return 'invalid'
    if (row.expiresAt.getTime() <= Date.now()) return 'invalid'
    return 'valid'
  } catch (error) {
    // Fails closed, same reasoning as `checkPendingRegistration`: a false "invalid" costs
    // a support question, a false "valid" would let a broken database vouch for a link it
    // never actually read.
    console.error('checkPasswordResetToken failed', error)
    return 'invalid'
  }
}
