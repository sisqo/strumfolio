/**
 * The arithmetic behind dragging a song into another place.
 *
 * Kept out of the component because it is the part that can be wrong in ways no
 * screenshot shows: an off-by-one here silently files a song one row from where the
 * finger let go, and that is exactly the kind of thing a test can pin down and an
 * eye cannot.
 */

/** Moves one item to another index, leaving everything else in its relative order. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items

  const target = Math.max(0, Math.min(items.length - 1, to))
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(target, 0, moved)
  return next
}

/**
 * Whether two lists hold the same members, in any order.
 *
 * Counts occurrences rather than comparing sets, which is the whole reason it is a
 * function and not two `new Set(...)` calls at the call site: `[a, a]` and `[a, b]` are
 * the same size and hold the same number of distinct values, and one of them is a
 * proposal that would drop a song.
 *
 * Generic over the member type since v2.3, because sections are numbers.
 */
export function sameMembers<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false

  const counts = new Map<T, number>()
  for (const entry of a) counts.set(entry, (counts.get(entry) ?? 0) + 1)

  for (const entry of b) {
    const seen = counts.get(entry)
    if (seen === undefined || seen === 0) return false
    counts.set(entry, seen - 1)
  }

  return true
}

/**
 * Puts a saved order back into the flat list the whole screen is drawn from.
 *
 * That list holds every song, of every songbook, and the reorder only spoke for
 * one of them. So the slots the named songs already occupy are kept and refilled in
 * the new order: whatever sits between them — a song of another songbook, which
 * nothing here should move — stays exactly where it was.
 *
 * It rearranges exactly the names it is given and asks no questions about the rest,
 * because it cannot answer them: whether a song missing from the order belongs to the
 * same songbook is known on the server, and that is where a partial order is
 * refused. What it does refuse is a name the list has not got, which would otherwise
 * mean dropping a row to make the count fit.
 */
export function applyOrder<T extends { slug: string }>(items: T[], order: string[]): T[] {
  const wanted = new Set(order)
  const slots = items.flatMap((item, index) => (wanted.has(item.slug) ? [index] : []))
  if (slots.length !== order.length) return items

  const byslug = new Map(items.map((item) => [item.slug, item]))
  const moved = order.map((slug) => byslug.get(slug))
  if (moved.some((item) => item === undefined)) return items

  const next = [...items]
  slots.forEach((slot, index) => {
    next[slot] = moved[index] as T
  })
  return next
}

/** A song already in the songbook, in the order the list shows it. */
export interface Placed {
  slug: string
  position: number | null
}

/**
 * Where songs arriving in a section go: after the ones already there, in the
 * order they arrived.
 *
 * Importing three songs and finding them alphabetised is not what pasting them in
 * an order means, so an imported song is *placed* rather than left unplaced. But a
 * place among unplaced songs is meaningless — null sorts last, so a numbered
 * newcomer would leap to the front of a section nobody has arranged. Hence the
 * two cases: if the section is already numbered 1..N the newcomers simply carry
 * on from N, and otherwise the whole thing is numbered first, in the order it is
 * being shown right now. Either way what was on screen keeps its order and the new
 * songs land under it.
 *
 * `existing` must arrive in display order — `position` first, then title, which is
 * how every query here reads it. Any other order would renumber the section into
 * an order nobody asked for. It was the whole songbook until v2.3, and the
 * arithmetic did not change with it: `position` simply counts within a section now.
 */
export function placeAfter(
  existing: Placed[],
  added: string[],
): { slug: string; position: number }[] {
  const tidy = existing.every((entry, index) => entry.position === index + 1)

  if (tidy) {
    return added.map((slug, index) => ({ slug, position: existing.length + index + 1 }))
  }

  return [...existing.map((entry) => entry.slug), ...added].map((slug, index) => ({
    slug,
    position: index + 1,
  }))
}

