'use server'

/**
 * Server actions for songbooks: the app's first write path.
 *
 * Deliberately a small surface — names, membership and order, never song content — and
 * every write requires an **editor** (`canEdit`, the account's admin), since songbooks
 * are shared library structure rather than per-reader preferences. Reading the layer
 * needs only a session: any signed-in reader's home is drawn from it, and so is the
 * name in the way back from a song. One export breaks that pattern on purpose:
 * `copySongbook`, a **global owner** power over two accounts at once, the same
 * distinction `deleteAccount` and `listAllAccounts` (`lib/accounts/`) already draw
 * between an account's own admin and the installation's.
 *
 * The sections of a songbook are next door, in `lib/sections/actions.ts`. The line
 * between the two files is which thing is being changed: the containers here, what is
 * inside them there.
 */

import { asc, eq, inArray, max, sql } from 'drizzle-orm'

import { auth } from '@/auth'
import { isOwner, normalizeEmail } from '@/lib/allowlist'
import { accessTo, asEditor, currentUser } from '@/lib/auth/session'
import { songAccountOf } from '@/lib/data/access'
import { listSectionsForAccount, listSongbooksForAccount } from '@/lib/data/db'
import { DEFAULT_SECTION } from '@/lib/data/types'
import { db, hasDatabase } from '@/lib/db/client'
import { accountIdOf, songbookIdOf } from '@/lib/db/ids'
import { accounts, songbooks, sections, songs } from '@/lib/db/schema'
import { entitlementsOf } from '@/lib/plans/resolve'
import { limitFacts } from '@/lib/plans/types'
import { revalidateSongbook } from '@/lib/revalidate'
import { canEdit } from '@/lib/roles'
import { uniqueSlug } from '@/lib/slug'

import { editableSongbook } from './access'
import { sameMembers } from './order'
import { insertSampleSongbook } from './seed'
import type { SongbookState, CreateResult, WriteResult } from './types'

/**
 * Reads the whole mutable layer for the reader's **current** account. Null when there is
 * nothing to read from.
 *
 * No edit permission required, deliberately — moot besides, now that the only role
 * there is to hold is admin (v3.1). This is where the names come from — the rows on
 * the home, the label on the way back from a song — so nothing more than a session is
 * needed to know which account to read them from.
 */
export async function loadSongbooks(): Promise<SongbookState | null> {
  const user = await currentUser()
  if (user === null) return null

  const [entries, divisions, assigned] = await Promise.all([
    listSongbooksForAccount(user.accountOwnerEmail),
    listSectionsForAccount(user.accountOwnerEmail),
    db()
      .select({ slug: songs.slug, sectionId: songs.sectionId })
      .from(songs)
      .innerJoin(songbooks, eq(songs.songbookId, songbooks.id))
      .where(eq(songbooks.accountId, accountIdOf(user.accountOwnerEmail))),
  ])

  const assignments: Record<string, number> = {}
  for (const row of assigned) {
    if (row.sectionId !== null) assignments[row.slug] = row.sectionId
  }

  return { songbooks: entries, sections: divisions, assignments }
}

/**
 * Creates a songbook, and with it the section it is born with.
 *
 * Both or neither, in one transaction. A songbook with no sections would be a
 * songbook nothing can be filed into: its page shows «no songs» and the import
 * would have to invent a section behind the reader's back. Being born with one also
 * means the invariant — every song in exactly one section — holds for every songbook
 * from its first instant, rather than from its first import.
 */
