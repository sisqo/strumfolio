/**
 * Loads `content/` into Postgres. Run with `npm run seed`.
 *
 * **Insert-only.** The database owns songs now: they can be imported, edited and
 * deleted in the app, so this script may not update them (it would overwrite a
 * correction with the file's version) and may not prune them (rows without a file are
 * exactly the imported ones).
 *
 * What it is for instead: the initial bootstrap, and restoring the manual export. Put
 * the downloaded `.chopro` files in `content/`, run this, and what is missing comes
 * back without touching what is there.
 *
 * The consequence to know: deleting a song in the app while its file still sits in
 * `content/` means this script reinserts it. That is correct for a command meaning
 * "load what is missing", but it is why the placeholder fixtures should leave the repo
 * once real repertoire arrives.
 *
 * Loads into **the first owner in `ALLOWED_EMAILS`'s account** (v3.0). `content/` has no
 * notion of accounts of its own — it is a single bootstrap fixture, same as it always
 * was — so this script has to pick one, and the first configured owner is the least
 * surprising choice: the person the deployment's environment already names first.
 */

import { loadEnv } from './load-env'

async function main() {
  loadEnv()

  const { readSongbookFiles, readSectionFiles, readSongFiles } = await import(
    '../src/lib/data/files'
  )
  const { DEFAULT_SECTION, UNFILED } = await import('../src/lib/data/types')
  const { parseAllowlist } = await import('../src/lib/allowlist')
  const { closeDatabase, db, hasDatabase } = await import('../src/lib/db/client')
  const { accounts, songbooks, sections, songs } = await import('../src/lib/db/schema')
  const { accountIdOf, songbookIdOf } = await import('../src/lib/db/ids')
  const { and, asc, eq } = await import('drizzle-orm')

  if (!hasDatabase) {
    console.error('DATABASE_URL is not set. Run `vercel env pull .env.local` first.')
    process.exit(1)
  }

  const [accountOwnerEmail] = parseAllowlist(process.env.ALLOWED_EMAILS)
  if (accountOwnerEmail === undefined) {
    console.error('ALLOWED_EMAILS has no owner to seed into.')
    process.exit(1)
  }

  const [songFiles, songbookFiles, sectionFiles] = await Promise.all([
    readSongFiles(),
    readSongbookFiles(),
    readSectionFiles(),
  ])

  /**
   * An empty `content/` is legitimate now: once the repertoire is imported and
   * the placeholder fixtures are removed, there is nothing left to bootstrap
   * from. Songs are no longer pruned, so there is nothing to guard against
   * either — only something worth saying out loud.
   */
  if (songFiles.length === 0) {
    console.log('No .chopro files in content/ — nothing to bootstrap.')
  }

  const database = db()

  await database.insert(accounts).values({ ownerEmail: accountOwnerEmail }).onConflictDoNothing()

  /**
   * Songbooks named by the files, plus the unfiled one, created if missing.
   *
   * `doNothing` on conflict, not an update: a songbook renamed in the app must
   * keep its new name. The directive only ever decides where a song is born.
   * And unlike songs, songbooks are never pruned — they can be created in the
   * app, so rows legitimately exist that no file ever declared.
   */
  const declared = [...songbookFiles, UNFILED]
  for (const [index, songbook] of declared.entries()) {
    await database
      .insert(songbooks)
      .values({
        slug: songbook.slug,
        name: songbook.name,
        accountId: accountIdOf(accountOwnerEmail),
        position: index + 1,
      })
      .onConflictDoNothing({ target: songbooks.slug })
  }
  console.log(`Songbooks present (created if missing): ${declared.length}`)

  /**
   * The sections named by the files, plus a «Songs» for the unfiled songbook.
   *
   * Matched **by name**, never by id: the ids in `sectionFiles` were invented by the file
   * repository for this run — see `data/files.ts` — and the database has its own. So the
   * name is the only thing the two sides can agree on, which is also why a section's name
   * is unique within its songbook.
   *
   * `doNothing` on conflict, for the same reason as the songbooks: a section renamed or
   * reordered in the app keeps what it was given. The position a file can claim is only
   * ever the position it would be born with.
   */
  const wanted = [
    ...sectionFiles.map((section) => ({
      songbookSlug: section.songbookSlug,
      name: section.name,
      position: section.position,
    })),
    { songbookSlug: UNFILED.slug, name: DEFAULT_SECTION, position: 1 },
  ]

  for (const section of wanted) {
    await database
      .insert(sections)
      .values({
        songbookId: songbookIdOf(section.songbookSlug),
        name: section.name,
        position: section.position,
      })
      .onConflictDoNothing({ target: [sections.songbookId, sections.name] })
  }
  console.log(`Sections present (created if missing): ${wanted.length}`)

  /**
   * Which section each song goes into, in the database's own numbering.
   *
   * A file's section is a name, so this is where that name becomes an id. A song whose
   * songbook has no section by that name — impossible from these files, possible from a
   * hand-edited one — lands in the first section of its songbook. Null only if that
   * songbook has no sections at all, which the loop above has just made impossible;
   * the caller says so out loud and skips the song rather than crashing a restore.
   */
  const sectionIdOf = async (song: (typeof songFiles)[number]): Promise<number | null> => {
    const name = sectionFiles.find((entry) => entry.id === song.sectionId)?.name

    if (name !== undefined) {
      const found = await database
        .select({ id: sections.id })
        .from(sections)
        .where(
          and(eq(sections.songbookId, songbookIdOf(song.songbookSlug)), eq(sections.name, name)),
        )
        .limit(1)

      if (found.length > 0) return found[0].id
    }

    const first = await database
      .select({ id: sections.id })
      .from(sections)
      .where(eq(sections.songbookId, songbookIdOf(song.songbookSlug)))
      .orderBy(asc(sections.position))
      .limit(1)

    return first[0]?.id ?? null
  }

  /**
   * Insert-only. `doNothing` rather than `doUpdate`, because an existing row may
   * carry an edit made in the app, and the file's version is not more correct —
   * it is only older.
   *
   * Songs are deliberately not pruned either. Rows without a file are the imported
   * ones, and removing them here would delete exactly the material the app was given
   * the power to create.
   */
  let inserted = 0
  let skipped = 0
  for (const song of songFiles) {
    const sectionId = await sectionIdOf(song)
    if (sectionId === null) {
      console.warn(`Skipped ${song.slug}: ${song.songbookSlug} has no section to file it in.`)
      skipped += 1
      continue
    }

    const rows = await database
      .insert(songs)
      .values({
        slug: song.slug,
        title: song.title,
        artist: song.artist,
        tags: song.tags,
        link1: song.link1,
        link2: song.link2,
        link3: song.link3,
        songbookId: songbookIdOf(song.songbookSlug),
        sectionId,
        body: song.body,
      })
      .onConflictDoNothing({ target: songs.slug })
      .returning({ slug: songs.slug })

    inserted += rows.length
  }
  console.log(
    `Songs inserted: ${inserted} (${songFiles.length - inserted - skipped} already present` +
      `${skipped > 0 ? `, ${skipped} skipped` : ''})`,
  )

  await closeDatabase()
  console.log('\nSeed complete.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