/**
 * A songbook's layout: its sections in order, each holding its songs in order.
 *
 * The shape the whole arrangement travels in — from the rows on screen to the single
 * action that writes it — because a song dragged across a section heading changes where
 * it came from, where it went and which section it is in, and those three are one fact.
 */
export interface ArrangedSection {
  sectionId: number
  slugs: string[]
}

/** Somewhere a song can sit: which section, and which place inside it. */
export interface Place {
  sectionId: number
  /** Index in that section's songs *without* the song being moved. */
  index: number
}

/**
 * One line of the arrangement as it is drawn and as it is measured.
 *
 * The component renders from this list and the drag measures this list, which is the
 * property that matters: the bands the finger is compared against are the rows the eye
 * is looking at, and neither can drift from the other. A section with no songs still
 * gets a line — `gap` — because a section nothing can be dropped into is a section that
 * can never be filled.
 */
export type ArrangeRow =
  | { kind: 'section'; sectionId: number }
  | { kind: 'song'; sectionId: number; slug: string }
  | { kind: 'gap'; sectionId: number }

export function rowsOf(groups: ArrangedSection[]): ArrangeRow[] {
  return groups.flatMap((group) => [
    { kind: 'section' as const, sectionId: group.sectionId },
    ...(group.slugs.length === 0
      ? [{ kind: 'gap' as const, sectionId: group.sectionId }]
      : group.slugs.map((slug) => ({ kind: 'song' as const, sectionId: group.sectionId, slug }))),
  ])
}

/**
 * Where a song let go in gap `slot` of the drawn rows lands — `slot` as `slotAt` counts
 * them: 0 above the first row, `rows.length` below the last.
 *
 * The section is the one the row just above the gap belongs to, so a heading is the
 * boundary between two sections and nothing more: the gap over it is the end of the
 * section before, the gap under it the start of its own. That is what lets a song be
 * carried to the *end* of another section, a place the row-under-the-finger reading of
 * this used to have no way to name — over a song meant above it, over the next heading
 * meant the top of the next section, and the gap between the two answered to nothing.
 *
 * The index counts the section's other songs above the gap, with the moving song left
 * out of the count wherever its own row happens to be drawn. Both gaps around that row
 * therefore name the place it already holds, which is the dead zone a sortable list is
 * meant to have: a finger that has not yet reached the middle of a neighbour has not
 * asked for anything.
 */
export function placeAtSlot(rows: ArrangeRow[], moving: string, slot: number): Place | null {
  if (rows.length === 0) return null

  const gap = Math.max(0, Math.min(rows.length, slot))
  const above = rows[gap - 1]
  const sectionId = above === undefined ? rows[0].sectionId : above.sectionId

  const index = rows
    .slice(0, gap)
    .filter((row) => row.kind === 'song' && row.sectionId === sectionId && row.slug !== moving)
    .length

  return { sectionId, index }
}

/**
 * Every place a song could be put, in the order they appear on screen.
 *
 * One per gap between rows, including the end of each section — so a section's last
 * place and the next section's first are two different answers even though they are the
 * same gap on screen, and stepping through them with the arrow keys crosses the heading
 * one press at a time.
 */
export function placesOf(groups: ArrangedSection[], moving: string): Place[] {
  return groups.flatMap((group) => {
    const others = group.slugs.filter((slug) => slug !== moving).length
    return Array.from({ length: others + 1 }, (_, index) => ({
      sectionId: group.sectionId,
      index,
    }))
  })
}

/** Where a song sits now, in the terms `placesOf` uses. Null if it is nowhere. */
export function placeOf(groups: ArrangedSection[], slug: string): Place | null {
  for (const group of groups) {
    const index = group.slugs.indexOf(slug)
    if (index !== -1) return { sectionId: group.sectionId, index }
  }
  return null
}

