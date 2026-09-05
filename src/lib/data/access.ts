/**
 * Which account a song or songbook belongs to, for the one check that matters once a
 * reader reaches a page by its slug rather than by navigating their own account: is this
 * *their* content to see at all.
 *
 * Database-only. Without one there is a single local repertoire read straight from
 * `content/` for one developer (`lib/data/index.ts`) — no accounts table, no ownership to
 * ask about. Callers branch on `hasDatabase` themselves rather than this module
 * pretending an answer exists where the question does not.
 *
 * Both answer with an **address** and not with an id (v4.7), which is what the caller
 * compares against `user.accountOwnerEmail`: `currentUser()` never reads the database, so
 * it has no id to compare, and giving it one would cost it the ability to answer at all
 * where there is no database — `lib/auth/session.ts` says why that matters. So the join to
 * `accounts` here is the seam turning back the other way: from the id the row now carries
 * to the address the permission check speaks.
 */

import { eq } from 'drizzle-orm'

import { db, hasDatabase } from '@/lib/db/client'
import { accounts, songbooks, songs } from '@/lib/db/schema'

export async function songbookAccountOf(slug: string): Promise<string | null> {
  if (!hasDatabase) return null

  const rows = await db()
    .select({ accountOwnerEmail: accounts.ownerEmail })
    .from(songbooks)
    .innerJoin(accounts, eq(songbooks.accountId, accounts.id))
    .where(eq(songbooks.slug, slug))
    .limit(1)

  return rows[0]?.accountOwnerEmail ?? null
}

/** A song's account is its songbook's — two joins, since `songs` carries no copy of its own. */
export async function songAccountOf(slug: string): Promise<string | null> {
  if (!hasDatabase) return null

  const rows = await db()
    .select({ accountOwnerEmail: accounts.ownerEmail })
    .from(songs)
    .innerJoin(songbooks, eq(songs.songbookId, songbooks.id))
    .innerJoin(accounts, eq(songbooks.accountId, accounts.id))
    .where(eq(songs.slug, slug))
    .limit(1)

  return rows[0]?.accountOwnerEmail ?? null
}
