/**
 * The vocabulary of an anchored comment: a private note a reader pins to one point of
 * one song, on their own screen.
 *
 * These replaced the per-song note that used to sit above the sheet (`user_song_prefs.note`,
 * dropped in migration 0030). The two were planned to coexist — both mock boards draw them
 * together — but a note anchored to the word it is about says everything the free-floating
 * one said and also says *where*, and two places to write a reminder about one song were two
 * places to look for it.
 *
 * The anchor lives in the *editor's* coordinates — `SongDocument.blocks` is 1:1 with the
 * source lines, whereas the reading parser drops blank lines and unknown directives and
 * so cannot address a position in the file at all. That choice is what makes an anchor
 * survive an edit; see `reanchor.ts` for what happens when it cannot.
 */

/**
 * Whether the note is about the syllable or about the chord standing over it.
 *
 * `text` in the column with a narrowing reader, never a pgEnum — the same idiom as
 * `readPlan` and `readInstrument`: a new value is then a deploy rather than an
 * `ALTER TYPE` on a live database, and a value written by a newer deploy degrades
 * gracefully when read by an older one instead of throwing.
 */
export type CommentTarget = 'lyric' | 'chord'

const TARGET_VALUES = ['lyric', 'chord'] as const satisfies readonly CommentTarget[]

/** Anything unreadable means `lyric`: the column's own default, and the commoner case. */
export function readTarget(value: unknown): CommentTarget {
  return TARGET_VALUES.includes(value as CommentTarget) ? (value as CommentTarget) : 'lyric'
}

/** Where a comment hangs, in the editor's own coordinates. */
export interface CommentAnchor {
  /** Index into `SongDocument.blocks`. */
  blockIndex: number
  /** Index into that block's `text`, snapped to the start of a syllable. */
  charOffset: number
  target: CommentTarget
}

export interface SongComment {
  id: string
  /**
   * `null` when the note lost its hold on the text — see `reanchor.ts`. Null rather than
   * a separate `orphaned` boolean so an orphan that still carries an anchor cannot be
   * represented at all.
   */
  anchor: CommentAnchor | null
  /**
   * The anchored text as it read when the note was written — «grace», or «the D of verse 2».
   *
   * Denormalized on purpose. Recomputing it from the document works right up until the
   * moment it matters most: an orphan has no anchor left to recompute from, and this is
   * then the only surviving trace of what the note was about.
   */
  anchorLabel: string
  body: string
  createdAt: string
  updatedAt: string
}

/** The shape a `userSongComments` row comes back as, whichever query selected it. */
export interface CommentRow {
  id: string
  blockIndex: number | null
  charOffset: number | null
  target: string
  anchorLabel: string
  body: string
  createdAt: Date
  updatedAt: Date
}

/**
 * A database row, read as a `SongComment` — shared by `comments/actions.ts` and
 * `booklet/actions.ts` so the one rule that matters (`blockIndex`/`charOffset` are both
 * null, or neither is) is written once. Plain rather than living in either `'use server'`
 * file, which may only export async functions.
 */
export function commentFromRow(row: CommentRow): SongComment {
  return {
    id: row.id,
    anchor:
      row.blockIndex === null || row.charOffset === null
        ? null
        : { blockIndex: row.blockIndex, charOffset: row.charOffset, target: readTarget(row.target) },
    anchorLabel: row.anchorLabel,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * Where on the screen something was tapped. Here rather than beside the component that
 * renders it, so the provider can hold it as state without the two importing each other.
 */
export interface CardPoint {
  x: number
  y: number
}

/** A stack of notes opened for reading — every note sharing one point, since one card
 *  shows them together. */
export interface OpenNotes {
  ids: string[]
  at: CardPoint
}

/**
 * A note being written: what it will hang on, what that reads as, and where the reader
 * picked it.
 *
 * It used to be the second half of the card's own subject — `{ kind: 'write', … }` beside
 * `{ kind: 'read', … }` — on the reasoning that both opened the same card. They no longer
 * do: a draft is composed in the notes panel wherever there is one on screen, and only
 * falls back to a card at the point when there is not. So the thing being written outlived
 * the card it used to be a mode of, and it is its own shape now.
 *
 * `at` survives that move because the fallback still needs it, and because it costs one
 * pair of numbers taken at the moment of the tap — by the time anything renders, the
 * element that was tapped is one of hundreds and nothing else identifies it.
 */
export interface NoteDraft {
  anchor: CommentAnchor
  label: string
  at: CardPoint
}

/**
 * What number a note anchored *here* would carry — the badge it will get, worked out
 * before it exists.
 *
 * The panel needs it twice over: on the draft being written, and on the placeholder
 * standing in for one not yet placed. Derived from the same rule `inReadingOrder` sorts
 * by rather than reimplementing it loosely, because the two disagreeing would mean a
 * draft numbered 4 turning into a badge numbered 1 the moment it was saved.
 *
 * `<=` on a matching offset, not `<`: a note sharing a point with an existing one is the
 * newer of the two, and `inReadingOrder` breaks that tie by age.
 */
export function positionFor(comments: readonly SongComment[], anchor: CommentAnchor): number {
  const before = comments.filter(
    (comment) =>
      comment.anchor !== null &&
      (comment.anchor.blockIndex < anchor.blockIndex ||
        (comment.anchor.blockIndex === anchor.blockIndex &&
          comment.anchor.charOffset <= anchor.charOffset)),
  )
  return before.length + 1
}

/** An orphan is exactly a comment with no anchor. One test, named once. */
export function isOrphan(comment: SongComment): boolean {
  return comment.anchor === null
}

/**
 * The reading order the rail and the badges both number by: document order, orphans last.
 *
 * Numbering is derived here and never stored — a stored number would have to be rewritten
 * across every row below an insertion, and the number a reader sees is a property of the
 * page, not of the note.
 *
 * Orphans sort last among themselves by age, since they have no position left to sort by;
 * they still get a number, because they still get a parked badge on the sheet.
 */
export function inReadingOrder(comments: readonly SongComment[]): SongComment[] {
  return [...comments].sort((a, b) => {
    if (a.anchor === null || b.anchor === null) {
      if (a.anchor === null && b.anchor === null) return a.createdAt.localeCompare(b.createdAt)
      return a.anchor === null ? 1 : -1
    }
    if (a.anchor.blockIndex !== b.anchor.blockIndex) return a.anchor.blockIndex - b.anchor.blockIndex
    if (a.anchor.charOffset !== b.anchor.charOffset) return a.anchor.charOffset - b.anchor.charOffset
    // Same point: the card stacks them, and reading them in the order they were written
    // is the whole reason they stack rather than opening several cards.
    return a.createdAt.localeCompare(b.createdAt)
  })
}