/** Moves one song to a place, leaving every other song in its relative order. */
export function moveSongTo(
  groups: ArrangedSection[],
  slug: string,
  place: Place,
): ArrangedSection[] {
  if (placeOf(groups, slug) === null) return groups

  const next = groups.map((group) => ({
    sectionId: group.sectionId,
    slugs: group.slugs.filter((entry) => entry !== slug),
  }))

  const target = next.find((group) => group.sectionId === place.sectionId)
  if (target === undefined) return groups

  target.slugs.splice(Math.max(0, Math.min(target.slugs.length, place.index)), 0, slug)
  return next
}

/**
 * One step up or down for a song, crossing into the next section when it runs out of
 * places in its own. What the arrow keys do, so the list can be arranged without a
 * pointer at all.
 */
export function nudgeSong(
  groups: ArrangedSection[],
  slug: string,
  delta: number,
): ArrangedSection[] {
  const current = placeOf(groups, slug)
  if (current === null) return groups

  const places = placesOf(groups, slug)
  const at = places.findIndex(
    (place) => place.sectionId === current.sectionId && place.index === current.index,
  )
  const next = places[at + delta]

  return at === -1 || next === undefined ? groups : moveSongTo(groups, slug, next)
}

/** A layout as one string, for asking whether two of them are the same. */
export function arrangementKey(groups: ArrangedSection[]): string {
  return groups.map((group) => `${group.sectionId}:${group.slugs.join(',')}`).join('\n')
}

/**
 * A row's vertical extent in page coordinates — `getBoundingClientRect` plus the scroll
 * position at the time — as it was measured before anything moved.
 *
 * Page coordinates and not viewport ones, because the page scrolls during a drag: a
 * mouse wheel turns, or the finger parks near an edge and the list is scrolled under
 * it. A band measured in viewport terms would then describe where a row *was* on the
 * screen, and a pointer compared against it would be filing songs a whole scroll's
 * distance from where it is pointing.
 */
export interface Band {
  top: number
  bottom: number
}

/**
 * Which gap between rows a pointer at page `y` is in: the number of rows whose middle is
 * above it, so 0 is above the first row and `bands.length` below the last.
 *
 * The bands are measured once, when the drag starts, and are *not* re-measured as the
 * rows move under the finger. That is deliberate: the rows are reordered live, so
 * measuring again would move the very boundaries the pointer is being compared against,
 * and the list would oscillate between two orders while the finger sat still. Fixed
 * bands mean the finger has to travel to the middle of a neighbour to displace it,
 * which is also what it looks like it should do.
 *
 * Rows are not all the same height — a song with an artist is taller than one without —
 * so this counts middles rather than dividing by a row height.
 */
export function slotAt(bands: Band[], y: number): number {
  return bands.filter((band) => y >= (band.top + band.bottom) / 2).length
}

/**
 * Moves the item at `from` into gap `slot` of the list as it was drawn — with the item
 * still in it — leaving everything else in its relative order. A gap below the item's
 * own row is one index further along than the place it names once the item is lifted
 * out, which is the whole of the arithmetic here.
 */
export function moveToSlot<T>(items: T[], from: number, slot: number): T[] {
  return moveItem(items, from, slot > from ? slot - 1 : slot)
}

/**
 * The layout of a songbook, read off the two lists a screen already has: its sections,
 * and the songs in the order the index holds them.
 *
 * Both the reading list and the arrange mode derive it this way, which is the point of it
 * being here: the groups the eye sees and the groups the drag arithmetic works on come
 * from one function, so they cannot disagree. Songs whose section is not among those
 * given are simply not in the layout — the way a song of another songbook is not.
 */
export function arrangementOf(
  divisions: { id: number }[],
  rows: { slug: string }[],
  assignments: Record<string, number>,
): ArrangedSection[] {
  return divisions.map((section) => ({
    sectionId: section.id,
    slugs: rows.filter((row) => assignments[row.slug] === section.id).map((row) => row.slug),
  }))
}
