'use server'

/**
 * Server actions for import, editing, deletion and export.
 *
 * Every call needs an **editor** — on the song's own account, not merely on whichever
 * account the caller currently has open (v3.0): a direct edit reaches a song by slug, and
 * that song's account is the one to check against, the same reasoning `accessTo` and the
 * dynamic song/songbook pages already apply.
 *
 * Publishing is gone (v3.0): every page here is dynamic now, so a save is live the moment
 * it commits — there is no build for anything to wait for. What is offline is a separate
 * question, answered per reader by the sync in `lib/offline/sync.ts`, not by a deploy.
 */

import { and, asc, eq, isNull, max, or, sql } from 'drizzle-orm'

import { accessTo, asEditor } from '@/lib/auth/session'
import { reanchorSongComments } from '@/lib/comments/actions'
import { songAccountOf } from '@/lib/data/access'
import { placeAfter } from '@/lib/songbooks/order'
import { rowToSong } from '@/lib/data/db'
import { DEFAULT_SECTION, UNFILED, type Song } from '@/lib/data/types'
import { db, hasDatabase } from '@/lib/db/client'
import { accountIdOf } from '@/lib/db/ids'
import { songbooks, sections, songs } from '@/lib/db/schema'
import type { Entitlements } from '@/lib/plans/entitlements'
import { countRepertoire, entitlementsOf } from '@/lib/plans/resolve'
import { limitFacts, type LimitFacts } from '@/lib/plans/types'
import { revalidateSong } from '@/lib/revalidate'
import { canEdit } from '@/lib/roles'
import { uniqueSlug } from '@/lib/slug'

import {
  choproFilename,
  type ExportedFile,
  type ExportGranularity,
  type ExportRow,
  organizeExport,
  toChoproFile,
} from './export'
import type { Decision, DeleteResult, Headroom, SaveFailure, SaveResult, SongInput } from './types'

/**
 * The export answers **null** when refused rather than an empty list, and the difference
 * is the same one `listMembers` and `loadSongContent` make: an empty answer is a fact
 * about the repertoire, and a refusal is not an answer at all. Returning `[]` would hand
 * somebody a zip of nothing when their role had just been taken away with the page still
 * open.
 */

/**
 * Finds a section named `name` within the songbook with this id, or creates it at the end.
 *
 * Used to honour a paste's own `{division: ...}` in `resolveSection` below: two
 * songs from the same paste can both name a section that doesn't exist yet, so
 * this re-reads after a losing insert rather than risk two sections of the
 * same name racing each other into existence.
 */
async function findOrCreateSection(songbookId: number, name: string): Promise<number> {
  const database = db()
  const trimmed = name.trim()

  const existing = await database
    .select({ id: sections.id })
    .from(sections)
    .where(and(eq(sections.songbookId, songbookId), eq(sections.name, trimmed)))
    .limit(1)

  if (existing.length > 0) return existing[0].id

  const last = await database
    .select({ position: max(sections.position) })
    .from(sections)
    .where(eq(sections.songbookId, songbookId))

  const inserted = await database
    .insert(sections)
    .values({ songbookId, name: trimmed, position: (last[0]?.position ?? 0) + 1 })
    .onConflictDoNothing({ target: [sections.songbookId, sections.name] })
    .returning({ id: sections.id })

  if (inserted.length > 0) return inserted[0].id

  const retry = await database
    .select({ id: sections.id })
    .from(sections)
    .where(and(eq(sections.songbookId, songbookId), eq(sections.name, trimmed)))
    .limit(1)

  return retry[0].id
}

