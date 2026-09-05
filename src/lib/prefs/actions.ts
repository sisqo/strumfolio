'use server'

/**
 * Server actions for preferences. The database is the source of truth; the
 * client keeps a read cache so the sheet can paint in the right key and so the
 * app still remembers anything at all when offline.
 */

import { and, eq, inArray, isNotNull } from 'drizzle-orm'

import { currentUser } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { accountIdOf, songIdOf } from '@/lib/db/ids'
import { songbooks, songs, userPrefs, userSongPrefs } from '@/lib/db/schema'
import type { Instrument } from '@/lib/music/shapes'
import { entitlementsOf } from '@/lib/plans/resolve'

import {
  type GlobalPrefs,
  type SongPrefs,
  clampCapo,
  clampSemitones,
  clampSpeed,
  clampZoom,
  readAccidentals,
  readChordDisplay,
  readChordShapes,
  readInstrument,
  readNotation,
} from './types'

/**
 * The outcome of a save, from the queue's point of view.
 *
 * `no-destination` and `failed` are not the same thing and must not be treated
 * alike: with nobody signed in or no database configured there is nothing to
 * sync to, so the write is finished and the queue must drop it. Only `failed` is
 * worth retrying.
 *
 * `not-in-plan` is the third of those "finished, nothing to retry" answers, and it is its
 * own value rather than `saved` or `failed` for the same reason the other two are apart:
 * the row *was* written, but not with the instrument that was asked for, and a queue that
 * read that as `failed` would resend the same refused value every fifteen seconds for as
 * long as the app stayed open.
 *
 * Still nothing renders it, and now for a better reason than before: `ReadingPanel` refuses
 * the tap and offers `/pricing`, so a request the plan does not allow no longer reaches this
 * function from the interface at all. Its job is to stay distinguishable in that flush — and
 * to stop this returning `saved` about a preference it did not save — for the one path left
 * that can produce it, a plan that lapsed while the app was offline with a queued write.
 */
export type SaveResult = 'saved' | 'no-destination' | 'not-in-plan' | 'failed'

/**
 * Preferences belong to an address, so `currentUser` is asked for the address rather than
 * for a yes: null means nobody, no database, or somebody whose access has since been
 * taken away. All three are `no-destination` and none is `failed` — there is nothing to
 * sync to, so the queue drops the write instead of retrying it for ninety days.
 *
 * **No role is checked here, and that is the design.** A transposition, a capo, a scroll
 * speed and a font size are not modifications of anything shared: they are how this one
 * reader reads, on their own screen. Someone who could not save them would be someone
 * who cannot use the app on stage, which is the only place it gets used.
 */

export interface LoadedPrefs {
  global: GlobalPrefs | null
  song: SongPrefs | null
}

/**
 * The instrument this account may actually read shapes for.
 *
 * The read-side counterpart to `saveGlobalPrefs`'s refusal, and it exists because refusing
 * the write was never enough on its own: a row written while the ukulele *was* included —
 * before a downgrade, before an expiry, or before there was a client-side gate at all — goes
 * on saying `ukulele` for as long as nobody saves over it. This is what stops that row from
 * outliving the entitlement it was written under, and it is the half a reader cannot get
 * past by clearing their browser storage.
 *
 * Asks about the plan **only when the stored value is not guitar**, the same parsimony
 * `saveGlobalPrefs` states for itself: this runs on every song open, and the common case
 * must not pay two count queries to answer a question it never raises.
 *
 * The row itself is left alone rather than corrected in place. A read is not a write — a
 * `GET` that repairs the database is a surprise, it would fire on every song open until it
 * succeeded, and it would throw away the reader's real answer: somebody who resubscribes
 * gets their ukulele back exactly because nobody overwrote what they had chosen.
 */
async function allowedInstrument(
  stored: Instrument,
  user: { accountOwnerEmail: string },
): Promise<Instrument> {
  if (stored === 'guitar') return stored
  const entitlements = await entitlementsOf(user.accountOwnerEmail)
  return entitlements.refused.ukulele === null ? stored : 'guitar'
}

export async function loadPrefs(songSlug: string | null): Promise<LoadedPrefs> {
  const user = await currentUser()
  if (user === null) return { global: null, song: null }
  const email = user.email

  const database = db()

  const globalRows = await database
    .select()
    .from(userPrefs)
    .where(eq(userPrefs.accountId, accountIdOf(email)))
    .limit(1)

  const global =
    globalRows.length === 0
      ? null
      : {
          zoomStep: clampZoom(globalRows[0].zoomStep),
          notation: readNotation(globalRows[0].notation),
          instrument: await allowedInstrument(readInstrument(globalRows[0].instrument), user),
          chordDisplay: readChordDisplay(globalRows[0].chordDisplay),
          accidentals: readAccidentals(globalRows[0].accidentals),
        }

  if (songSlug === null) return { global, song: null }

  const songRows = await database
    .select()
    .from(userSongPrefs)
    .where(
      and(
        eq(userSongPrefs.accountId, accountIdOf(email)),
        eq(userSongPrefs.songId, songIdOf(songSlug)),
      ),
    )
    .limit(1)

  const song =
    songRows.length === 0
      ? null
      : {
          semitones: clampSemitones(songRows[0].semitones),
          scrollSpeed: clampSpeed(songRows[0].scrollSpeed),
          capo: clampCapo(songRows[0].capo),
          chordShapes: readChordShapes(songRows[0].chordShapes),
          favorite: songRows[0].favorite,
        }

  return { global, song }
}

