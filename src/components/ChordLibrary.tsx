import Link from 'next/link'

import { ChordDiagram } from '@/components/ChordDiagram'
import { chordLibrary } from '@/lib/music/chordLibrary'
import { INSTRUMENTS, INSTRUMENT_LABEL, type Instrument } from '@/lib/music/shapes'

/**
 * The chord chart: every root, every chord type this app can draw, as a box with the
 * fingering and the notes under it.
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
 * for in a browser. Anything interactive added later has to work over what is already in
 * the DOM.
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
            {group.chords.map((chord) => (
              <li key={chord.family} className="chord-chart-card">
                <p className="chord-chart-name" translate="no">
                  {chord.name}
                </p>
                <p className="chord-chart-label">{chord.label}</p>

                {chord.shape === null ? (
                  /* A real answer and not a gap: four strings cannot hold every chord, and
                     the notes underneath are then the whole card. */
                  <p className="chord-chart-none">No shape on four strings</p>
                ) : (
                  <ChordDiagram shape={chord.shape} className="chord-diagram chord-chart-shape" />
                )}

                {chord.fingering !== null && (
                  <p className="chord-chart-fingering" translate="no">
                    {chord.fingering}
                  </p>
                )}

                <p className="chord-chart-notes" translate="no">
                  {chord.notes.join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
