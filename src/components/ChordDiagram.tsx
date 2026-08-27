import { barresOf, underBarre } from '@/lib/music/barre'
import type { ChordShape } from '@/lib/music/shapes'

/**
 * A chord box: a string per string, five frets, a dot where a finger goes.
 *
 * How many strings comes from the shape itself, so the same component draws a
 * guitar's six and a ukulele's four without being told which it is holding.
 *
 * Drawn as SVG with `currentColor` so it belongs to whichever theme is on, and
 * sized in `em` so the dialog controls how big it is.
 */

const STRING_GAP = 16
const FRET_GAP = 22
const LEFT = 14
const TOP = 26
const FRETS_SHOWN = 5

const BOTTOM = TOP + FRET_GAP * FRETS_SHOWN

export function ChordDiagram({
  shape,
  capo = 0,
  className = 'chord-diagram',
}: {
  shape: ChordShape
  capo?: number
  /**
   * The popup's own size by default. The sheet's inline shapes (`SheetChord`) pass
   * `sheet-chord-shape` instead — a full replacement, not an addition, since the two
   * are sized for entirely different places: a modal versus a slot above a syllable.
   */
  className?: string
}) {
  const RIGHT = LEFT + STRING_GAP * (shape.frets.length - 1)
  const fretted = shape.frets.filter((fret): fret is number => fret !== null && fret > 0)
  const lowest = fretted.length === 0 ? 1 : Math.min(...fretted)
  const highest = fretted.length === 0 ? 1 : Math.max(...fretted)

  /**
   * Where the window starts. Anything reachable inside the first four frets is
   * drawn at the nut, which is how the shape is recognised; higher up the window
   * slides and says which fret it starts on.
   */
  const atNut = highest <= FRETS_SHOWN - 1
  const base = atNut ? 1 : lowest

  /**
   * One finger across several strings — usually one bar, sometimes two. Without them
   * an F#m reads as six separate fingers at two different frets, and a ukulele's F#
   * (`3121`) as three fingers that no hand could place. Which strings a bar covers,
   * and whether a shape has one at all, is `barresOf`'s question: it is a claim about
   * how a hand holds the shape, so it lives in a tested module rather than here.
   */
  const barres = barresOf(shape.frets)

  const y = (fret: number) => TOP + FRET_GAP * (fret - base) + FRET_GAP / 2

  return (
    <svg
      viewBox={`0 0 ${RIGHT + LEFT} ${BOTTOM + 8}`}
      className={className}
      role="img"
      aria-hidden
      focusable="false"
    >
      {/*
        * The nut, or a plain fret when the window has moved up the neck. The same line
        * either way with a capo on: the shape is unchanged, because a capo makes a new nut
        * and the C shape behind it is still the C shape — what is drawn differently is the
        * fret named beside it, in the accent colour. Without that, an open shape and the
        * same shape behind a capo are the same picture.
        *
        * The nut used to take the accent colour itself. It cannot: a bar at the first fret
        * lands a few pixels below this line, and two accent horizontals that close together
        * read as one thick capo instead of a capo with a finger behind it. See
        * `.chord-diagram-capo`, which now colours the number.
        */}
      <line
        x1={LEFT}
        y1={TOP}
        x2={RIGHT}
        y2={TOP}
        strokeWidth={atNut ? 4 : 1.2}
        strokeLinecap="butt"
      />

      {atNut && capo > 0 && (
        <text
          x={LEFT - 5}
          y={TOP - 4}
          className="chord-diagram-fret chord-diagram-capo"
          textAnchor="end"
        >
          {capo}
        </text>
      )}

      {Array.from({ length: FRETS_SHOWN }, (_, index) => (
        <line
          key={index}
          x1={LEFT}
          y1={TOP + FRET_GAP * (index + 1)}
          x2={RIGHT}
          y2={TOP + FRET_GAP * (index + 1)}
          strokeWidth={1.2}
        />
      ))}

      {shape.frets.map((_, string) => (
        <line
          key={string}
          x1={LEFT + STRING_GAP * string}
          y1={TOP}
          x2={LEFT + STRING_GAP * string}
          y2={BOTTOM}
          strokeWidth={1.2}
        />
      ))}

      {!atNut && (
        <text x={LEFT - 5} y={TOP + FRET_GAP * 0.72} className="chord-diagram-fret" textAnchor="end">
          {base}
        </text>
      )}

      {barres.map((barre) => (
        <rect
          key={`${barre.fret}:${barre.from}`}
          x={LEFT + STRING_GAP * barre.from - 6}
          y={y(barre.fret) - 6}
          width={STRING_GAP * (barre.to - barre.from) + 12}
          height={12}
          rx={6}
          className="chord-diagram-dot"
          stroke="none"
        />
      ))}

      {shape.frets.map((fret, string) => {
        const x = LEFT + STRING_GAP * string

        // Already covered by a bar — including a string the bar only passes under,
        // whose own dot is at some higher fret and is drawn there.
        if (fret !== null && underBarre(barres, string, fret)) return null

        if (fret === null) {
          return (
            <g key={string} className="chord-diagram-mute">
              <line x1={x - 4} y1={TOP - 15} x2={x + 4} y2={TOP - 7} strokeWidth={1.6} />
              <line x1={x - 4} y1={TOP - 7} x2={x + 4} y2={TOP - 15} strokeWidth={1.6} />
            </g>
          )
        }

        if (fret === 0) {
          return (
            <circle
              key={string}
              cx={x}
              cy={TOP - 11}
              r={4}
              fill="none"
              strokeWidth={1.6}
              className="chord-diagram-open"
            />
          )
        }

        return (
          <circle
            key={string}
            cx={x}
            cy={y(fret)}
            r={6}
            className="chord-diagram-dot"
            stroke="none"
          />
        )
      })}
    </svg>
  )
}
