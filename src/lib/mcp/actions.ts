'use server'

/**
 * The `/profile` side of AI access: listing, creating and revoking one's own tokens.
 *
 * **Only the account's own owner, in their own account, from a browser.** Three refusals, each
 * a decision rather than a default: a call made *with* a token is refused (a token must never
 * mint or revoke tokens — `tokenActor`), a global owner standing inside a customer's account is
 * refused (a token belongs to the account of whoever created it, and the power to open other
 * accounts stays in the browser), and creating needs `refused.aiAccess` clear. Listing and
 * revoking do not: a reader on Free must still see, and be able to kill, the tokens their plan
 * has suspended.
 */

import { and, desc, eq, isNull } from 'drizzle-orm'

import { tokenActor } from '@/lib/auth/actor'
import { currentUser } from '@/lib/auth/session'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts, apiTokens } from '@/lib/db/schema'
import { cleanName } from '@/lib/names'
import { entitlementsOf } from '@/lib/plans/resolve'
import { requestOrigin } from '@/lib/rateLimit'

import { mcpEnabled } from './enabled'
import { idleDeadline, mintToken, tokenState } from './tokens'

/** Live tokens one account may hold at once — one per assistant or machine is the use. */
const MAX_LIVE_TOKENS = 10

export interface AiTokenRow {
  id: number
  name: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
  /** When disuse ends it, if nothing uses it before. */
  idleUntil: string
}

export type AiAccessState =
  | { state: 'unavailable' }
  | { state: 'ready' | 'plan-required'; endpoint: string; tokens: AiTokenRow[] }

export type CreateTokenResult =
  | { ok: true; secret: string; token: AiTokenRow }
  | { ok: false; reason: 'unavailable' | 'plan-required' | 'invalid-name' | 'too-many' | 'failed' }

export type RevokeTokenResult = { ok: true } | { ok: false; reason: 'unavailable' | 'not-found' | 'failed' }

/** The reader's own account id, or null for every case the header refuses. */
async function ownAccount(): Promise<{ id: number; ownerEmail: string } | null> {
  if (!hasDatabase || !mcpEnabled() || tokenActor() !== undefined) return null
  const user = await currentUser()
  if (user === null || user.email !== user.accountOwnerEmail) return null

  const rows = await db()
    .select({ id: accounts.id, ownerEmail: accounts.ownerEmail })
    .from(accounts)
    .where(eq(accounts.ownerEmail, user.accountOwnerEmail))
    .limit(1)
  return rows[0] ?? null
}

function toRow(row: typeof apiTokens.$inferSelect): AiTokenRow {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    idleUntil: idleDeadline(row).toISOString(),
  }
}

async function liveTokens(accountId: number): Promise<AiTokenRow[]> {
  const now = new Date()
  const rows = await db()
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.accountId, accountId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt))
  return rows.filter((row) => tokenState(row, now) === 'live').map(toRow)
}

export async function loadAiAccess(): Promise<AiAccessState> {
  const account = await ownAccount()
  if (account === null) return { state: 'unavailable' }

  const entitlements = await entitlementsOf(account.ownerEmail)
  return {
    state: entitlements.refused.aiAccess === null ? 'ready' : 'plan-required',
    endpoint: `${await requestOrigin()}/api/mcp`,
    tokens: await liveTokens(account.id),
  }
}

export async function createAiToken(name: string): Promise<CreateTokenResult> {
  const account = await ownAccount()
  if (account === null) return { ok: false, reason: 'unavailable' }

  if ((await entitlementsOf(account.ownerEmail)).refused.aiAccess !== null) return { ok: false, reason: 'plan-required' }

  const label = cleanName(typeof name === 'string' ? name : null)
  if (label === null) return { ok: false, reason: 'invalid-name' }

  try {
    if ((await liveTokens(account.id)).length >= MAX_LIVE_TOKENS) return { ok: false, reason: 'too-many' }

    const minted = mintToken()
    const [row] = await db()
      .insert(apiTokens)
      .values({ accountId: account.id, name: label, prefix: minted.prefix, hash: minted.hash })
      .returning()
    return { ok: true, secret: minted.secret, token: toRow(row) }
  } catch (error) {
    console.error('createAiToken failed', error)
    return { ok: false, reason: 'failed' }
  }
}

export async function revokeAiToken(id: number): Promise<RevokeTokenResult> {
  const account = await ownAccount()
  if (account === null) return { ok: false, reason: 'unavailable' }
  if (!Number.isInteger(id)) return { ok: false, reason: 'not-found' }

  try {
    const revoked = await db()
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiTokens.id, id), eq(apiTokens.accountId, account.id), isNull(apiTokens.revokedAt)))
      .returning({ id: apiTokens.id })
    return revoked.length === 0 ? { ok: false, reason: 'not-found' } : { ok: true }
  } catch (error) {
    console.error('revokeAiToken failed', error)
    return { ok: false, reason: 'failed' }
  }
}
