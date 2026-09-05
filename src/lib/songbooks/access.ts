/**
 * Whether the signed-in reader may change a given songbook or section — shared by
 * `songbooks/actions.ts` and `sections/actions.ts`, which both need the same answer to
 * the same question before touching a row named only by slug or by id.
 *
 * `not-found` rather than `not-allowed` when the thing exists but under an account the
 * caller has no business in: the alternative would confirm to a stranger that a given
 * slug or id exists somewhere, which is not this app's to tell them.
 */

import { eq } from 'drizzle-orm'

import { accessTo } from '@/lib/auth/session'
import { songbookAccountOf } from '@/lib/data/access'
import { db } from '@/lib/db/client'
import { sections, songbooks } from '@/lib/db/schema'
import type { Entitlements } from '@/lib/plans/entitlements'
import { entitlementsOf } from '@/lib/plans/resolve'
import { canEdit } from '@/lib/roles'

import type { WriteFailure } from './types'

/**
 * Both success branches carry the owning account's **entitlements**, for the reason
 * `Permission` gives (`auth/session.ts`): a caller holding one of these has already been
 * told what the plan allows, so a write cannot have asked whether it *may* without also
 * having been told how much. They are the *songbook's* account's entitlements, never the
 * caller's — a global owner editing a customer's songbook is bound by that customer's plan.
 *
 * Several callers deliberately ignore the field, and that is not an oversight: every
 * deletion (`removeSongbook`, `purgeSongbook`, `removeSection`, `purgeSection`) stays open
 * under the freeze, because the freeze exists to be escaped by deleting and those are the
 * escape. Each of them says so at its own call site.
 */
type EditableSongbook =
  | { ok: true; accountOwnerEmail: string; entitlements: Entitlements }
  | { ok: false; reason: WriteFailure }

type EditableSection =
  | { ok: true; accountOwnerEmail: string; songbookSlug: string; entitlements: Entitlements }
  | { ok: false; reason: WriteFailure }

export async function editableSongbook(slug: string): Promise<EditableSongbook> {
  const owner = await songbookAccountOf(slug)
  if (owner === null) return { ok: false, reason: 'not-found' }

  const editor = await accessTo(owner)
  if (editor === null) return { ok: false, reason: 'not-found' }
  if (!canEdit(editor.role)) return { ok: false, reason: 'not-allowed' }

  // After the access checks, never before: an address with no business here must learn
  // nothing about this account, and the plan lookup is two queries nobody owes a stranger.
  return { ok: true, accountOwnerEmail: owner, entitlements: await entitlementsOf(owner) }
}

/** Same question, starting from a section's id: resolved to its songbook first. */
export async function editableSection(id: number): Promise<EditableSection> {
  const rows = await db()
    .select({ songbookSlug: songbooks.slug })
    .from(sections)
    .innerJoin(songbooks, eq(sections.songbookId, songbooks.id))
    .where(eq(sections.id, id))
    .limit(1)

  if (rows.length === 0) return { ok: false, reason: 'not-found' }

  const target = await editableSongbook(rows[0].songbookSlug)
  if (!target.ok) return target

  return {
    ok: true,
    accountOwnerEmail: target.accountOwnerEmail,
    songbookSlug: rows[0].songbookSlug,
    // Passed straight through rather than resolved again: the section's account is the
    // songbook's account, so a second lookup could only ever agree at twice the cost.
    entitlements: target.entitlements,
  }
}