/**
 * A songbook and a section of it that certainly exist.
 *
 * Both columns are a foreign key — one composite, so they are checked *together* — and
 * an empty or unknown value would fail the insert and surface as a generic "could not
 * save" with nothing to act on. Answering with something real turns that into a song
 * that simply needs filing.
 *
 * The section decides when it is a real one, because it carries its songbook with it
 * and it is the more specific of the two answers: the editor's two menus cannot
 * disagree, since choosing a songbook repopulates the sections, so a pair that does
 * disagree is a stale form rather than a decision. Failing that: `sectionName` — a
 * paste's own `{division: ...}` — found or created within the songbook already settled
 * on (never a different one: `{songbook: ...}` is answered by `songbookSlug` above, not
 * by this function reaching for a different one); and only once neither an id nor a
 * name has answered it, the songbook asked for, or the unfiled one, and its first
 * section — created as «Brani» if it somehow has none, which is the same section the
 * migration and `createSongbook` make. An explicit `sectionId` is always a caller's own
 * decision and is tried first, ahead of `sectionName`, for exactly that reason.
 *
 * Everything here is scoped to `accountOwnerEmail` (v3.0), including the fallback: a
 * songbook slug named by a stale form that no longer belongs to this account is treated
 * the same as none being named at all, rather than filing the song under someone else's
 * songbook. The Unfiled songbook itself is found **by name** within the account, not by
 * `UNFILED.slug` — that constant is one fixed slug, and slugs are unique across every
 * account (see `songbooks`' own comment), so a second account's Unfiled songbook needs a
 * slug of its own, minted by `uniqueSlug` exactly like `copySongbook` mints one.
 *
 * Answers a result union rather than a pair, because one of the places it can land is a
 * refusal: the Unfiled songbook it mints below is a **new songbook**, and on a plan with a
 * songbook cap that is the write the cap is about. Gating only the outer `insert(songs)`
 * would leave a free account able to mint unlimited songbooks through the import screen,
 * one paste at a time, without ever pressing «new songbook». The reason returned is
 * `refused.createSongbook` — the songbook cap, not the song cap, because the songbook is
 * what actually blocked them and «your plan does not allow another song» would send them
 * looking in the wrong place.
 *
 * Only that one branch is gated. Finding a songbook that already exists, and finding or
 * creating a *section* inside it, stay open: the matrix has no section cap, and a frozen
 * account never reaches this function at all — both callers refuse before they call it.
 * What keeps the ungated section from leaking, since it is written outside any transaction
 * and nothing rolls it back, is the *order* both callers now keep: the song cap is asked
 * before this function is called, never after it (see `saveSong`'s twin block and
 * `createSong`), so a save that will be refused never gets this far to mint one.
 */
async function resolveSection(
  accountOwnerEmail: string,
  entitlements: Entitlements,
  songbookSlug: string,
  sectionId: number | null,
  sectionName?: string | null,
): Promise<
  | { ok: true; songbookSlug: string; songbookId: number; sectionId: number }
  /*
   * The refusal carries `limit` for the same reason `SaveRefusal` does, and here it is not
   * optional decoration: the cap this branch can hit is the *songbook* one, so the sentence
   * a reader sees for a refused paste is «goes up to 1 songbook» — the number their song
   * cap would have quoted is not the number that stopped them. Both callers must forward
   * it; a caller that drops it turns a hundred-row paste back into the capless line.
   */
  | { ok: false; reason: SaveFailure; limit?: LimitFacts }
