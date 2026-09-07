import Link from 'next/link'

import { ChordChartPicker } from '@/components/ChordChartPicker'
import { ChordDiagram } from '@/components/ChordDiagram'
import { chordLibrary } from '@/lib/music/chordLibrary'
import { INSTRUMENTS, INSTRUMENT_LABEL, type Instrument } from '@/lib/music/shapes'

/**
 * The chord chart: every root, every chord type this app can draw, as a box with the
 * fingering and the notes under it — and, behind each box, every other shape for that
 * chord.
 *
 * **One instrument per page, and a switch between the two.** Not a control that redraws in
 * place, which is what the other tools do: a guitarist and a ukulele player are looking for
 * two different documents, they arrive from two different searches, and each wants a URL
 * that stays what it was when they send it to somebody. So the switch is two links, the
 * active one is a plain `<span>` — a link to the page you are already on is a dead control,
 * the same reasoning `SiteHeader`'s pill is built on — and the pages are two files that
 * differ in one word.
 *
 * **A server component, deliberately, and it must stay one.** Every shape here comes out of
 * `chordLibrary`, and on a ukulele that is two hundred and sixteen searches of about
 * thirteen thousand fingerings each: a fifth of a second at build time, where it happens
 * once, and a fifth of a second of blocked main thread on a phone if this were ever asked
 * for in a browser. `ChordChartPicker` is the one client component on the page and it
 * recomputes nothing — it is handed what was worked out here, and the boxes it pages
 * through are drawn from fret numbers rather than searched for again.
 *
 * **One box per card, not all of them.** The alternatives exist for every chord and are
 * carried in the data, but drawing them inline would put 841 diagrams on the ukulele page
 * where there are now 216, on a page whose whole job is to be scanned. They live one tap
 * away instead, which is also the gesture the reading screen uses for the same thing.
 *
 * **Every chord name and every fingering is `translate="no"`.** The rule this repo settled
 * on is that the surface printing a chord name marks itself, and a page that is *nothing
 * but* chord names is the strongest case there is — a browser rewriting `A` to `La` across
 * two hundred cards would leave a chart of an instrument nobody plays. The labels beside
 * them («Minor seventh») are prose and are left alone.
 */

/** Where each instrument's chart lives. The switch and both pages' canonicals read it. */
export const CHORD_CHART_PATH: Record<Instrument, string> = {
  guitar: '/tools/guitar-chords',
  ukulele: '/tools/ukulele-chords',
}

export function ChordLibrary({ instrument }: { instrument: Instrument }) {
  const groups = chordLibrary(instrument)

  /*
   * The cards again, flat, as `ChordChartPicker` addresses them: a card's button carries
   * its position in this array and nothing else. Keyed on the card object rather than
   * recomputed from the two loop counters — the same objects are rendered below, so
   * identity is exact and cannot drift the way `group * 18 + chord` would the day a root
   * or a family is added.
   */
  const cards = groups.flatMap((group) => group.chords)
  const positionOf = new Map(cards.map((card, index) => [card, index]))

  return (
    <div className="tool">
      <div className="tool-controls">
        <div className="tool-control">
          <span className="tool-control-label" id="chord-chart-instrument-label">
            Instrument
          </span>

          <nav className="tool-segments" aria-labelledby="chord-chart-instrument-label">
            {INSTRUMENTS.map((choice) =>
              choice === instrument ? (
                <span key={choice} className="tool-segment is-on" aria-current="page">
                  {INSTRUMENT_LABEL[choice]}
                </span>
              ) : (
                <Link key={choice} href={CHORD_CHART_PATH[choice]} className="tool-segment">
                  {INSTRUMENT_LABEL[choice]}
                </Link>
              ),
            )}
          </nav>
        </div>
      </div>

      {/* Twelve roots is a long page, so the way in is a row of them. Anchors rather than a
          filter: it costs no JavaScript, it survives find-in-page, and every chord stays on
          the one URL somebody can send. */}
      <nav className="chord-chart-jump" aria-label="Jump to a root note">
        {groups.map((group) => (
          <a key={group.id} href={`#${group.id}`} className="chord-chart-jump-link" translate="no">
            {group.root.name}
          </a>
        ))}
      </nav>

      <ChordChartPicker cards={cards}>
        {groups.map((group) => (
          <section key={group.id} id={group.id} className="chord-chart-group">
            <h2 className="chord-chart-root">
              <span translate="no">{group.root.name}</span>
              {group.root.alias !== null && (
                <span className="chord-chart-root-alias">
                  also written <span translate="no">{group.root.alias}</span>
                </span>
              )}
            </h2>

            <ul className="chord-chart-grid">
              {group.chords.map((chord) => {
                const [shape] = chord.shapes
                const count = chord.shapes.length

                return (
                  <li key={chord.family} className="chord-chart-card">
                    <p className="chord-chart-name" translate="no">
                      {chord.name}
                    </p>
                    <p className="chord-chart-label">{chord.label}</p>

                    {shape === undefined ? (
                      /* A real answer and not a gap: four strings cannot hold every chord,
                         and the notes underneath are then the whole card. Nothing to open
                         either, so this one card in the chart is not a button. */
                      <p className="chord-chart-none">No shape on four strings</p>
                    ) : (
                      /*
                       * The box is the button, rather than an invisible one stretched over
                       * the whole card: a chart is a page people copy a fingering off, and
                       * a transparent layer across the card would take the text selection
                       * with it. It carries no handler — `ChordChartPicker` listens above
                       * it and reads `data-chord`.
                       */
                      <button
                        type="button"
                        className="chord-chart-open"
                        data-chord={positionOf.get(chord)}
                        aria-label={
                          count > 1
                            ? `${chord.name}: see all ${count} shapes`
                            : `${chord.name}: see this shape larger`
                        }
                      >
                        <ChordDiagram shape={shape} className="chord-diagram chord-chart-shape" />
                      </button>
                    )}

                    {shape !== undefined && (
                      <p className="chord-chart-fingering" translate="no">
                        {shape.fingering}
                      </p>
                    )}

                    <p className="chord-chart-notes" translate="no">
                      {chord.notes.join(' · ')}
                    </p>

                    {/* Only where there is something behind the box. On a guitar that is
                        204 cards of the 216 and on a ukulele 213, so the line has to stay
                        quiet enough to be ignored by somebody scanning past it. */}
                    {count > 1 && <p className="chord-chart-more">{count} shapes</p>}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </ChordChartPicker>
    </div>
  )
}
