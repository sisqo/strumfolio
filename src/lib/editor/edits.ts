/**
 * Every change the editor can make, as functions on the document.
 *
 * Kept out of the components so each one can be tested on its own, and so the
 * graphic mode and the raw mode cannot disagree: both end up as a source string
 * through these.
 */

import {
  type Block,
  type ChordAt,
  type SongDocument,
  sectionsOf,
  shiftChords,
} from './document'
import { wordStarts } from './syllables'

function replace(document: SongDocument, index: number, block: Block): SongDocument {
  const blocks = [...document.blocks]
  blocks[index] = block
  return { ...document, blocks }
}

function lyricsAt(document: SongDocument, index: number) {
  const block = document.blocks[index]
  return block !== undefined && block.kind === 'lyrics' ? block : null
}

/** The text of a line changed; its chords follow the words they sat above. */
export function setLineText(document: SongDocument, index: number, text: string): SongDocument {
  const block = document.blocks[index]
  if (block === undefined) return document

  if (block.kind === 'comment') return replace(document, index, { ...block, text })

  /**
   * A blank line is what a source file already looks like when there is nothing on
   * it — indistinguishable, byte for byte, from a lyrics line whose text is empty.
   * That is exactly the shape a freshly split or appended line starts in, which is
   * why it renders as this same editable row rather than the "— break —" one a
   * blank line already on the page keeps showing: the moment there is something to
   * hold, it needs to become a real line, not stay a placeholder no edit can reach.
   */
  if (block.kind === 'blank') return replace(document, index, { kind: 'lyrics', text, chords: [] })

  if (block.kind !== 'lyrics') return document

  /**
   * Words written under a line that was only chords: the chords spread over the
   * new words in their order — `[re] [la] [re] [sol]` above «Quando sono solo
   * scrivo» puts re on Quando, la on sono, and any left over after the last
   * word. Their packed positions (one per stand-in space) were never *places*,
   * only an order, and shifting them like ordinary anchors piled every chord
   * onto the end of whatever got typed.
   */
  if (block.text.trim() === '' && text.trim() !== '' && block.chords.length > 0) {
    const starts = wordStarts(text)
    const chords = [...block.chords]
      .sort((a, b) => a.at - b.at)
      .map((chord, order) => ({ ...chord, at: starts[order] ?? text.length }))

    return replace(document, index, { ...block, text, chords })
  }

  /**
   * A line emptied of text still keeps its chords, which is what makes a bare chord
   * line — `[re] [la] [re]`, an intro — writable by deleting the words. They pile up
   * at nought and stay in the order they were.
   */
  return replace(document, index, {
    ...block,
    text,
    chords: shiftChords(block.chords, block.text, text),
  })
}

/** A tab's rows changed — rewritten wholesale, since there is nothing in them to shift. */
export function setTabRows(document: SongDocument, index: number, rows: string[]): SongDocument {
  const block = document.blocks[index]
  if (block === undefined || block.kind !== 'tab') return document
  return replace(document, index, { ...block, rows })
}

/**
 * Where a chord sitting at `at` ends up in the list once the line has been written
 * out and read back.
 *
 * The order is positional, so a new chord goes after any already at the same letter.
 * The editor needs this to keep pointing at the chord it just made while the user
 * types its name.
 */
export function chordIndexAt(chords: ChordAt[], at: number): number {
  return chords.filter((chord) => chord.at <= at).length
}

export function addChord(
  document: SongDocument,
  index: number,
  at: number,
  name = '',
): SongDocument {
  /**
   * A chord dropped on a still-blank row promotes it, the same way typing does
   * (see `setLineText`): an intro is written chords-first, and the toolbar's
   * Chord on a fresh line silently doing nothing was indistinguishable from
   * being broken.
   */
  const existing = document.blocks[index]
  const block =
    existing !== undefined && existing.kind === 'blank'
      ? { kind: 'lyrics' as const, text: '', chords: [] as ChordAt[] }
      : lyricsAt(document, index)
  if (block === null) return document

  const clamped = Math.max(0, Math.min(block.text.length, at))
  const chords = [...block.chords, { at: clamped, name }].sort((a, b) => a.at - b.at)

  return replace(document, index, { ...block, chords })
}

/**
 * A chord inserted between two others by order rather than by letter — the
 * gesture of a wordless line, and of the run past the last word: out there the
 * positions are all ties, so "where" can only mean "between which two". The new
 * chord takes the seat (`at`) of the chord it displaces — or the end of the
 * text when it goes last — and its place in the array is what writes it out
 * before that chord rather than after it. The new chord's index in the block is
 * the order itself, since the array comes back sorted.
 */
export function insertChordAmong(
  document: SongDocument,
  index: number,
  order: number,
  name = '',
): SongDocument {
  const block = lyricsAt(document, index)
  if (block === null) return document

  const chords = [...block.chords].sort((a, b) => a.at - b.at)
  const bounded = Math.max(0, Math.min(chords.length, order))
  chords.splice(bounded, 0, { at: chords[bounded]?.at ?? block.text.length, name })

  return replace(document, index, { ...block, chords })
}