/**
 * The write-side control point for the ukulele: what a plan without it cannot do is make the
 * choice *stick*, across a reload and across the reader's other devices.
 *
 * The one that cannot be bypassed, and no longer the only one. `ReadingPanel` refuses the tap
 * (which is the half a reader experiences) and `allowedInstrument` clamps the value on the way
 * back out (which is what keeps a row written under an entitlement that has since lapsed from
 * outliving it) — see `PlanLimits.ukulele`. The shapes themselves are drawn in the browser
 * from a table that ships with the app, so no server-side check can stop a determined reader
 * from seeing them; what all three halves together do is make sure nothing the app itself
 * shows or remembers contradicts what the plan says.
 *
 * Refused narrowly, and the narrowness is the decision. The instrument shares one row with
 * the zoom, the notation and the chord display, and this function's result goes to the
 * offline queue rather than to a screen: returning early would throw away a font-size
 * change the reader made in the same breath, with no way to tell them why. So the row is
 * written with the instrument the plan allows, and the answer says the instrument did not
 * take.
 *
 * The plan is resolved **only** when a non-guitar instrument is actually asked for — inside
 * `allowedInstrument`, which is the same test the read path runs and is shared for exactly
 * that reason. This runs on every zoom step and every notation press, and those must not each
 * pay for two count queries to answer a question they never raise.
 */
export async function saveGlobalPrefs(prefs: GlobalPrefs): Promise<SaveResult> {
  const user = await currentUser()
  if (user === null) return 'no-destination'
  const email = user.email

  const asked = readInstrument(prefs.instrument)
  const instrument = await allowedInstrument(asked, user)

  const values = {
    zoomStep: clampZoom(prefs.zoomStep),
    notation: readNotation(prefs.notation),
    instrument,
    chordDisplay: readChordDisplay(prefs.chordDisplay),
    accidentals: readAccidentals(prefs.accidentals),
  }

  try {
    await db()
      .insert(userPrefs)
      .values({ accountId: accountIdOf(email), ...values })
      .onConflictDoUpdate({
        target: userPrefs.accountId,
        set: { ...values, updatedAt: new Date() },
      })
    return instrument === asked ? 'saved' : 'not-in-plan'
  } catch (error) {
    console.error('saveGlobalPrefs failed', error)
    return 'failed'
  }
}

/**
 * The key, the speed, the capo and the chosen shapes — the whole row at once, which is
 * what makes `favorite` conspicuously absent from it.
 *
 * `prefs.favorite` is read and discarded here on purpose (it is not in `values` below).
 * The star has `saveFavorite` instead, and the reason is a race this write cannot avoid:
 * see that function.
 */
export async function saveSongPrefs(songSlug: string, prefs: SongPrefs): Promise<SaveResult> {
  const email = (await currentUser())?.email ?? null
  if (email === null) return 'no-destination'

  const values = {
    semitones: clampSemitones(prefs.semitones),
    scrollSpeed: clampSpeed(prefs.scrollSpeed),
    capo: clampCapo(prefs.capo),
    chordShapes: readChordShapes(prefs.chordShapes),
  }

  try {
    await db()
      .insert(userSongPrefs)
      .values({ accountId: accountIdOf(email), songId: songIdOf(songSlug), ...values })
      .onConflictDoUpdate({
        target: [userSongPrefs.accountId, userSongPrefs.songId],
        set: { ...values, updatedAt: new Date() },
      })
    return 'saved'
  } catch (error) {
    console.error('saveSongPrefs failed', error)
    return 'failed'
  }
}

/**
 * Stars or unstars one song for this reader — one column, never the whole row.
 *
 * **The narrowness is the entire point, and it is a correctness requirement rather than
 * tidiness.** `PrefsProvider` reads the local cache before paint and the server's row a
 * moment later, and its load effect deliberately refuses to apply that row while a write
 * for the same song is queued — otherwise the older stored value would silently overwrite
 * a change the reader had just made. Route the star through `saveSongPrefs` and that guard
 * turns against itself: the star is a single tap on a control at the top of a page that
 * has only just opened, so on a device with no cached copy of that song the tap queues the
 * *defaults* (capo 0, no transposition), the arriving row is then skipped because a write
 * is pending, and the queue then flushes those defaults over a capo the reader had set
 * months ago. One column cannot do that: it says nothing about the key or the capo, so
 * there is nothing for it to overwrite.
 *
 * **Reproduced, not reasoned.** On 2026-09-05, against `songs-db-dev` with the star put
 * back inside the row and `loadPrefs` slowed so the tap could land first: a stored
 * `semitones: 3` came back `0` from a single tap of the star, on the server, with no other
 * gesture. With the column split as it is here the same sequence leaves the row alone and
 * the transposition reappears on screen when the read arrives. Note also what the queue's
 * serialization does *not* save: it guarantees the read answers before the write, which is
 * precisely the order that produces this loss.
 *
 * Inserting only `favorite` leaves the other columns at their defaults, which is right —
 * a row that did not exist held no preferences to preserve.
 *
 * No plan checked and no role checked, same as `saveSongPrefs` and for the reason stated
 * above it: which songs a reader reaches for is how they read, not a change to anything
 * shared.
 */
