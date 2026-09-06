/**
 * Where identity crosses from the edges into the database (v4.7).
 *
 * Inside the database a row is identified by an integer; at the edges it is identified by
 * an address or a slug — a session cookie carries an email, `/songs/[slug]` carries a slug,
 * a `.chopro` in `content/` has nothing but a slug, and an offline write queued in a
 * browser last week names both. `CLAUDE.md` argues that division at length; this
 * module is the seam it implies, and the reason there is exactly one of it.
 *
 * Each of these renders a scalar subquery, so a caller pays no round trip and writes no
 * `await`: `where(eq(songbooks.accountId, accountIdOf(email)))` is one statement, not two.
 * The subquery's own `FROM` shadows any table of the same name in the outer query, so
 * these stay unambiguous even inside a query that already joins `accounts` or `songs` —
 * inner scope wins, which is plain SQL and not a drizzle detail.
 *
 * **They yield NULL for something that does not exist**, and that is deliberate. A
 * comparison against NULL is false, so a read for an unknown address returns nothing
 * rather than throwing; a write into a `NOT NULL` column fails on the constraint, which is
 * the database refusing rather than this module guessing. Neither case is silent. What
 * they must never be used for is *deciding* whether something exists — for that, select
 * the row and look at it.
 */

import { sql, type SQL } from 'drizzle-orm'

import { accounts, songbooks, songs } from './schema'

/**
 * The account that owns this address.
 *
 * Note what this is not: it is not «the account this reader may look at». A global owner
 * has a role without having a row here at all (`lib/roles.ts`), and which account is on
 * screen is a cookie (`accounts/current.ts`), so both of those are answered before this is
 * ever called. This only turns the answer into a number.
 */
export function accountIdOf(ownerEmail: string): SQL<number> {
  return sql<number>`(select ${accounts.id} from ${accounts} where ${accounts.ownerEmail} = ${ownerEmail})`
}

/** The song with this slug. Slugs are unique across the installation — see `schema.ts`. */
export function songIdOf(slug: string): SQL<number> {
  return sql<number>`(select ${songs.id} from ${songs} where ${songs.slug} = ${slug})`
}

/** The songbook with this slug, unique across the installation for the same reason. */
export function songbookIdOf(slug: string): SQL<number> {
  return sql<number>`(select ${songbooks.id} from ${songbooks} where ${songbooks.slug} = ${slug})`
}