> {
  const database = db()

  if (sectionId !== null) {
    const found = await database
      .select({ id: sections.id, songbookSlug: songbooks.slug, songbookId: songbooks.id })
      .from(sections)
      .innerJoin(songbooks, eq(sections.songbookId, songbooks.id))
      .where(
        and(eq(sections.id, sectionId), eq(songbooks.accountId, accountIdOf(accountOwnerEmail))),
      )
      .limit(1)

    if (found.length > 0) {
      return {
        ok: true,
        songbookSlug: found[0].songbookSlug,
        songbookId: found[0].songbookId,
        sectionId: found[0].id,
      }
    }
  }

  const wanted = songbookSlug.trim()
  /* Slug and id together from here on: the slug is what the caller revalidates a path with,
     the id is what the rows point at. */
  let book: { slug: string; id: number } | null = null

  if (wanted !== '') {
    const found = await database
      .select({ slug: songbooks.slug, id: songbooks.id })
      .from(songbooks)
      .where(
        and(eq(songbooks.slug, wanted), eq(songbooks.accountId, accountIdOf(accountOwnerEmail))),
      )
      .limit(1)

    if (found.length > 0) book = found[0]
  }

  if (book === null) {
    const unfiled = await database
      .select({ slug: songbooks.slug, id: songbooks.id })
      .from(songbooks)
      .where(
        and(
          eq(songbooks.name, UNFILED.name),
          eq(songbooks.accountId, accountIdOf(accountOwnerEmail)),
        ),
      )
      .limit(1)

    if (unfiled.length > 0) {
      book = unfiled[0]
    } else {
      /*
       * About to create a songbook. Refused *before* the insert rather than after: this
       * function runs outside the transaction its callers open (it uses `db()`, not their
       * `tx`), so nothing here would be rolled back by a refusal further down — an
       * «Unfiled» songbook and its section would simply stay behind with no song in them.
       */
      const refused = entitlements.refused.createSongbook
      if (refused !== null) return { ok: false, reason: refused, limit: limitFacts(entitlements.limits, refused) }

      const taken = (await database.select({ slug: songbooks.slug }).from(songbooks)).map((row) => row.slug)
      const fresh = uniqueSlug(UNFILED.name, taken)

      const last = await database
        .select({ position: max(songbooks.position) })
        .from(songbooks)
        .where(eq(songbooks.accountId, accountIdOf(accountOwnerEmail)))

      const [inserted] = await database
        .insert(songbooks)
        .values({
          slug: fresh,
          name: UNFILED.name,
          accountId: accountIdOf(accountOwnerEmail),
          position: (last[0]?.position ?? 0) + 1,
        })
        .returning({ id: songbooks.id })
      book = { slug: fresh, id: inserted.id }
    }
  }

  const declared = sectionName?.trim()
  if (declared) {
    return {
      ok: true,
      songbookSlug: book.slug,
      songbookId: book.id,
      sectionId: await findOrCreateSection(book.id, declared),
    }
  }

  const first = await database
    .select({ id: sections.id })
    .from(sections)
    .where(eq(sections.songbookId, book.id))
    .orderBy(asc(sections.position))
    .limit(1)

  if (first.length > 0) {
    return { ok: true, songbookSlug: book.slug, songbookId: book.id, sectionId: first[0].id }
  }

  const created = await database
    .insert(sections)
    .values({ songbookId: book.id, name: DEFAULT_SECTION, position: 1 })
    .returning({ id: sections.id })

  return { ok: true, songbookSlug: book.slug, songbookId: book.id, sectionId: created[0].id }
}

function saved(song: Song): SaveResult {
  revalidateSong(song.slug, song.songbookSlug)
  return { ok: true, song }
}

/**
 * Gives an arriving song the place after the ones already in its section.
 *
 * Without this, importing five songs would file them alphabetically the moment the
 * page reloaded, which is not what pasting them in an order means. The songs already
 * there may have to be numbered for that to be possible — see `placeAfter` — and
 * numbering them changes no song, so none of these updates touches `updated_at`:
 * they would otherwise all appear in the publish list with nothing new to publish.
 *
 * The section, not the songbook, since v2.3: `position` counts within one division,
 * so numbering a whole songbook here would number songs against songs they are not
 * ordered against.
 */
async function placeLast(
  tx: Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0],
  sectionId: number,
  slug: string,
): Promise<number> {
  const siblings = await tx
    .select({ slug: songs.slug, position: songs.position })
    .from(songs)
    .where(eq(songs.sectionId, sectionId))
    // Display order, which is the order the numbering must preserve.
    .orderBy(asc(songs.position), asc(songs.title))

  const writes = placeAfter(
    siblings.filter((row) => row.slug !== slug),
    [slug],
  )

  for (const write of writes) {
    if (write.slug === slug) continue
    await tx.update(songs).set({ position: write.position }).where(eq(songs.slug, write.slug))
  }

  return writes[writes.length - 1].position
}

/** Same title and artist, ignoring case and surrounding space. */
function sameSong(title: string, artist: string | null) {
  const normalisedTitle = sql`lower(trim(${songs.title})) = ${title.trim().toLowerCase()}`

  if (artist === null || artist.trim() === '') {
    return and(normalisedTitle, or(isNull(songs.artist), eq(songs.artist, '')))
  }
  return and(normalisedTitle, sql`lower(trim(coalesce(${songs.artist}, ''))) = ${artist.trim().toLowerCase()}`)
}

