'use server'

/**
 * Server actions for the sections of a songbook: the divisions, and what is in them.
 *
 * Same rules as the songbooks next door — an **editor** for every write, no offline
 * queue, shared structure so last-write-wins between two devices is not acceptable —
 * and one addition of its own: `arrangeSongbook`, which writes a whole songbook's
 * layout at once rather than patching the rows that moved.
 */

import { and, asc, eq, max } from 'drizzle-orm'

import { editableSection, editableSongbook } from '@/lib/songbooks/access'
import { type ArrangedSection, sameMembers } from '@/lib/songbooks/order'
import type { CreateSectionResult, WriteResult } from '@/lib/songbooks/types'
import { db, hasDatabase } from '@/lib/db/client'
import { songbookIdOf } from '@/lib/db/ids'
import { sections, songs } from '@/lib/db/schema'
import { revalidateSongbook } from '@/lib/revalidate'

/** Postgres' code for a unique violation, which on this table can only be the name. */
const DUPLICATE = '23505'

/**
 * Whether a failure is a name already taken.
 *
 * It walks the cause chain rather than reading `error.code`, because that is where the
 * code actually is: drizzle wraps the driver's error in one of its own — «Failed query:
 * insert into "sections"…» — and hangs the original off `cause`. Found by causing a real
 * duplicate and reading what came out, not by assuming: without the walk, typing a name
 * that already exists answered «save failed», which tells somebody nothing they can
 * act on.
 */
function isDuplicate(error: unknown): boolean {
  let step: unknown = error

  for (let depth = 0; step !== null && step !== undefined && depth < 5; depth += 1) {
    if (typeof step === 'object' && 'code' in step && step.code === DUPLICATE) return true
    step = (step as { cause?: unknown }).cause
  }

  return false
}

/**
 * A new section at the end of its songbook.
 *
 * Refused while the account is frozen and never for a cap, because the plan matrix has no
 * section cap at all — sections are the free structure inside a songbook, and nothing in
 * the decided table counts them. A later reader must not add one here on the assumption
 * that it was forgotten.
 */