export async function createSongbook(name: string): Promise<CreateResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  const editor = await asEditor()
  if (!editor.ok) return { ok: false, reason: editor.reason }

  /*
   * Before the transaction opens, not inside it: a refusal after the insert would have
   * minted a slug — the one thing about a songbook that never changes again — and left the
   * `sections` row below it to be rolled back. The reason is read off the guard rather
   * than derived here, so this cannot tell an account that is already over its cap to buy
   * more when the answer is to delete: `refused.createSongbook` already says which.
   *
   * Read-then-write, across two transactions, and therefore raceable — stated here because
   * it is a real gap and not an oversight. The count behind this refusal was taken in the
   * guard (`asEditor` → `entitlementsOf`), the insert happens in the transaction below, and
   * nothing re-reads in between: N concurrent calls all see the same count and all insert,
   * so a free account can end up holding two songbooks. Not patched, for two reasons that
   * are worth knowing before somebody tries. Re-counting inside the transaction fixes
   * nothing on its own — under READ COMMITTED neither writer sees the other's uncommitted
   * row — so the only real fix is a `SELECT ... FOR UPDATE` on this account's `accounts` row
   * held across check-and-insert; and that lock takes `accounts` *before* `songbooks` and
   * `songs`, while `removeAccountAndContent` holds locks on those two and only then deletes
   * the `accounts` row — the opposite order, so the lock buys a deadlock cycle (40P01,
   * surfacing as «save failed») in exchange. The bound in the meantime: the overshoot is small, the rows stay readable and playable,
   * and the account reports frozen until a deletion brings it back under the cap — the same
   * state a downgrade produces, with the same way out. The other half of the reason is
   * structural: counts are fetched in the guard so that no write can hold permission
   * without also holding the limits, and locking would move them back into each write path.
   */
  const refused = editor.entitlements.refused.createSongbook
  if (refused !== null) {
    return { ok: false, reason: refused, limit: limitFacts(editor.entitlements.limits, refused) }
  }

  const trimmed = name.trim()
  if (trimmed === '') return { ok: false, reason: 'invalid-name' }

  try {
    return await db().transaction(async (tx) => {
      // Global, deliberately: slugs are unique across every account, not just this one —
      // see `songbooks`' own comment in `db/schema.ts` on why (static generation has no
      // account to disambiguate a route by).
      const existing = await tx.select({ slug: songbooks.slug }).from(songbooks)

      // The slug is generated once, here, and never changes again.
      const slug = uniqueSlug(
        trimmed,
        existing.map((row) => row.slug),
      )

      const last = await tx
        .select({ position: max(songbooks.position) })
        .from(songbooks)
        .where(eq(songbooks.accountId, accountIdOf(editor.accountOwnerEmail)))

      const [created] = await tx
        .insert(songbooks)
        .values({
          slug,
          name: trimmed,
          accountId: accountIdOf(editor.accountOwnerEmail),
          position: (last[0]?.position ?? 0) + 1,
        })
        .returning({ id: songbooks.id })
      await tx
        .insert(sections)
        .values({ songbookId: created.id, name: DEFAULT_SECTION, position: 1 })

      return { ok: true, slug } as CreateResult
    })
  } catch (error) {
    console.error('createSongbook failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Adds the "Example songbook" — a fixed set of public-domain songs (`sample.ts`) —
 * to the reader's own, currently empty account.
 *
 * Every new account is seeded with this same songbook at sign-in now
 * (`provisionAccount`), which leaves this action a second, narrower job rather than
 * no job: it is how an account that emptied itself out later gets the songbook back,
 * and how one whose seeding failed — a write allowed to fail on its own — takes it
 * on demand. Same rows either way; `insertSampleSongbook` is shared so the two can
 * never drift.
 *
 * Offered only while the account holds no songbook at all, checked here rather
 * than trusted from the button being shown: with zero songbooks there are zero
 * songs (`songs.songbook_slug` is a `not null` foreign key onto `songbooks`, so a
 * song cannot exist without one), which is what lets the trim use the plan's song
 * cap directly as "how many of these still fit" — no separate capacity query, no
 * concept `entitlementsOf` does not already have. That precondition is exactly what
 * a real account can lose between the button rendering and this running (a second
 * tab, a double click), so it is re-checked here rather than only in the UI.
 *
 * Deliberately does **not** follow `copySongbook`'s "check for one more, accept
 * the overshoot" shape below: that gap is about copying a source songbook of
 * unknown size chosen by an admin, where "how many more fit" cannot be answered
 * in general. Here the source is a fixed asset — nine songs — so trimming it to the
 * real remaining capacity costs nothing and honours the plan exactly, rather than
 * freezing an account on the very first thing it does.
 */
export async function addSampleSongbook(): Promise<CreateResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  const editor = await asEditor()
  if (!editor.ok) return { ok: false, reason: editor.reason }

  const already = await db()
    .select({ slug: songbooks.slug })
    .from(songbooks)
    .where(eq(songbooks.accountId, accountIdOf(editor.accountOwnerEmail)))
    .limit(1)
  if (already.length > 0) return { ok: false, reason: 'account-not-empty' }

  const refused = editor.entitlements.refused.createSongbook ?? editor.entitlements.refused.createSong
  if (refused !== null) {
    return { ok: false, reason: refused, limit: limitFacts(editor.entitlements.limits, refused) }
  }

  try {
    // The rows themselves are `insertSampleSongbook`'s, shared with the copy made at
    // sign-in (`provisionAccount`) so the two can never drift into different songbooks.
    const slug = await insertSampleSongbook(
      editor.accountOwnerEmail,
      editor.entitlements.limits.songs,
    )
    return { ok: true, slug }
  } catch (error) {
    console.error('addSampleSongbook failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/** Renames without touching the slug, so nothing that points at it moves. */
export async function renameSongbook(slug: string, name: string): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const trimmed = name.trim()
  if (trimmed === '') return { ok: false, reason: 'invalid-name' }

  const target = await editableSongbook(slug)
  if (!target.ok) return target

  /*
   * A rename is a change to the repertoire, so it is closed while the account is frozen —
   * the freeze is «only deletions until it fits again», not «only deletions of songs».
   *
   * No `limit` here, and none at any other `editRepertoire` gate in this file or in
   * `sections/actions.ts`: this gate can only ever answer `frozen`, and being frozen is
   * being over *the caps* — possibly both at once — with a deletion as the remedy. There is
   * no single number that would help, and quoting one would read as «buy more», which is
   * the one thing that does not unfreeze an account. Same for `plan-required`, which counts
   * nothing at all. See `limitFacts`, which returns `undefined` for exactly these two.
   */
  if (target.entitlements.refused.editRepertoire !== null) {
    return { ok: false, reason: target.entitlements.refused.editRepertoire }
  }

  try {
    const updated = await db()
      .update(songbooks)
      .set({ name: trimmed, updatedAt: new Date() })
      .where(eq(songbooks.slug, slug))
      .returning({ slug: songbooks.slug })

    return updated.length === 0 ? { ok: false, reason: 'not-found' } : { ok: true }
  } catch (error) {
    console.error('renameSongbook failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Writes the order of the reader's own songbooks — the one screen that lists every
 * one of them, the same reasoning `arrangeSongbook` (`lib/sections/actions.ts`) gives
 * for a songbook's own sections.
 *
 * One staleness check: refuses unless the slugs sent are exactly the songbooks this
 * account holds, so a songbook created or removed elsewhere while this list was open
 * can never be numbered wrong or silently dropped.
 */
export async function arrangeSongbooks(slugs: string[]): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  const editor = await asEditor()
  if (!editor.ok) return { ok: false, reason: editor.reason }

  // Reordering is one of the changes the freeze closes, by the brief's own list.
  if (editor.entitlements.refused.editRepertoire !== null) {
    return { ok: false, reason: editor.entitlements.refused.editRepertoire }
  }

  try {
    return await db().transaction(async (tx) => {
      const held = await tx
        .select({ slug: songbooks.slug })
        .from(songbooks)
        .where(eq(songbooks.accountId, accountIdOf(editor.accountOwnerEmail)))

      if (!sameMembers(held.map((row) => row.slug), slugs)) {
        return { ok: false, reason: 'stale' } as WriteResult
      }

      for (const [index, slug] of slugs.entries()) {
        await tx
          .update(songbooks)
          .set({ position: index + 1 })
          .where(eq(songbooks.slug, slug))
      }

      return { ok: true } as WriteResult
    })
  } catch (error) {
    console.error('arrangeSongbooks failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Sends one song to a section — of this songbook or of another one.
 *
 * The songbook is not a parameter: it is read from the section, so the two columns
 * cannot be set to disagree. The composite foreign key would refuse the row anyway,
 * which is the point of it, but refusing here means the caller gets `not-found`
 * instead of a constraint violation.
 */
export async function moveSong(songSlug: string, sectionId: number): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const songOwner = await songAccountOf(songSlug)
  if (songOwner === null) return { ok: false, reason: 'not-found' }
  const editor = await accessTo(songOwner)
  if (editor === null || !canEdit(editor.role)) {
    return { ok: false, reason: 'not-found' }
  }

  /*
   * Resolved by hand, because this path never goes through `permit` or `editableSongbook`:
   * it authorizes with `accessTo` + `canEdit` inline, so 'the guards carry entitlements'
   * does not reach it. For the **song's** account, like the access check right above —
   * these rows belong to whoever owns the song, not to whoever is moving it. Moving a song
   * is reordering, which the freeze closes.
   */
  const entitlements = await entitlementsOf(songOwner)
  if (entitlements.refused.editRepertoire !== null) {
    return { ok: false, reason: entitlements.refused.editRepertoire }
  }

  try {
    const database = db()

    const destination = await database
      .select({ songbookId: sections.songbookId, accountOwnerEmail: accounts.ownerEmail })
      .from(sections)
      .innerJoin(songbooks, eq(sections.songbookId, songbooks.id))
      .innerJoin(accounts, eq(songbooks.accountId, accounts.id))
      .where(eq(sections.id, sectionId))
      .limit(1)

    if (destination.length === 0) return { ok: false, reason: 'not-found' }
    // A song may only move within its own account's songbooks — the destination section
    // has to be one of theirs too, not merely any section that happens to exist.
    if (destination[0].accountOwnerEmail !== songOwner) return { ok: false, reason: 'not-found' }

    const updated = await database
      .update(songs)
      // Unplaced in its new section, so it arrives at the end: the number it held
      // was a place among other songs, and those are not these songs.
      .set({
        songbookId: destination[0].songbookId,
        sectionId,
        position: null,
        updatedAt: sql`now()`,
      })
      .where(eq(songs.slug, songSlug))
      .returning({ slug: songs.slug })

    return updated.length === 0 ? { ok: false, reason: 'not-found' } : { ok: true }
  } catch (error) {
    console.error('moveSong failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Removes a songbook, moving its songs first when a destination is given.
 *
 * Refuses outright if it still holds songs and no destination was named. The
 * database would refuse anyway — the foreign key is `on delete restrict` — but
 * checking here is what lets the UI explain the situation and offer the move
 * instead of surfacing a constraint violation.
 *
 * **Its sections travel with it.** Removing «Natale 2024» into «Feste» makes «Messa»
 * and «Cena» sections of «Feste», at the end, with their songs in the order they were
 * in — the division is not lost, and nothing has to be rearranged by hand afterwards.
 * A section whose name is already taken over there hands its songs to that one instead
 * of arriving as a twin, which is also the only thing the unique constraint allows.
 *
 * The songs themselves are barely touched: moving a section carries them, because the
 * composite key cascades on update, and their `position` is already relative to the
 * section they are in.
 */
export async function removeSongbook(
  slug: string,
  moveTo: string | null,
): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  if (moveTo === slug) return { ok: false, reason: 'invalid-name' }

  const target = await editableSongbook(slug)
  if (!target.ok) return target

  /*
   * No entitlement check, deliberately, even though `target` now carries one: this is a
   * deletion, and a frozen account's way back under its caps is exactly this. It updates
   * songs on the way out — sections change songbook, songs change section — so a freeze
   * implemented as "no writes but DELETE" would close the tidiest route out of the freeze.
   * The rule is about how much the repertoire holds, and this strictly shrinks it.
   */

  try {
    const database = db()

    return await database.transaction(async (tx) => {
      const held = await tx
        .select({ slug: songs.slug })
        .from(songs)
        .where(eq(songs.songbookId, songbookIdOf(slug)))

      const mine = await tx
        .select({ id: sections.id, name: sections.name, position: sections.position })
        .from(sections)
        .where(eq(sections.songbookId, songbookIdOf(slug)))
        .orderBy(asc(sections.position))

      if (held.length > 0) {
        if (moveTo === null) return { ok: false, reason: 'not-empty' } as WriteResult

        const destination = await tx
          .select({ id: songbooks.id, accountOwnerEmail: accounts.ownerEmail })
          .from(songbooks)
          .innerJoin(accounts, eq(songbooks.accountId, accounts.id))
          .where(eq(songbooks.slug, moveTo))
          .limit(1)

        // Merging into a songbook of a different account would hand that account's
        // songs to this one's — refused the same way a songbook nobody owns here is.
        if (destination.length === 0 || destination[0].accountOwnerEmail !== target.accountOwnerEmail) {
          return { ok: false, reason: 'not-found' } as WriteResult
        }

        const theirs = await tx
          .select({ id: sections.id, name: sections.name })
          .from(sections)
          .where(eq(sections.songbookId, destination[0].id))

        const idByName = new Map(theirs.map((row) => [row.name, row.id]))
        const last = await tx
          .select({ position: max(sections.position) })
          .from(sections)
          .where(eq(sections.songbookId, destination[0].id))

        let next = (last[0]?.position ?? 0) + 1

        for (const section of mine) {
          const twin = idByName.get(section.name)

          if (twin === undefined) {
            // Nothing of that name over there: the section itself moves, songs and all.
            await tx
              .update(sections)
              .set({ songbookId: destination[0].id, position: next })
              .where(eq(sections.id, section.id))
            next += 1

            /*
             * The songs came along without being written — the composite key cascades —
             * so they are stamped here on purpose. **Stamping follows the songbook,
             * not the section**: a song that changed songbook is on a different page
             * now and belongs in the publish list, which is the same line the existing
             * code drew between moving a song and merely reordering one.
             */
            await tx
              .update(songs)
              .set({ updatedAt: sql`now()` })
              .where(eq(songs.sectionId, section.id))
            continue
          }

          /*
           * A section of that name already exists there, so these songs join it —
           * unplaced, at the end, exactly as a single moved song arrives. The now empty
           * section is deleted below with the rest.
           */
          await tx
            .update(songs)
            .set({
              songbookId: destination[0].id,
              sectionId: twin,
              position: null,
              updatedAt: sql`now()`,
            })
            .where(eq(songs.sectionId, section.id))
        }
      }

      /*
       * Whatever is left of this songbook's sections is empty by now — either it never
       * held songs, or they were handed to a section of the same name over there. Empty
       * sections are the songbook's own, so they go with it.
       */
      const leftovers = await tx
        .select({ id: sections.id })
        .from(sections)
        .where(eq(sections.songbookId, songbookIdOf(slug)))

      if (leftovers.length > 0) {
        await tx.delete(sections).where(
          inArray(
            sections.id,
            leftovers.map((row) => row.id),
          ),
        )
      }

      const removed = await tx
        .delete(songbooks)
        .where(eq(songbooks.slug, slug))
        .returning({ slug: songbooks.slug })

      return (removed.length === 0
        ? { ok: false, reason: 'not-found' }
        : { ok: true }) as WriteResult
    })
  } catch (error) {
    console.error('removeSongbook failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Deletes a songbook outright — itself, its sections, and every song any of them held.
 * Nothing moves anywhere first.
 *
 * `removeSongbook` above always insists on somewhere for the songs to go, which is right
 * for tidying a repertoire up but leaves no way through for someone who wants none of
 * these songs kept at all: today that reader's only option is to invent a decoy songbook
 * just to satisfy `on delete restrict`. This is that door instead. The deletion order is
 * the same the `restrict` foreign keys already force on `removeAccountAndContent`
 * (`accounts/actions.ts`, the same cascade for a whole account) — songs, then sections,
 * then the songbook itself — just scoped to one songbook rather than every one an account
 * owns.
 */
export async function purgeSongbook(slug: string): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const target = await editableSongbook(slug)
  if (!target.ok) return target

  // Ungated on purpose, like `removeSongbook` above: a deletion is what unfreezes an
  // account, so it can never be the thing the freeze refuses.

  try {
    const result = await db().transaction(async (tx) => {
      const deletedSongs = await tx
        .delete(songs)
        .where(eq(songs.songbookId, songbookIdOf(slug)))
        .returning({ slug: songs.slug })
      await tx.delete(sections).where(eq(sections.songbookId, songbookIdOf(slug)))

      const removed = await tx
        .delete(songbooks)
        .where(eq(songbooks.slug, slug))
        .returning({ slug: songbooks.slug })

      return {
        write: (removed.length === 0
          ? { ok: false, reason: 'not-found' }
          : { ok: true }) as WriteResult,
        deletedSlugs: deletedSongs.map((row) => row.slug),
      }
    })

    if (result.write.ok) revalidateSongbook(slug, result.deletedSlugs)
    return result.write
  } catch (error) {
    console.error('purgeSongbook failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Copies a songbook — its sections and every song in them — into another account,
 * leaving the original exactly as it was.
 *
 * Authorized with `isOwner` directly, the same way `deleteAccount` and
 * `listAllAccounts` are (`lib/accounts/`), and for the same reason: every account's own
 * owner is already the one editor it can have (v3.1), so "only the owner may copy a
 * songbook elsewhere" would restrict nothing at all if it meant that owner — the only
 * reading that draws an actual line is the installation's global owner, who alone may
 * reach across two accounts at once.
 *
 * Slugs stay globally unique, songbook and song alike (see `songbooks`' and `songs`' own
 * comments in `db/schema.ts` on why `/songs/[slug]` and `/songbooks/[slug]` need that), so
 * the copy mints its own: `uniqueSlug` at both levels, and an old-section-id →
 * new-section-id map, since a section's id is a surrogate a copy cannot reuse. This is the
 * clone `provisionAccount` used to do for every new account's Example songbook. That is
 * still gone as such — provisioning seeds the fixed set in `sample.ts` now, not this
 * flagged row — so this remains the only way one *arbitrary* songbook ever becomes a
 * second one elsewhere, which is what the `isExampleTemplate` row is kept for.
 * `addSampleSongbook`, below the plain `createSongbook` above, is a narrower cousin of
 * this same idea: it always copies the same fixed, small set of songs (never an admin's
 * choice of source), so it can be self-service rather than an `isOwner` power.
 *
 * Gated by the **destination's** plan, not the caller's, like every other write into an
 * account: a global owner gets the plan of the account they are operating in, because the
 * rows are that customer's. Half of that question is answerable and half is not, and the
 * two are treated differently on purpose. Answerable: whether the destination may hold one
 * more songbook at all — `refused.createSongbook` is exactly "frozen, or already at the
 * songbook cap", and it is the same check `createSongbook` makes above; `refused.createSong`
 * likewise refuses a copy into an account with no room for even one more song. Unanswerable:
 * whether the *M* songs being copied fit, since `Entitlements` answers "one more" and never
 * "M more" — so a copy into an account with room for one song and forty arriving still
 * overshoots, and that account then freezes to deletions until it fits again, like any other
 * overage. What the check buys is that the overshoot can no longer start from an account
 * that was already full or already frozen, which is the case where the owner's helpful
 * gesture was the whole cause of the freeze.
 */
export async function copySongbook(
  sourceSlug: string,
  targetAccountOwnerEmail: string,
): Promise<CreateResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'not-allowed' }
  }

  const target = normalizeEmail(targetAccountOwnerEmail)

  /*
   * Resolved before the transaction opens — before, and not merely for tidiness: the pool is
   * `max: 1` (`db/client.ts`), so a `db()` query issued from inside a transaction callback
   * queues for the one connection that transaction is holding and hangs forever rather than
   * failing. `entitlementsOf` queries, so it cannot be moved inside.
   *
   * The cost of asking here rather than after the destination row is confirmed below: a
   * mistyped address logs «entitlementsOf found no account row» and falls open, an instant
   * before the transaction answers `not-found` about that same address — and a target that
   * is the songbook's own account can now be told about its caps before it is told
   * `same-account`. A stray log line about an account nobody has, and a slightly less
   * precise message on two impossible-to-reach-by-accident inputs, are the cheaper side of
   * that trade: the other one hangs the request.
   */
  const entitlements = await entitlementsOf(target)
  const refused = entitlements.refused.createSongbook ?? entitlements.refused.createSong
  if (refused !== null) return { ok: false, reason: refused, limit: limitFacts(entitlements.limits, refused) }

  try {
    return await db().transaction(async (tx) => {
      const source = await tx
        .select({
          id: songbooks.id,
          slug: songbooks.slug,
          name: songbooks.name,
          accountOwnerEmail: accounts.ownerEmail,
        })
        .from(songbooks)
        .innerJoin(accounts, eq(songbooks.accountId, accounts.id))
        .where(eq(songbooks.slug, sourceSlug))
        .limit(1)
      if (source.length === 0) return { ok: false, reason: 'not-found' } as CreateResult

      // Copying into the songbook's own account is a duplicate, not a copy "elsewhere" —
      // the one thing this action is for — so it is refused rather than quietly allowed.
      if (source[0].accountOwnerEmail === target) {
        return { ok: false, reason: 'same-account' } as CreateResult
      }

      const destination = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.ownerEmail, target))
        .limit(1)
      if (destination.length === 0) return { ok: false, reason: 'not-found' } as CreateResult

      const takenSongbookSlugs = (await tx.select({ slug: songbooks.slug }).from(songbooks)).map(
        (row) => row.slug,
      )
      const copiedSlug = uniqueSlug(source[0].slug, takenSongbookSlugs)

      const last = await tx
        .select({ position: max(songbooks.position) })
        .from(songbooks)
        .where(eq(songbooks.accountId, destination[0].id))

      const [copiedSongbook] = await tx.insert(songbooks).values({
        accountId: destination[0].id,
        slug: copiedSlug,
        name: source[0].name,
        // Never the clone flag: the partial unique index allows exactly one across the
        // whole installation, and copying the Example songbook itself must not collide
        // with the row that already carries it.
        isExampleTemplate: false,
        // Appended after whatever the destination account already has, same as a
        // songbook created there by hand would be.
        position: (last[0]?.position ?? 0) + 1,
      }).returning({ id: songbooks.id })

      const sourceSections = await tx
        .select()
        .from(sections)
        .where(eq(sections.songbookId, source[0].id))

      const sectionIdMap = new Map<number, number>()
      for (const section of sourceSections) {
        const [copied] = await tx
          .insert(sections)
          .values({ songbookId: copiedSongbook.id, name: section.name, position: section.position })
          .returning({ id: sections.id })
        sectionIdMap.set(section.id, copied.id)
      }

      const sourceSongs = await tx.select().from(songs).where(eq(songs.songbookId, source[0].id))
      const takenSongSlugs = new Set(
        (await tx.select({ slug: songs.slug }).from(songs)).map((row) => row.slug),
      )

      for (const song of sourceSongs) {
        const newSectionId = sectionIdMap.get(song.sectionId)
        // Would mean a song pointed at a section outside its own songbook, which the
        // composite foreign key on `songs` already makes impossible.
        if (newSectionId === undefined) continue

        const copiedSongSlug = uniqueSlug(song.slug, takenSongSlugs)
        takenSongSlugs.add(copiedSongSlug)

        await tx.insert(songs).values({
          slug: copiedSongSlug,
          title: song.title,
          artist: song.artist,
          tags: song.tags,
          link1: song.link1,
          link2: song.link2,
          link3: song.link3,
          body: song.body,
          songbookId: copiedSongbook.id,
          sectionId: newSectionId,
          position: song.position,
        })
      }

      return { ok: true, slug: copiedSlug } as CreateResult
    })
  } catch (error) {
    console.error('copySongbook failed', error)
    return { ok: false, reason: 'failed' }
  }
}