/**
 * Which account this save is against, and whether the caller may edit it.
 *
 * Two different questions depending on whether a song already exists: creating one is
 * always for the caller's **current** account (there is nothing else it could mean), but
 * editing one reaches it by slug, and that slug's own account is the one to check — the
 * same reasoning `accessTo` and the dynamic song pages already apply, so that a link to
 * someone else's song cannot be used to edit it merely by also being an editor somewhere.
 */
async function accountForSave(
  slug: string | undefined,
): Promise<
  | { ok: true; accountOwnerEmail: string; entitlements: Entitlements }
  | { ok: false; reason: SaveFailure }
> {
  if (slug === undefined) {
    const editor = await asEditor()
    return editor.ok
      ? { ok: true, accountOwnerEmail: editor.accountOwnerEmail, entitlements: editor.entitlements }
      : { ok: false, reason: editor.reason }
  }

  const owner = await songAccountOf(slug)
  if (owner === null) return { ok: false, reason: 'not-found' }

  const editor = await accessTo(owner)
  if (editor === null || !canEdit(editor.role)) {
    return { ok: false, reason: 'not-found' }
  }
  /*
   * Resolved by hand on this branch, because it never went through `permit`: an edit is
   * authorized with `accessTo` + `canEdit` on the *song's* account, and that same account
   * is whose plan governs — the rows about to be written are theirs. The creating branch
   * above takes them off the guard, which already resolved them for the current account.
   */
  return { ok: true, accountOwnerEmail: owner, entitlements: await entitlementsOf(owner) }
}