export async function createSection(
  songbookSlug: string,
  name: string,
): Promise<CreateSectionResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const trimmed = name.trim()
  if (trimmed === '') return { ok: false, reason: 'invalid-name' }

  const target = await editableSongbook(songbookSlug)
  if (!target.ok) return target

  if (target.entitlements.refused.editRepertoire !== null) {
    return { ok: false, reason: target.entitlements.refused.editRepertoire }
  }

  try {
    return await db().transaction(async (tx) => {
      const last = await tx
        .select({ position: max(sections.position) })
        .from(sections)
        .where(eq(sections.songbookId, songbookIdOf(songbookSlug)))

      const created = await tx
        .insert(sections)
        .values({
          songbookId: songbookIdOf(songbookSlug),
          name: trimmed,
          position: (last[0]?.position ?? 0) + 1,
        })
        .returning({ id: sections.id })

      return { ok: true, id: created[0].id } as CreateSectionResult
    })
  } catch (error) {
    if (isDuplicate(error)) return { ok: false, reason: 'duplicate-name' }
    console.error('createSection failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Renames a section. Free, like renaming a songbook, and for a stronger reason:
 * a section is keyed by a number, so its name is not an address at all.
 */
export async function renameSection(id: number, name: string): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const trimmed = name.trim()
  if (trimmed === '') return { ok: false, reason: 'invalid-name' }

  const target = await editableSection(id)
  if (!target.ok) return target

  // Renaming is a change to the repertoire's shape, so the freeze closes it — same as
  // renaming a songbook next door.
  if (target.entitlements.refused.editRepertoire !== null) {
    return { ok: false, reason: target.entitlements.refused.editRepertoire }
  }

  try {
    const updated = await db()
      .update(sections)
      .set({ name: trimmed })
      .where(eq(sections.id, id))
      .returning({ id: sections.id })

    return updated.length === 0 ? { ok: false, reason: 'not-found' } : { ok: true }
  } catch (error) {
    if (isDuplicate(error)) return { ok: false, reason: 'duplicate-name' }
    console.error('renameSection failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Removes a section, moving its songs first when a destination is given.
 *
 * The same shape as removing a songbook, and the same reason: nothing here destroys
 * anything quietly. A section holding songs with no destination named answers
 * `not-empty` so the screen can ask where they should go; the database would refuse it
 * regardless, since the composite key is `on delete restrict`.
 *
 * The destination has to be a section of the same songbook. Elsewhere would be a move
 * between songbooks disguised as a tidy-up — that is `moveSong`, one song at a time,
 * where the person can see what they are doing.
 */
export async function removeSection(id: number, moveTo: number | null): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  if (moveTo === id) return { ok: false, reason: 'invalid-name' }

  const target = await editableSection(id)
  if (!target.ok) return target
  const songbookSlug = target.songbookSlug

  /*
   * Ungated on purpose: a deletion is how a frozen account gets back under its caps, so
   * the freeze can never be what refuses one. This one moves songs on the way out, which
   * is why it has to be said rather than left to be inferred from "it only deletes".
   */

  try {
    return await db().transaction(async (tx) => {
      const held = await tx.select({ slug: songs.slug }).from(songs).where(eq(songs.sectionId, id))

      if (held.length > 0) {
        if (moveTo === null) return { ok: false, reason: 'not-empty' } as WriteResult

        const destination = await tx
          .select({ id: sections.id })
          .from(sections)
          .where(
            and(eq(sections.id, moveTo), eq(sections.songbookId, songbookIdOf(songbookSlug))),
          )
          .limit(1)

        if (destination.length === 0) return { ok: false, reason: 'not-found' } as WriteResult

        /*
         * Unplaced where they land, so they queue at the end of the destination. No
         * timestamp: they stay in the same songbook, so no page they were on stops
         * listing them — see the rule in `removeSongbook`.
         */
        await tx
          .update(songs)
          .set({ sectionId: moveTo, position: null })
          .where(eq(songs.sectionId, id))
      }

      await tx.delete(sections).where(eq(sections.id, id))

      // 1..N again, so a removal never leaves a gap in the order of the divisions.
      const rest = await tx
        .select({ id: sections.id })
        .from(sections)
        .where(eq(sections.songbookId, songbookIdOf(songbookSlug)))
        .orderBy(asc(sections.position))

      for (const [index, section] of rest.entries()) {
        await tx
          .update(sections)
          .set({ position: index + 1 })
          .where(eq(sections.id, section.id))
      }

      return { ok: true } as WriteResult
    })
  } catch (error) {
    console.error('removeSection failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Deletes a section outright — itself and every song inside it — with nothing moved
 * anywhere first. The songbook itself, and its other sections, are untouched.
 *
 * `removeSection` above always asks where its songs should go, and that question has no
 * answer for a songbook with only one section, or for a reader who wants none of these
 * songs kept at all: today that leaves "create another section first" as the only way
 * through, purely to satisfy a database constraint nobody asked to work around. This is
 * that door instead, and unlike `removeSection` it does not refuse to take the last
 * section a songbook has — an empty songbook is already a reachable state (see
 * `SongbookSongs`'s own comment on why), and there is nothing more special about reaching
 * it by deleting a full section than an empty one.
 */
export async function purgeSection(id: number): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const target = await editableSection(id)
  if (!target.ok) return target
  const songbookSlug = target.songbookSlug

  // Ungated, like `removeSection` above and for the same reason.

  try {
    const deletedSlugs = await db().transaction(async (tx) => {
      const deleted = await tx
        .delete(songs)
        .where(eq(songs.sectionId, id))
        .returning({ slug: songs.slug })
      await tx.delete(sections).where(eq(sections.id, id))

      // 1..N again, so a removal never leaves a gap in the order of the divisions.
      const rest = await tx
        .select({ id: sections.id })
        .from(sections)
        .where(eq(sections.songbookId, songbookIdOf(songbookSlug)))
        .orderBy(asc(sections.position))

      for (const [index, section] of rest.entries()) {
        await tx
          .update(sections)
          .set({ position: index + 1 })
          .where(eq(sections.id, section.id))
      }

      return deleted.map((row) => row.slug)
    })

    revalidateSongbook(songbookSlug, deletedSlugs)
    return { ok: true }
  } catch (error) {
    console.error('purgeSection failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Writes a whole songbook's layout: the order of its sections, the order of the songs
 * inside each, and which section each song is in.
 *
 * All of it at once, and that is the design rather than convenience. A song dragged
 * across a section heading changes three things together — where it came from, where it
 * went, and which section it belongs to — and writing those with two calls would leave a
 * moment where the song is in neither place. A songbook is twenty-odd songs, so sending
 * the whole arrangement costs nothing, and in exchange:
 *
 * - **one transaction and one renumbering.** Sections 1..N, songs 1..N inside each, so
 *   gaps and ties stay impossible by construction rather than by care;
 * - **one staleness check, over both sets.** It refuses unless the sections and the songs
 *   named are exactly the ones the songbook holds. That is not defensiveness about a
 *   bad caller: it is the case where somebody imported a song, or removed a section,
 *   while these rows were open. Numbering what the browser remembers would file the
 *   newcomer nowhere;
 * - **no timestamps.** Arranging changes no song, it changes the shape of the set. The
 *   songs stay in the same songbook, so nothing they used to be listed on stops listing
 *   them; what the new arrangement does need is a rebuild, for the arrows inside each
 *   song, and that is what «Rebuild now» is for.
 *
 * An empty songbook is not a missing one: emptied of songs, or of sections, it answers
 * `stale` like every other "these are no longer its parts" case, because «this
 * songbook no longer exists» would send somebody looking for what is in front of them.
 */
export async function arrangeSongbook(
  songbookSlug: string,
  groups: ArrangedSection[],
): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const target = await editableSongbook(songbookSlug)
  if (!target.ok) return target

  // Arranging writes no new row and deletes none, but it is still a change to the
  // repertoire — the order songs are played in — which is on the freeze's own list.
  if (target.entitlements.refused.editRepertoire !== null) {
    return { ok: false, reason: target.entitlements.refused.editRepertoire }
  }

  try {
    return await db().transaction(async (tx) => {
      const held = await tx
        .select({ id: sections.id })
        .from(sections)
        .where(eq(sections.songbookId, songbookIdOf(songbookSlug)))

      const heldSongs = await tx
        .select({ slug: songs.slug })
        .from(songs)
        .where(eq(songs.songbookId, songbookIdOf(songbookSlug)))

      const bothMatch =
        sameMembers(
          held.map((row) => row.id),
          groups.map((group) => group.sectionId),
        ) &&
        sameMembers(
          heldSongs.map((row) => row.slug),
          groups.flatMap((group) => group.slugs),
        )

      if (!bothMatch) return { ok: false, reason: 'stale' } as WriteResult

      for (const [index, group] of groups.entries()) {
        await tx
          .update(sections)
          .set({ position: index + 1 })
          .where(eq(sections.id, group.sectionId))

        for (const [place, slug] of group.slugs.entries()) {
          await tx
            .update(songs)
            .set({ sectionId: group.sectionId, position: place + 1 })
            .where(eq(songs.slug, slug))
        }
      }

      return { ok: true } as WriteResult
    })
  } catch (error) {
    console.error('arrangeSongbook failed', error)
    return { ok: false, reason: 'failed' }
  }
}
