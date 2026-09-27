/**
 * Personal AI tokens: minting one, and turning a bearer string back into an account.
 *
 * A plain module, never `'use server'`: `resolveToken` takes a secret and answers an account,
 * and as a Server Action it would be an unauthenticated oracle with an id shipped to the
 * browser. The `/ai-access` actions that create and revoke tokens live in `actions.ts`.
 *
 * The rules, each a decision of 2026-09-27:
 *
 * - **the secret is shown once** and only its sha256 is stored — 32 random bytes need no slow
 *   hash, and a lookup is one probe of a unique index;
 * - **no expiry**, but a token unused for `TOKEN_IDLE_DAYS` is dead, so one forgotten in a
 *   config file does not stay valid for ever;
 * - **a password change does not touch it** — `sessions_valid_after` is about browsers;
 * - **suspension and deletion end it**: the account row is read on every call, and deletion
 *   cascades the row away.
 *
 * The plan (`refused.aiAccess`) is asked by the caller on every call, not here: a token on an
 * account that dropped to Free is suspended rather than dead, and has to say so.
 */

import { createHash, randomBytes } from 'node:crypto'

import { and, eq, isNull } from 'drizzle-orm'

import { db, hasDatabase } from '@/lib/db/client'
import { accounts, apiTokens } from '@/lib/db/schema'

export const TOKEN_PREFIX = 'sfm_'
export const TOKEN_IDLE_DAYS = 180
/** How stale `last_used_at` may get before a call writes it again — not a write per call. */
const TOUCH_AFTER_MS = 5 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export interface MintedToken {
  secret: string
  prefix: string
  hash: string
}

export function hashToken(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

export function mintToken(): MintedToken {
  const secret = TOKEN_PREFIX + randomBytes(32).toString('base64url')
  return { secret, prefix: secret.slice(0, TOKEN_PREFIX.length + 6), hash: hashToken(secret) }
}

/** The shape a bearer string must have before it is worth a query. */
export function looksLikeToken(value: string): boolean {
  return /^sfm_[A-Za-z0-9_-]{43}$/.test(value)
}

/** When a token stops working through disuse: its last use, or its birth if never used. */
export function idleDeadline(token: { createdAt: Date; lastUsedAt: Date | null }): Date {
  return new Date((token.lastUsedAt ?? token.createdAt).getTime() + TOKEN_IDLE_DAYS * DAY_MS)
}

export type TokenState = 'live' | 'revoked' | 'idle'

export function tokenState(
  token: { createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null },
  now: Date,
): TokenState {
  if (token.revokedAt !== null) return 'revoked'
  return now.getTime() >= idleDeadline(token).getTime() ? 'idle' : 'live'
}

export interface ResolvedToken {
  tokenId: number
  accountId: number
  accountOwnerEmail: string
}

/**
 * The account behind a bearer string, or null for anything that is not a live token of an
 * account that may still act. Every refusal is the same null on purpose: the route answers one
 * 401 whatever the reason, so the endpoint tells a stranger nothing about which tokens exist.
 */
export async function resolveToken(secret: string, now = new Date()): Promise<ResolvedToken | null> {
  if (!hasDatabase || !looksLikeToken(secret)) return null

  const rows = await db()
    .select({
      id: apiTokens.id,
      accountId: apiTokens.accountId,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
      revokedAt: apiTokens.revokedAt,
      ownerEmail: accounts.ownerEmail,
      suspendedAt: accounts.suspendedAt,
    })
    .from(apiTokens)
    .innerJoin(accounts, eq(apiTokens.accountId, accounts.id))
    .where(eq(apiTokens.hash, hashToken(secret)))
    .limit(1)

  const row = rows[0]
  if (row === undefined || row.suspendedAt !== null || tokenState(row, now) !== 'live') return null

  if (row.lastUsedAt === null || now.getTime() - row.lastUsedAt.getTime() > TOUCH_AFTER_MS) {
    /* Best effort: a failed stamp must not fail the call it describes. */
    await db()
      .update(apiTokens)
      .set({ lastUsedAt: now })
      .where(and(eq(apiTokens.id, row.id), isNull(apiTokens.revokedAt)))
      .catch((error) => console.error('api token touch failed', error))
  }

  return { tokenId: row.id, accountId: row.accountId, accountOwnerEmail: row.ownerEmail }
}