export async function saveSong(input: SongInput, decision?: Decision): Promise<SaveResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const target = await accountForSave(input.slug)
  if (!target.ok) return target
  const { accountOwnerEmail, entitlements } = target

  /*
   * The freeze, once, for every branch below — editing a song's words, replacing them, and
   * adding a new one are all changes to the repertoire. Checked here rather than three
   * times further down so that a frozen account never reaches `resolveSection`, which
   * writes outside any transaction: no «Unfiled» songbook is minted for a save that was
   * never going to be allowed. The cap on *adding* a song is a different question with a
   * different answer and is asked later, once it is known that a row is really being added.
   *
   * That later question is the one that attaches a `limit` to its refusal; this one cannot.
   * `frozen` is «over the caps, delete until it fits», with no one number to quote and no
   * upgrade that would help — see `limitFacts`, which answers `undefined` for it on purpose.
   */
  if (entitlements.refused.editRepertoire !== null) {
    return { ok: false, reason: entitlements.refused.editRepertoire }
  }

  const title = input.title.trim()
  if (title === '') return { ok: false, reason: 'invalid-title' }
  if (input.body.trim() === '') return { ok: false, reason: 'empty-body' }

  /*
   * Normalised once, up here, because two things read it now: the twin lookup below and the
   * `values` it used to be written inside. Two copies of this expression would be two things
   * to keep in step, and the day one drifted a song would either fail to find its own twin
   * or find one it does not have — a duplicate prompt about nothing, or a silent second copy.
   */
  const artist = input.artist === null || input.artist.trim() === '' ? null : input.artist.trim()

  try {
    const database = db()

    /*
     * The twin and the song cap, both settled *before* `resolveSection` runs, and that order
     * is the whole point of this block. `resolveSection` writes outside any transaction (it
     * uses `db()`, not a `tx`): it can mint an «Unfiled» songbook, and it can create a
     * section for a paste's own `{division: ...}`. Nothing further down rolls either of them
     * back, so a save refused *after* it had run left rows behind — and while the songbook
     * case is bounded by the songbook cap itself, sections have no cap at all, so a paste of
     * a hundred songs each declaring a different division into an account at its song cap
     * used to create a hundred empty sections and save not one song.
     *
     * Asked only on the creating branch, and only once the twin is known, which is what the
     * old order was protecting and this one keeps: an account sitting exactly on its cap is
     * full, not frozen, and replacing a song it already has takes nothing more from the plan
     * — refusing that with «your plan does not allow another song» would be false and would
     * send somebody shopping over a save that costs nothing. Editing a known song
     * (`input.slug` given) never adds a row, so it neither looks for a twin nor pays for the
     * question; the freeze, which does govern it, was checked above for every branch.
     *
     * One visible consequence of the twin lookup moving first: the duplicate prompt now
     * arrives ahead of a songbook-cap refusal, where before the refusal came first. That is
     * the better of the two orders — the prompt asks a question whose answer may well be
     * «replace», and no cap refuses a replacement.
     */
    const twin =
      input.slug === undefined
        ? await database
            .select({
              slug: songs.slug,
              title: songs.title,
              artist: songs.artist,
              sectionId: songs.sectionId,
            })
            .from(songs)
            .innerJoin(songbooks, eq(songs.songbookId, songbooks.id))
            // Scoped to this account: the same title and artist landing twice in two
            // different accounts is a coincidence, not a duplicate to warn anyone about.
            .where(
              and(
                sameSong(title, artist),
                eq(songbooks.accountId, accountIdOf(accountOwnerEmail)),
              ),
            )
            .limit(1)
        : []

    if (twin.length > 0 && decision === undefined) {
      return { ok: false, reason: 'duplicate', existing: twin[0] }
    }

    /*
     * Only a save that will really write a *new* row is asked about the song cap: no twin
     * to replace, or a twin the caller has chosen to keep by answering «add».
     *
     * Read-then-write, across two transactions, and therefore raceable — said here because
     * it is a real gap rather than an oversight. The count behind this refusal was taken in
     * the guard (`accountForSave` → `entitlementsOf`), the insert happens in its own
     * transaction further down, and nothing re-reads in between: N concurrent saves all see
     * the same count and all insert, so twenty parallel POSTs can leave a free account
     * holding forty-nine songs on a cap of thirty. The sequential loop in `ImportBatch` is
     * client-side and defeats nothing. Not patched, and it is worth knowing why before
     * somebody tries: re-counting inside the insert transaction fixes nothing on its own,
     * since under READ COMMITTED neither writer sees the other's uncommitted row, so the
     * only real fix is a `SELECT ... FOR UPDATE` on this account's `accounts` row held
     * across check-and-insert — and that takes `accounts` before `songbooks`/`songs`, the
     * opposite of the order `removeAccountAndContent` takes, which holds locks on songs and
     * songbooks and only then deletes the `accounts` row: a deadlock cycle (40P01, surfacing
     * as «save failed») bought in exchange. The bound
     * meanwhile: the rows persist and stay readable, the account reports frozen until a
     * deletion brings it back under the cap, and that is the same state a downgrade
     * produces with the same way out of it. The other half of the reason is structural —
     * counts are fetched in the guard precisely so no write can hold permission without
     * also holding the limits, and locking would move them back into each write path.
     */
    const creating = input.slug === undefined && (twin.length === 0 || decision === 'add')
    if (creating && entitlements.refused.createSong !== null) {
      const refused = entitlements.refused.createSong
      return { ok: false, reason: refused, limit: limitFacts(entitlements.limits, refused) }
    }

    /*
     * Hoisted out of the `values` literal it used to be spread into: it can refuse now, and
     * a refusal cannot be spread into an object being handed to drizzle.
     */
    const placed = await resolveSection(
      accountOwnerEmail,
      entitlements,
      input.songbookSlug,
      input.sectionId,
      input.sectionName,
    )
    // `limit` forwarded, not dropped: this is the songbook cap a paste with no songbook to
    // land in hits, and it is the most-seen numbered refusal in the app.
    if (!placed.ok) return { ok: false, reason: placed.reason, limit: placed.limit }

    const values = {
      title,
      artist,
      tags: input.tags.map((tag) => tag.trim()).filter((tag) => tag !== ''),
      link1: input.link1 === null || input.link1.trim() === '' ? null : input.link1.trim(),
      link2: input.link2 === null || input.link2.trim() === '' ? null : input.link2.trim(),
      link3: input.link3 === null || input.link3.trim() === '' ? null : input.link3.trim(),
      songbookId: placed.songbookId,
      sectionId: placed.sectionId,
      body: input.body,
      /**
       * The database's clock, not this server's.
       *
       * This column is the version the reading page compares itself against, and a
       * comparison is only sound if both sides were stamped by the same clock. Two
       * app instances a second apart would otherwise be enough for a real edit to
       * look older than the page it is meant to replace, and it would then be
       * ignored — the exact bug this was written to fix.
       */
      updatedAt: sql`now()`,
    }

    /**
     * The words as they stood before this save, read inside the same transaction that
     * replaces them — the one moment both versions exist, and therefore the only moment
     * the anchored notes can be carried across the edit (`lib/comments/reanchor.ts`).
     */
    let previousBody: string | null = null

    // Editing a known song: update in place and keep the slug, which is what
    // keeps that song's saved transposition and speed attached to it.
    if (input.slug !== undefined) {
      const updated = await database.transaction(async (tx) => {
        const before = await tx
          .select({ sectionId: songs.sectionId, body: songs.body })
          .from(songs)
          .where(eq(songs.slug, input.slug as string))
          .limit(1)

        if (before.length === 0) return []

        previousBody = before[0].body

        /*
         * A song sent to another section arrives unplaced, so it lands at the end
         * of it — the same place an import would. Keeping the old number would have
         * it claim a place among songs it has never been ordered against, tying with
         * whichever song already holds that number. The section is what is asked
         * about rather than the songbook: changing songbook changes section too,
         * and moving between two sections of one songbook moves it just as much.
         */
        const moved = before[0].sectionId !== values.sectionId

        return tx
          .update(songs)
          .set(moved ? { ...values, position: null } : values)
          .where(eq(songs.slug, input.slug as string))
          .returning()
      })

      if (updated.length === 0) return { ok: false, reason: 'not-found' }

      /*
       * After the transaction, never inside it: carrying the notes is a courtesy to
       * whoever wrote them, and a failure there must not roll back the edit the reader
       * actually asked for. `reanchorSongComments` swallows its own errors for the same
       * reason.
       */
      if (previousBody !== null) {
        await reanchorSongComments(input.slug as string, previousBody, input.body)
      }

      return saved(rowToSong(updated[0], placed.songbookSlug))
    }

    if (twin.length > 0 && decision === 'replace') {
      const updated = await database.transaction(async (tx) => {
        /*
         * Replacing a song's words is not moving it: one that already lives here keeps
         * the place it was given. Only one arriving from another section is placed,
         * and then at the end, like any other arrival.
         */
        if (twin[0].sectionId === values.sectionId) {
          return tx.update(songs).set(values).where(eq(songs.slug, twin[0].slug)).returning()
        }

        const place = await placeLast(tx, values.sectionId, twin[0].slug)
        return tx
          .update(songs)
          .set({ ...values, position: place })
          .where(eq(songs.slug, twin[0].slug))
          .returning()
      })

      return saved(rowToSong(updated[0], placed.songbookSlug))
    }

    /*
     * From here on a *new* row is written. `creating` is already true on every path that
     * reaches this line, and the song cap it stands for was asked above — before
     * `resolveSection` could write anything for a save that was never going to be allowed.
     */
    const taken = (await database.select({ slug: songs.slug }).from(songs)).map((row) => row.slug)
    const slug = uniqueSlug(title, taken)

    /*
     * One transaction: the place is worked out from what the songbook holds, and a
     * second import landing between that read and this insert would be given the same
     * number.
     */
    const inserted = await database.transaction(async (tx) => {
      const place = await placeLast(tx, values.sectionId, slug)
      return tx
        .insert(songs)
        .values({ slug, ...values, position: place })
        .returning()
    })

    return saved(rowToSong(inserted[0], placed.songbookSlug))
  } catch (error) {
    console.error('saveSong failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * A blank song, filed and titled, with nothing else — the counterpart to
 * import for someone who wants to type a song into the editor rather than
 * paste one into it.
 *
 * Deliberately not `saveSong` with an empty body glossed over: `saveSong`'s
 * duplicate check would offer to overwrite an existing song's own lyrics
 * with this blank one if the title collided (see its `'replace'` branch) —
 * exactly the data loss a blank-slate gesture must not risk. A title
 * collision here just makes two songs sharing a title, same as typing the
 * same title into the editor twice would; `uniqueSlug` keeps them addressable.
 */
/**
 * How many songs an import may still add, asked before it adds any.
 *
 * Reads through exactly the path the refusal will (`accountForSave` → `entitlementsOf`,
 * and `countRepertoire` for the number held), never a count assembled in the browser:
 * see `Headroom`'s own comment on why a pre-flight that disagrees with the save it
 * precedes is worse than none.
 *
 * Null when this reader may not write here at all. That is not the same as no room, and
 * the caller must not word it as though it were — the remedy for «your role does not
 * allow editing» is not an upgrade.
 */
export async function songHeadroom(): Promise<Headroom | null> {
  if (!hasDatabase) return null

  const target = await accountForSave(undefined)
  if (!target.ok) return null

  const { limits, frozen } = target.entitlements
  const { songs: held } = await countRepertoire(target.accountOwnerEmail)

  return {
    // `atCap` in `entitlements.ts` refuses at `held >= cap`, so the room left is the
    // difference and never less than none — a frozen account is already past it.
    fits: limits.songs === null ? null : Math.max(0, limits.songs - held),
    max: limits.songs,
    held,
    frozen,
  }
}

export async function createSong(
  title: string,
  songbookSlug: string,
  sectionId: number | null,
): Promise<SaveResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const target = await accountForSave(undefined)
  if (!target.ok) return target
  const { accountOwnerEmail, entitlements } = target

  /*
   * Unlike `saveSong`, this one only ever creates, so the cap is asked straight away —
   * before `resolveSection` can mint an «Unfiled» songbook for a song that will not be
   * written. `refused.createSong` already answers 'frozen' when the account is over its
   * caps, so there is nothing else to ask.
   */
  const refused = entitlements.refused.createSong
  if (refused !== null) {
    return { ok: false, reason: refused, limit: limitFacts(entitlements.limits, refused) }
  }

  const trimmed = title.trim()
  if (trimmed === '') return { ok: false, reason: 'invalid-title' }

  try {
    const database = db()

    const placed = await resolveSection(accountOwnerEmail, entitlements, songbookSlug, sectionId)
    // Same forwarding as in `saveSong`, and for the same reason.
    if (!placed.ok) return { ok: false, reason: placed.reason, limit: placed.limit }

    const values = {
      title: trimmed,
      artist: null,
      tags: [] as string[],
      link1: null,
      link2: null,
      link3: null,
      songbookId: placed.songbookId,
      sectionId: placed.sectionId,
      body: '',
      updatedAt: sql`now()`,
    }

    const taken = (await database.select({ slug: songs.slug }).from(songs)).map((row) => row.slug)
    const slug = uniqueSlug(trimmed, taken)

    const inserted = await database.transaction(async (tx) => {
      const place = await placeLast(tx, values.sectionId, slug)
      return tx
        .insert(songs)
        .values({ slug, ...values, position: place })
        .returning()
    })

    return saved(rowToSong(inserted[0], placed.songbookSlug))
  } catch (error) {
    console.error('createSong failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Deliberately ungated by the plan, and it must stay that way: an account over its caps is
 * frozen to deletions precisely so that this is the way out of the freeze. Refusing a
 * deletion would leave a downgraded reader with no move that fits again.
 */
export async function deleteSong(slug: string): Promise<DeleteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const owner = await songAccountOf(slug)
  if (owner === null) return { ok: false, reason: 'not-found' }
  const editor = await accessTo(owner)
  if (editor === null || !canEdit(editor.role)) {
    return { ok: false, reason: 'not-found' }
  }

  try {
    /*
     * The songbook is read *before* the delete, not returned by it: the page that lists
     * this song has to be dropped too, and the row no longer carries its songbook's slug —
     * only its id (v4.7) — so the answer takes a join, and a join needs a row. Asking
     * first is one extra statement and keeps the deletion itself a single statement.
     */
    const found = await db()
      .select({ songbookSlug: songbooks.slug })
      .from(songs)
      .innerJoin(songbooks, eq(songs.songbookId, songbooks.id))
      .where(eq(songs.slug, slug))
      .limit(1)
    if (found.length === 0) return { ok: false, reason: 'not-found' }

    const removed = await db()
      .delete(songs)
      .where(eq(songs.slug, slug))
      .returning({ slug: songs.slug })

    if (removed.length === 0) return { ok: false, reason: 'not-found' }

    revalidateSong(slug, found[0].songbookSlug)
    return { ok: true, slug: removed[0].slug }
  } catch (error) {
    console.error('deleteSong failed', error)
    return { ok: false, reason: 'failed' }
  }
}

export type { ExportedFile } from './export'

/**
 * Every song of the caller's **current account** as a `.chopro`, ready to be zipped by
 * the browser.
 *
 * These are the files `npm run seed` reads, so this archive is also the restore
 * path: put them back in `content/`, run the seed, and what is missing returns.
 */
export async function exportAll(): Promise<ExportedFile[] | null> {
  const editor = await asEditor()
  if (!editor.ok) return null

  const database = db()
  const [rows, names, divisions] = await Promise.all([
    database
      .select({ song: songs, songbookSlug: songbooks.slug })
      .from(songs)
      .innerJoin(songbooks, eq(songs.songbookId, songbooks.id))
      .where(eq(songbooks.accountId, accountIdOf(editor.accountOwnerEmail)))
      .orderBy(songs.slug),
    database
      .select({ slug: songbooks.slug, name: songbooks.name })
      .from(songbooks)
      .where(eq(songbooks.accountId, accountIdOf(editor.accountOwnerEmail))),
    database
      .select({ id: sections.id, name: sections.name })
      .from(sections)
      .innerJoin(songbooks, eq(sections.songbookId, songbooks.id))
      .where(eq(songbooks.accountId, accountIdOf(editor.accountOwnerEmail))),
  ])

  const nameBySlug = new Map(names.map((row) => [row.slug, row.name]))
  const nameById = new Map(divisions.map((row) => [row.id, row.name]))

  return rows.map(({ song, songbookSlug }) => ({
    name: choproFilename(song.slug),
    content: toChoproFile(
      rowToSong(song, songbookSlug),
      nameBySlug.get(songbookSlug) ?? null,
      song.sectionId === null ? null : (nameById.get(song.sectionId) ?? null),
    ),
  }))
}

/**
 * Every song of the caller's **current account**, organized into the folders and
 * numbered names a person would browse or print from — one folder per songbook, a
 * numbered section subfolder inside it, and, depending on `granularity`, either one
 * numbered `.chopro` per song or one numbered `.chopro` per section with every one
 * of its songs pasted in behind it.
 *
 * Distinct from `exportAll` on purpose: that one is also the restore path `npm run
 * seed` reads back — flat, one slug-named file per song — and folders or numbered
 * names would break it. This export never feeds back into the app; see
 * `organizeExport`'s own comment for how the numbering and the grouping work.
 */
export async function exportOrganized(granularity: ExportGranularity): Promise<ExportedFile[] | null> {
  const editor = await asEditor()
  if (!editor.ok) return null

  const rows = await db()
    .select({
      song: songs,
      songbookSlug: songbooks.slug,
      songbookName: songbooks.name,
      sectionName: sections.name,
    })
    .from(songs)
    .innerJoin(songbooks, eq(songs.songbookId, songbooks.id))
    .innerJoin(sections, eq(songs.sectionId, sections.id))
    .where(eq(songbooks.accountId, accountIdOf(editor.accountOwnerEmail)))
    .orderBy(asc(songbooks.position), asc(sections.position), asc(songs.position), asc(songs.title))

  const exportRows: ExportRow[] = rows.map((row) => ({
    song: rowToSong(row.song, row.songbookSlug),
    songbookName: row.songbookName,
    sectionName: row.sectionName,
  }))

  return organizeExport(exportRows, granularity)
}
