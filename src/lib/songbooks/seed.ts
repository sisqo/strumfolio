/**
 * Writing the example songbook into an account.
 *
 * A plain module, not `'use server'`, because it has two callers that reach it from
 * opposite directions: `addSampleSongbook` (a server action, answering a reader who
 * asked for it) and `provisionAccount` (sign-in, before there is any session to ask).
 * Both insert exactly the same rows; only the permission question differs, and that
 * stays with each caller rather than being asked twice here.
 *
 * It opens its own transaction rather than joining one. Neither caller has anything
 * else to be atomic with — and provisioning specifically must *not* share one, since a
 * songbook that fails to insert must never take the account row down with it (see
 * `provisionAccount`).
 */

import { DEFAULT_SECTION } from '@/lib/data/types'
import { db } from '@/lib/db/client'
import { accountIdOf } from '@/lib/db/ids'
import { songbooks, sections, songs } from '@/lib/db/schema'
import { uniqueSlug } from '@/lib/slug'

import { SAMPLE_SONGBOOK_NAME, sampleSongs } from './sample'

/**
 * Inserts the example songbook, its sections and its songs for `ownerEmail`, and
 * answers with the slug it settled on.
 *
 * `songCap` is the plan's song limit, or null for unlimited: the source is a fixed
 * asset of nine short songs, so trimming it to what actually fits costs nothing and
 * honours the plan exactly — rather than freezing an account on songs it was handed
 * before it had done anything.
 *
 * `position` is 1 because both callers only reach here for an account that holds no
 * songbook at all; each checks that in the way that suits it.
 */
export async function insertSampleSongbook(
  ownerEmail: string,
  songCap: number | null,
): Promise<string> {
  const selected = sampleSongs().slice(0, songCap ?? undefined)

  return await db().transaction(async (tx) => {
    const takenSongbookSlugs = (await tx.select({ slug: songbooks.slug }).from(songbooks)).map(
      (row) => row.slug,
    )
    const slug = uniqueSlug(SAMPLE_SONGBOOK_NAME, takenSongbookSlugs)

    /* `returning` rather than looking the id back up: the rows below need it, and inside one
       transaction the insert already knows it. */
    const [songbook] = await tx
      .insert(songbooks)
      .values({
        slug,
        name: SAMPLE_SONGBOOK_NAME,
        accountId: accountIdOf(ownerEmail),
        position: 1,
      })
      .returning({ id: songbooks.id })

    const sectionIdByName = new Map<string, number>()
    const takenSongSlugs = new Set(
      (await tx.select({ slug: songs.slug }).from(songs)).map((row) => row.slug),
    )

    for (const song of selected) {
      const sectionName = song.sectionName ?? DEFAULT_SECTION
      let sectionId = sectionIdByName.get(sectionName)
      if (sectionId === undefined) {
        const [inserted] = await tx
          .insert(sections)
          .values({ songbookId: songbook.id, name: sectionName, position: sectionIdByName.size + 1 })
          .returning({ id: sections.id })
        sectionId = inserted.id
        sectionIdByName.set(sectionName, sectionId)
      }

      const songSlug = uniqueSlug(song.title, takenSongSlugs)
      takenSongSlugs.add(songSlug)

      await tx.insert(songs).values({
        slug: songSlug,
        title: song.title,
        artist: song.artist,
        tags: song.tags,
        body: song.body,
        songbookId: songbook.id,
        sectionId,
        // Unplaced, like any freshly imported song: it sorts alphabetically among its
        // section-mates rather than claiming an order nobody chose.
        position: null,
      })
    }

    return slug
  })
}