export async function saveFavorite(songSlug: string, favorite: boolean): Promise<SaveResult> {
  const email = (await currentUser())?.email ?? null
  if (email === null) return 'no-destination'

  try {
    await db()
      .insert(userSongPrefs)
      .values({ accountId: accountIdOf(email), songId: songIdOf(songSlug), favorite })
      .onConflictDoUpdate({
        target: [userSongPrefs.accountId, userSongPrefs.songId],
        set: { favorite, updatedAt: new Date() },
      })
    return 'saved'
  } catch (error) {
    console.error('saveFavorite failed', error)
    return 'failed'
  }
}

/**
 * Marks this song as opened by this reader, right now — the one fact "Recently
 * played" on the home screen is built from.
 *
 * Deliberately not folded into `saveSongPrefs`: that one only runs when a real
 * preference changes, and a song read start to finish without ever touching the
 * key or the capo must still count as opened. No result to report and nothing
 * queued or retried if it fails — missing an occasional "recently played" entry
 * is a cosmetic gap, not one worth the offline queue's own complexity.
 */
export async function recordSongOpened(songSlug: string): Promise<void> {
  const email = (await currentUser())?.email ?? null
  if (email === null) return

  try {
    await db()
      .insert(userSongPrefs)
      .values({ accountId: accountIdOf(email), songId: songIdOf(songSlug), lastOpenedAt: new Date() })
      .onConflictDoUpdate({
        target: [userSongPrefs.accountId, userSongPrefs.songId],
        set: { lastOpenedAt: new Date() },
      })
  } catch (error) {
    console.error('recordSongOpened failed', error)
  }
}

/**
 * Empties this reader's "Recently played" — the undo for `recordSongOpened` above.
 *
 * **An UPDATE that nulls one column, never a DELETE**, and that is the whole of what makes this
 * safe rather than destructive: `lastOpenedAt` shares its row with `semitones`, `capo`,
 * `scrollSpeed`, `chordShapes` and `favorite` (see `userSongPrefs` in `db/schema.ts`), so
 * deleting the rows would throw away the key this reader sings each song in, the fret their
 * capo sits on and every song they have starred — to clear a list of shortcuts. One column is
 * the only thing anybody is asking to forget.
 *
 * Scoped by `userEmail` **and** the account the songs belong to, matching `listRecentlyOpened`
 * (`lib/data/db.ts`) clause for clause and for its own stated reason: a global owner's rows can
 * point at songs in any account they have ever switched into, and a button that says it clears
 * *this* list must not also clear entries that list never showed. Clearing while switched into
 * somebody else's account leaves the reader's own account's history alone, and the other way
 * round.
 *
 * `isNotNull` in the predicate is not decoration either: without it this would touch every
 * preference row this reader owns in the account — every saved transposition, most of which were
 * never "recently played" — writing them all for nothing.
 *
 * No confirmation step in front of it, deliberately, on the same reasoning `setGrant`'s "Remove
 * gift" gives for having none: the retype-to-confirm net is for the irreversible cascades that
 * destroy songs. This forgets an ordering hint, and reading a song puts it back.
 */
export async function clearRecentlyOpened(): Promise<
  { ok: true } | { ok: false; reason: 'no-session' | 'failed' }
> {
  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  try {
    /* The songs of the account being looked at, as a subquery rather than a first round trip:
       the set is only ever used as the right-hand side of this one predicate. */
    const songsInThisAccount = db()
      .select({ id: songs.id })
      .from(songs)
      .innerJoin(songbooks, eq(songs.songbookId, songbooks.id))
      .where(eq(songbooks.accountId, accountIdOf(user.accountOwnerEmail)))

    await db()
      .update(userSongPrefs)
      .set({ lastOpenedAt: null })
      .where(
        and(
          eq(userSongPrefs.accountId, accountIdOf(user.email)),
          inArray(userSongPrefs.songId, songsInThisAccount),
          isNotNull(userSongPrefs.lastOpenedAt),
        ),
      )

    return { ok: true }
  } catch (error) {
    console.error('clearRecentlyOpened failed', error)
    return { ok: false, reason: 'failed' }
  }
}
