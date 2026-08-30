import type { Song } from '@/lib/data/types'
import { LIMIT_MESSAGE, limitSentence, type LimitFacts, type LimitReason } from '@/lib/plans/types'

export interface SongInput {
  /** Present when editing an existing song, absent when importing a new one. */
  slug?: string
  title: string
  artist: string | null
  tags: string[]
  link1: string | null
  link2: string | null
  link3: string | null
  songbookSlug: string
  /**
   * The section within it, or null for «wherever this songbook files things first».
   *
   * Nullable so a caller that has no opinion does not have to invent one: the import
   * screen and the editor both ask, but the fallback is a real place — see
   * `resolveSection` — rather than a song with no section at all.
   */
  sectionId: number | null
  /**
   * A section to find (or create, if this songbook has none by that name yet) when
   * `sectionId` is null — a paste's own `{division: ...}`, honoured now that there is
   * no explicit `sectionId` for it to silently override. Ignored whenever `sectionId`
   * is given: an id is always a caller's own explicit choice, and that choice never
   * loses to a name.
   */
  sectionName?: string | null
  body: string
}

export interface DuplicateOf {
  slug: string
  title: string
  artist: string | null
}

export type SaveFailure =
  | 'no-session'
  /** Signed in, but this account is not theirs to change. */
  | 'not-allowed'
  | 'no-database'
  | 'invalid-title'
  | 'empty-body'
  | 'not-found'
  /**
   * Refused by the plan: the song cap is reached, the songbook a paste would have to mint
   * would be one too many, or the repertoire is frozen over its caps. `LimitReason` rather
   * than strings of its own, so this side and `WriteFailure` refuse in the same words.
   */
  | LimitReason
  | 'failed'

/**
 * A save carries back the row it wrote, not just its slug.
 *
 * The screen shows that row immediately, so it has to be the row the database
 * holds rather than the values that were sent: `songbookSlug` can come back
 * different when the one asked for does not exist, and `updatedAt` is the
 * database's own clock — the value every later comparison is made against. Echoing
 * the input with a timestamp from the browser would risk a guess that outranks the
 * truth and then wins forever, since it gets cached.
 */
export type SaveResult =
  | { ok: true; song: Song }
  /** Same title and artist already exist; the caller must decide what to do. */
  | { ok: false; reason: 'duplicate'; existing: DuplicateOf }
  | SaveRefusal

/**
 * Every other refusal, with the cap it hit when there is one to name.
 *
 * `limit` is an optional field here and a keyed variant above, and the asymmetry is the
 * point rather than an inconsistency: `duplicate` is a *single* reason whose extra fact is
 * mandatory, so a variant makes the compiler hand `existing` to whoever narrows to it —
 * which is how `ImportBatch` reads `result.existing.title` with no check at all. The count
 * caps are two reasons among eleven, arriving un-narrowed off `entitlements.refused.…`, and
 * the fact is optional because a refusal built before this field existed is still a valid
 * refusal. Keying them too would have made every `return { ok: false, reason: refused }` in
 * `import/actions.ts` prove which reason it holds before it could name it.
 */
export interface SaveRefusal {
  ok: false
  reason: SaveFailure
  limit?: LimitFacts
}

export type DeleteResult = { ok: true; slug: string } | SaveRefusal

/**
 * How much room the plan leaves before an import starts writing.
 *
 * Asked once, ahead of the run, and the reason is arithmetic: `ImportBatch` saves one
 * song at a time and refuses one at a time, so a free account dropping a 212-song
 * archive is told no on rows 31 through 212 — a hundred and eighty-two refusals, each
 * with the same remedy, none of them news after the first. One sentence before anything
 * is written says the same thing better, and says it while it is still actionable.
 *
 * It must be read through the same path the refusal is (`entitlementsOf` and
 * `countRepertoire`, both in `plans/resolve.ts`) rather than counted in the browser off
 * whatever `SongbookProvider` happens to hold. A pre-flight number that disagreed with
 * the refusal that follows would be worse than no pre-flight at all: it would promise
 * room that the save then denies.
 */
export interface Headroom {
  /**
   * How many more songs this account may add, or null for no cap.
   *
   * Null is «unlimited», never a large number — the same rule `PlanLimits` states for
   * its own caps, for the same reason: a sentinel reads as a real number in every
   * sentence that quotes it.
   */
  fits: number | null
  /** The cap itself, which is the number the refusal sentence quotes. */
  max: number | null
  held: number
  /** Already over the caps: nothing may be added until deletions bring it back. */
  frozen: boolean
}

/** What to do when a save hits a song with the same title and artist. */
export type Decision = 'replace' | 'add'

/**
 * The capless wording. Exported for the same one reason `WRITE_MESSAGE` is — `ImportBatch`
 * separates a refused row from a failed one by membership in `LIMIT_MESSAGE` — while
 * `saveMessage` is what every screen calls.
 */
export const SAVE_MESSAGE: Record<SaveFailure | 'duplicate', string> = {
  // Spread, not retyped — see `WRITE_MESSAGE`, which spreads the same object.
  ...LIMIT_MESSAGE,
  'no-session': 'Session expired. Reload the page and sign in again.',
  'not-allowed': 'Your role does not allow editing the repertoire.',
  'no-database': 'No database configured: cannot save.',
  'invalid-title': 'A title is required.',
  'empty-body': 'The text is empty.',
  'not-found': 'This song no longer exists.',
  duplicate: 'A song with this title and artist already exists.',
  failed: 'Save failed. Please try again.',
}

/**
 * What to show for a refused save — `writeMessage`'s twin, deliberately not one shared
 * function over both unions.
 *
 * The two message maps are keyed by two different failure unions, and a single generic
 * helper would have had to take the map as a parameter: every call site would then be
 * choosing which map to use, which is exactly the choice that has been getting made
 * differently in different files. Two names, each importable from the module whose result it
 * words, leaves nothing to choose.
 *
 * `'duplicate'` is in the parameter type because it is in `SAVE_MESSAGE`: the editor and the
 * import screen both hand a whole narrowed result here, duplicate branch included, and a
 * signature that excluded it would have sent those sites back to indexing the map.
 */
export function saveMessage(failure: { reason: SaveFailure | 'duplicate'; limit?: LimitFacts }): string {
  return failure.limit === undefined ? SAVE_MESSAGE[failure.reason] : limitSentence(failure.limit)
}
