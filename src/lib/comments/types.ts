/**
 * The vocabulary of an anchored comment: a private note a reader pins to one point of
 * one song, on their own screen.
 *
 * Not the song note (`user_song_prefs.note`), which speaks about the whole song and
 * stays where it is: these two coexist, and both mock boards draw them together.
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

/**
 * What the open card is about: a stack of notes being read, or a point being written at.
 *
 * Here rather than beside the component that renders it, so the provider can hold this as
 * state without the component and the provider importing each other.
 */
export interface CardPoint {
  x: number
  y: number
}

export type CardSubject =
  | { kind: 'read'; ids: string[]; at: CardPoint }
  | { kind: 'write'; anchor: CommentAnchor; label: string; at: CardPoint }

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
