import type { Songbook, Section } from '@/lib/data/types'
import { LIMIT_MESSAGE, limitSentence, type LimitFacts, type LimitReason } from '@/lib/plans/types'

/**
 * The mutable layer.
 *
 * Everything that can change at runtime — the names, the divisions, and which section
 * each song is in — travels together and separately from the static pages. The pages
 * bake a snapshot of this so the first paint is already right; this overlay then
 * refreshes it.
 */
export interface SongbookState {
  songbooks: Songbook[]
  sections: Section[]
  /**
   * songSlug → sectionId. The songbook is *not* here: it is written on the section,
   * so asking twice would mean two answers that could disagree.
   *
   * A song missing from this map has no section yet, which can only happen in the one
   * deploy where the column is still nullable — see `db/schema.ts`. Such a song is
   * briefly absent from its songbook's page and from the home's count; the
   * contracting migration files it into «Songs» minutes later.
   */
  assignments: Record<string, number>
}

export type WriteFailure =
  | 'no-session'
  /** Signed in, but this account is not theirs to change. */
  | 'not-allowed'
  | 'no-database'
  /** The songbook still holds songs and no destination was given for them. */
  | 'not-empty'
  /** Adding the example songbook: this account already has at least one songbook. */
  | 'account-not-empty'
  | 'not-found'
  | 'invalid-name'
  /** A section of this songbook already carries that name. */
  | 'duplicate-name'
  /** The songs or the sections sent no longer match what the songbook holds. */
  | 'stale'
  /** Copying: the destination named is the songbook's own account. */
  | 'same-account'
  /**
   * Refused by the plan rather than by a permission — the cap is reached, or the
   * repertoire is over it and frozen to deletions. One union member, not four written out
   * here: `LimitReason` is named once in `lib/plans/types.ts` and every message map spreads
   * `LIMIT_MESSAGE`, so a fifth reason cannot arrive with no wording for it.
   */
  | LimitReason
  | 'failed'

/**
 * One refusal shape for all three results below, so a caller that learns to read a refusal
 * has learned to read every one of them.
 *
 * `limit` is an optional field on the single failure branch rather than a variant of its own
 * keyed on the count reasons — the shape `duplicate` uses over in `SaveResult`. The
 * difference is what the call sites hold: they all refuse with an *un-narrowed*
 * `LimitReason` read straight off `entitlements.refused.…`, so a keyed variant would force a
 * `switch` over four reasons at every one of them just to build the object, and the
 * `editRepertoire` gates — which can only ever answer `frozen` — would each have to prove
 * that to the compiler. Optional keeps every existing construction site valid and lets a
 * site that has a cap to name simply name it.
 *
 * Absent means "no number to name here", never "no cap exists": `frozen` and
 * `plan-required` have none to give (see `limitFacts`), and every other reason has nothing
 * to do with counting.
 */
export interface WriteRefusal {
  ok: false
  reason: WriteFailure
  limit?: LimitFacts
}

export type WriteResult = { ok: true } | WriteRefusal

/**
 * Creating one answers with its slug.
 *
 * The name is not enough to find it again: `uniqueSlug` may have had to number it,
 * and a caller that wants to *use* what it just made — the import screen files a
 * paste into it — would otherwise have to guess how. Assignable to `WriteResult`,
 * so callers that only care whether it worked need no change.
 */
export type CreateResult = { ok: true; slug: string } | WriteRefusal

/**
 * Creating a section answers with its id, for the same reason and one more: the import
 * screen creates a section and then has to file the whole paste into it, and a section
 * has no readable key to look itself up by.
 */
export type CreateSectionResult = { ok: true; id: number } | WriteRefusal

/**
 * The capless wording, one line per reason. Still exported — `ImportBatch` tells a refused
 * row from a failed one by membership in `LIMIT_MESSAGE`, which this spreads — but no screen
 * indexes it any more: `writeMessage` is the way in, and it outranks these two count lines
 * whenever the refusal knows its cap.
 */
export const WRITE_MESSAGE: Record<WriteFailure, string> = {
  // The plan refusals, worded once in `lib/plans/types.ts` — `SAVE_MESSAGE` spreads the
  // same object, so the song side and the songbook side cannot come to say it differently.
  ...LIMIT_MESSAGE,
  'no-session': 'Session expired. Reload the page and sign in again.',
  'not-allowed': 'Your role does not allow editing the repertoire.',
  'no-database': 'No database configured: changes cannot be saved.',
  'not-empty': 'Still contains songs.',
  'account-not-empty': 'The example songbook is only offered to an account with no songbook yet.',
  'not-found': 'This songbook no longer exists.',
  'invalid-name': 'A name is required.',
  'duplicate-name': 'A section with this name already exists in this songbook.',
  stale: 'The songbook changed elsewhere. Reload the page and try again.',
  'same-account': 'Choose a different account: this songbook already lives in this one.',
  failed: 'Save failed. Please try again.',
}

/**
 * What to show for a refusal — the one thing every screen calls, never `WRITE_MESSAGE`
 * directly.
 *
 * Uniform on purpose, including at the sites whose action cannot refuse by a cap today. A
 * site left indexing the map keeps compiling forever and silently starts printing the
 * capless sentence the day its action grows a count gate, which is precisely the bug this
 * whole change exists to fix; there is no compiler error to catch that, so the rule is that
 * there is no other way to word a refusal.
 *
 * Takes a bare `{ reason, limit? }` rather than a `WriteRefusal`, for two reasons. A
 * narrowed `result` satisfies it structurally, so the common site reads `writeMessage(result)`
 * with no unpacking; and a `catch` block, which has no result at all, can still say
 * `writeMessage({ reason: 'failed' })` instead of reaching for the map — the second half of
 * why the map is not imported by screens any more.
 */
export function writeMessage(failure: { reason: WriteFailure; limit?: LimitFacts }): string {
  return failure.limit === undefined ? WRITE_MESSAGE[failure.reason] : limitSentence(failure.limit)
}

/** The reader's own songbooks, in the order the home screen lists them. */
export function songbooksOf(state: SongbookState): Songbook[] {
  return [...state.songbooks].sort((one, other) => one.position - other.position)
}

/** The sections of one songbook, in the order it is played through. */
export function sectionsOf(state: SongbookState, songbookSlug: string): Section[] {
  return state.sections
    .filter((section) => section.songbookSlug === songbookSlug)
    .sort((one, other) => one.position - other.position)
}

/**
 * Which songbook a song is in, by way of its section.
 *
 * The one place that walk happens, so every screen answers it the same way — and
 * so the day the map holds something else, only this has to change.
 */
export function songbookOf(state: SongbookState, songSlug: string): string | null {
  const sectionId = state.assignments[songSlug]
  if (sectionId === undefined) return null

  return state.sections.find((section) => section.id === sectionId)?.songbookSlug ?? null
}

export function countBySlug(state: SongbookState): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const entry of state.songbooks) counts[entry.slug] = 0

  const songbookById = new Map(
    state.sections.map((section) => [section.id, section.songbookSlug]),
  )

  for (const sectionId of Object.values(state.assignments)) {
    const slug = songbookById.get(sectionId)
    if (slug !== undefined) counts[slug] = (counts[slug] ?? 0) + 1
  }
  return counts
}
