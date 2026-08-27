import type { Fret } from './shapes'

/**
 * Where a chord chart draws a bar: one finger laid flat across several strings.
 *
 * Kept apart from the drawing (`ChordDiagram`) because it is a claim about how a hand
 * holds a shape, and claims can be tested — there is no React test runner here, so the
 * rule lives in a plain module and the component only turns the answer into rectangles.
 *
 * A bar is not simply "two strings on the same fret". It is what a player does when
 * separate fingers are not available, and that happens in exactly two ways:
 *
 * - **The other fingers are busy higher up the neck.** Every barre chord is this: the
 *   index lies across the lowest fretted fret because the rest of the hand is holding
 *   the shape above it — a guitar's `133211`, and a ukulele's F# `3121`, where the two
 *   strings at the first fret are not even adjacent and the finger has to pass under
 *   the one fretted at the second.
 * - **More strings share the fret than a hand would give fingers of their own.** Four
 *   strings at one fret is a bar on any instrument, even with nothing above it: `x02222`
 *   on a guitar and `1111` on a ukulele are one finger, not four.
 *
 * Three adjacent strings with nothing above them is neither, and that matters: it is
 * open A on a guitar (`x02220`) and D on a ukulele (`2220`), two of the first chords
 * anybody learns, and both are separate fingers. `isEasyShape` in `shapes.ts` makes the
 * same distinction from the other side and its comment says why — a test for "looks
 * like a barre" catches open A, so neither of these decides by looks alone.
 */
export interface Barre {
  /** The fret the finger lies across. */
  fret: number
  /** The first and last string it covers, in the order a chart draws them. */
  from: number
  to: number
}

/**
 * How many strings at one fret stop being fingers of their own.
 *
 * Four, both here and on a guitar: a hand has four fingers to place, and needing all
 * of them on a single fret is the point at which every chart draws a bar instead.
 */
const TOO_MANY_FINGERS = 4

/** How many strings in a row make a run worth drawing as a bar rather than as dots. */
const SHORTEST_RUN = 3

function stringsAt(frets: Fret[], fret: number): number[] {
  const found: number[] = []
  frets.forEach((value, string) => {
    if (value === fret) found.push(string)
  })
  return found
}

/**
 * Whether a string between these two has to keep ringing open.
 *
 * A flat finger cannot leave one: this is what stops Em6 (`022020`) being drawn with a
 * bar from the A string to the B, which would press the open G in the middle of it. A
 * *muted* string inside the span is the opposite case and passes — it is usually silent
 * precisely because the finger lying across it damps it.
 */
function openInside(frets: Fret[], from: number, to: number): boolean {
  for (let string = from + 1; string < to; string += 1) {
    if (frets[string] === 0) return true
  }
  return false
}

/**
 * The bars in a shape, lowest fret first.
 *
 * Usually one, sometimes two. The second is the ring finger of a movable form played
 * from the fifth string — a guitar's B major `x24442` is an index bar at the second
 * fret and a ring bar at the fourth, and a ukulele's E `4442` is the same hand shape
 * with the bar on top and one finger below it. Any fret above the lowest with three or
 * more strings in a row on it is that finger; a run of two is not, which is what keeps
 * the fifth and sixth strings of `133211` as the two separate fingers they are.
 */
export function barresOf(frets: Fret[]): Barre[] {
  const fretted = frets.filter((fret): fret is number => fret !== null && fret > 0)
  if (fretted.length === 0) return []

  const lowest = Math.min(...fretted)
  const highest = Math.max(...fretted)
  const found: Barre[] = []

  const onLowest = stringsAt(frets, lowest)
  const from = onLowest[0]
  const to = onLowest[onLowest.length - 1]
  if (
    onLowest.length >= 2 &&
    !openInside(frets, from, to) &&
    (highest > lowest || onLowest.length >= TOO_MANY_FINGERS)
  ) {
    found.push({ fret: lowest, from, to })
  }

  for (let fret = lowest + 1; fret <= highest; fret += 1) {
    let start: number | null = null

    // One past the end, so a run that reaches the last string is closed too.
    for (let string = 0; string <= frets.length; string += 1) {
      if (frets[string] === fret) {
        if (start === null) start = string
        continue
      }
      if (start !== null && string - start >= SHORTEST_RUN) {
        found.push({ fret, from: start, to: string - 1 })
      }
      start = null
    }
  }

  return found
}

/** Whether a bar already covers this string at this fret, so no dot belongs on it. */
export function underBarre(barres: Barre[], string: number, fret: number): boolean {
  return barres.some((barre) => barre.fret === fret && string >= barre.from && string <= barre.to)
}