export function setChord(
  document: SongDocument,
  index: number,
  chord: number,
  name: string,
): SongDocument {
  const block = lyricsAt(document, index)
  if (block === null || block.chords[chord] === undefined) return document

  // An emptied chord is a removed chord: that is how you take one off a syllable
  // without hunting for a separate button.
  if (name.trim() === '') return removeChord(document, index, chord)

  const chords = block.chords.map((entry, at) =>
    at === chord ? { ...entry, name: name.trim() } : entry,
  )
  return replace(document, index, { ...block, chords })
}

/**
 * Nudges a chord along its line, a letter at a time.
 *
 * Returns the chord's new index as well as the document, because moving one past
 * another changes which is first: the list is ordered by position, so the index the
 * caller was holding would quietly come to mean the other chord. The order is worked
 * out the same way writing and re-reading the line would — by position, ties in the
 * order they were already in.
 *
 * The letters run out at `text.length`, but the line does not: several chords
 * that all play after the last word are ties at that same position (see
 * `ChordAt.at`), and nudging one past `text.length` is how those get reordered —
 * one press sends it past every chord still tied there, since there is no unit
 * smaller than a letter to overtake them one at a time.
 */
export function moveChord(
  document: SongDocument,
  index: number,
  chord: number,
  delta: number,
): { document: SongDocument; chord: number } {
  const block = lyricsAt(document, index)
  if (block === null || block.chords[chord] === undefined) return { document, chord }

  return moveChordTo(document, index, chord, block.chords[chord].at + delta)
}

/**
 * Sets a chord straight down on a letter — the drop end of a drag, where the
 * finger names a destination rather than a direction. Same contract as the
 * nudge above: the new index comes back because landing on another chord's
 * letter can change which chord the caller's index means.
 */
export function moveChordTo(
  document: SongDocument,
  index: number,
  chord: number,
  at: number,
): { document: SongDocument; chord: number } {
  const block = lyricsAt(document, index)
  if (block === null || block.chords[chord] === undefined) return { document, chord }

  const clamped = Math.max(0, at)
  const chords = block.chords.map((entry, position) =>
    position === chord ? { ...entry, at: clamped } : entry,
  )

  const ordered = chords
    .map((entry, position) => ({ entry, position }))
    .sort((a, b) => a.entry.at - b.entry.at || a.position - b.position)

  return {
    document: replace(document, index, { ...block, chords }),
    chord: ordered.findIndex((entry) => entry.position === chord),
  }
}

export function removeChord(document: SongDocument, index: number, chord: number): SongDocument {
  const block = lyricsAt(document, index)
  if (block === null) return document

  return replace(document, index, {
    ...block,
    chords: block.chords.filter((_, at) => at !== chord),
  })
}

/** Enter in the middle of a line: the chords go with their side of the cut. */
export function splitLine(document: SongDocument, index: number, at: number): SongDocument {
  const block = document.blocks[index]
  if (block === undefined) return document

  const blocks = [...document.blocks]

  if (block.kind === 'lyrics') {
    const kept: ChordAt[] = []
    const moved: ChordAt[] = []

    for (const chord of block.chords) {
      // A chord exactly at the cut belongs to the syllable that follows it.
      if (chord.at < at) kept.push(chord)
      else moved.push({ ...chord, at: chord.at - at })
    }

    blocks.splice(
      index,
      1,
      { kind: 'lyrics', text: block.text.slice(0, at), chords: kept },
      { kind: 'lyrics', text: block.text.slice(at), chords: moved },
    )
  } else if (block.kind === 'comment') {
    blocks.splice(
      index,
      1,
      { ...block, text: block.text.slice(0, at) },
      { kind: 'lyrics', text: block.text.slice(at), chords: [] },
    )
  } else {
    blocks.splice(index + 1, 0, { kind: 'lyrics', text: '', chords: [] })
  }

  return { ...document, blocks }
}

/**
 * Backspace at the start of a line: it joins the one above.
 *
 * Between two lyric lines, or a lyric line and a still-blank one under it: a blank
 * line has no text and no chords of its own to bring along, so joining it in is
 * unambiguous — unlike merging into a comment or into `{soc}`, which would mean
 * silently deciding which of the two the result is.
 */
export function joinLines(document: SongDocument, index: number): SongDocument {
  const previous = lyricsAt(document, index - 1)
  const block = document.blocks[index]
  if (previous === null || block === undefined) return document
  if (block.kind !== 'lyrics' && block.kind !== 'blank') return document

  const current = block.kind === 'lyrics' ? block : { text: '', chords: [] as ChordAt[] }

  const blocks = [...document.blocks]
  blocks.splice(index - 1, 2, {
    kind: 'lyrics',
    text: previous.text + current.text,
    chords: [
      ...previous.chords,
      ...current.chords.map((chord) => ({ ...chord, at: chord.at + previous.text.length })),
    ],
  })

  return { ...document, blocks }
}

export function insertLineAfter(document: SongDocument, index: number, block?: Block): SongDocument {
  const blocks = [...document.blocks]
  blocks.splice(index + 1, 0, block ?? { kind: 'lyrics', text: '', chords: [] })
  return { ...document, blocks }
}

/**
 * A blank six-string guitar tab, ready to fill in — the instrument this app already
 * defaults to everywhere else a shape has to be drawn for one (`DEFAULT_GLOBAL_PREFS`
 * in `lib/prefs/types.ts`). Not tied to the reader's own instrument preference: that
 * is how a song is *read*, and has nothing to do with what a tab written into it is
 * *for* — the two can differ, and usually will not.
 */
const TAB_TEMPLATE_ROWS = [
  'e|--------------------------------------',
  'B|--------------------------------------',
  'G|--------------------------------------',
  'D|--------------------------------------',
  'A|--------------------------------------',
  'E|--------------------------------------',
]

/** Inserts a blank tab after `index`, the toolbar's "Tab" command. */
export function insertTab(document: SongDocument, index: number): SongDocument {
  return insertLineAfter(document, index, {
    kind: 'tab',
    startDirective: 'start_of_tab',
    endDirective: 'end_of_tab',
    rows: [...TAB_TEMPLATE_ROWS],
  })
}

export function removeLine(document: SongDocument, index: number): SongDocument {
  if (document.blocks.length <= 1) {
    return { ...document, blocks: [{ kind: 'lyrics', text: '', chords: [] }] }
  }

  return { ...document, blocks: document.blocks.filter((_, at) => at !== index) }
}

/**
 * A line of lyrics becomes a comment, or a comment becomes lyrics again.
 *
 * Turning a comment back into lyrics reads its text for chords, so pasting
 * `[la]assolo` into a comment and switching back does what it looks like.
 */
export function toggleComment(document: SongDocument, index: number): SongDocument {
  const block = document.blocks[index]
  if (block === undefined) return document

  if (block.kind === 'comment') {
    return replace(document, index, { kind: 'lyrics', text: block.text, chords: [] })
  }

  if (block.kind !== 'lyrics') return document

  // The chords are dropped, and the text they were above is kept: a comment has no
  // syllables to sit on. Written out so it is a decision, not an accident.
  return replace(document, index, { kind: 'comment', directive: 'c', text: block.text })
}

/** The run of lines around `index` that a section directive would wrap. */
function runAround(blocks: Block[], index: number): { from: number; to: number } {
  const stops = (block: Block | undefined) =>
    block === undefined || block.kind === 'blank' || block.kind === 'boundary'

  let from = index
  while (!stops(blocks[from - 1])) from -= 1

  let to = index
  while (!stops(blocks[to + 1])) to += 1

  return { from, to }
}

/**
 * Marks the block of lines around the cursor as a chorus or a bridge, or takes the
 * marking off if it is already there.
 *
 * The same button both ways: with `{soc}` already around these lines, pressing
 * *Ritornello* again removes it rather than nesting a second one — which the reader
 * would read as a chorus that never ends.
 */
export function toggleSection(
  document: SongDocument,
  index: number,
  section: 'chorus' | 'bridge',
): SongDocument {
  const { blocks } = document
  const current = sectionsOf(blocks)[index]

  if (current === section) {
    // Drop the boundaries that put these lines here.
    const start = findBoundary(blocks, index, -1)
    const end = findBoundary(blocks, index, 1)
    const kept = blocks.filter((_, at) => at !== start && at !== end)

    return { ...document, blocks: kept }
  }

  if (current !== 'verse') {
    // Inside the other kind of section: change what the boundaries say rather than
    // adding a second pair inside the first.
    const start = findBoundary(blocks, index, -1)
    const end = findBoundary(blocks, index, 1)

    const swapped = blocks.map((block, at) => {
      if (at !== start && at !== end) return block
      const edge = at === start ? ('start' as const) : ('end' as const)
      return {
        kind: 'boundary' as const,
        directive: DIRECTIVE_FOR[section][edge],
        edge,
        section,
      }
    })

    return { ...document, blocks: swapped }
  }

  const { from, to } = runAround(blocks, index)
  const wrapped = [
    ...blocks.slice(0, from),
    { kind: 'boundary' as const, directive: DIRECTIVE_FOR[section].start, edge: 'start' as const, section },
    ...blocks.slice(from, to + 1),
    { kind: 'boundary' as const, directive: DIRECTIVE_FOR[section].end, edge: 'end' as const, section },
    ...blocks.slice(to + 1),
  ]

  return { ...document, blocks: wrapped }
}

const DIRECTIVE_FOR = {
  chorus: { start: 'soc', end: 'eoc' },
  bridge: { start: 'sob', end: 'eob' },
} as const

/** The boundary directive that opens or closes the section `index` is in. */
function findBoundary(blocks: Block[], index: number, direction: -1 | 1): number {
  const wanted = direction === -1 ? 'start' : 'end'

  for (let at = index; at >= 0 && at < blocks.length; at += direction) {
    const block = blocks[at]
    if (block.kind === 'boundary' && block.edge === wanted) return at
  }

  return -1
}
