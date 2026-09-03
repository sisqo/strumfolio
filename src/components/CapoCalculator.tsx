'use client'

import { useMemo, useState } from 'react'

import { type Accidentals } from '@/lib/music/chord'
import { capoAdvice } from '@/lib/music/capoAdvice'
import { collectChordTokens } from '@/lib/music/sheet'
import { INSTRUMENTS, INSTRUMENT_LABEL, type Instrument } from '@/lib/music/shapes'

/**
 * The capo calculator: chords in, a fret per row, the recommended one lit.
 *
 * In the browser and storing nothing, like the other two tools, and for the reasons
 * `ChordProConverter` writes down once for all of them.
 *
 * Every rule is in `lib/music/capoAdvice.ts`, which is itself mostly `lib/music/capo.ts` —
 * the module the reading screen uses. That is deliberate to the point of being the feature:
 * this page and the app cannot recommend different frets for the same song, because there is
 * one implementation of «which fret leaves the most open shapes» and both call it.
 *
 * The input accepts a whole sheet or four chord names typed in a row: `collectChordTokens`
 * reads ChordPro, chords-above sheets, bar-line charts and comma-separated lists, because a
 * person who searched for a capo calculator usually has the chords in their head rather than
 * a file on their disk.
 */

/** Four chords, one of them a barre — the case a capo exists for. */
const SAMPLE = 'F Bb C Dm'

export function CapoCalculator() {
  const [text, setText] = useState('')
  const [instrument, setInstrument] = useState<Instrument>('guitar')
  const [accidentals, setAccidentals] = useState<Accidentals>('flat')

  const chords = useMemo(() => collectChordTokens(text), [text])
  const advice = useMemo(() => capoAdvice(chords, instrument, accidentals), [chords, instrument, accidentals])

  const found = advice.total > 0

  return (
    <div className="tool">
      <div className="tool-controls">
        <div className="tool-control">
          <span className="tool-control-label" id="capo-instrument-label">
            Instrument
          </span>

          <div className="tool-segments" role="group" aria-labelledby="capo-instrument-label">
            {INSTRUMENTS.map((choice) => (
              <button
                key={choice}
                type="button"
                className={`tool-segment${instrument === choice ? ' is-on' : ''}`}
                aria-pressed={instrument === choice}
                onClick={() => setInstrument(choice)}
              >
                {INSTRUMENT_LABEL[choice]}
              </button>
            ))}
          </div>
        </div>

        <div className="tool-control">
          <span className="tool-control-label" id="capo-accidentals-label">
            Write accidentals as
          </span>

          <div className="tool-segments" role="group" aria-labelledby="capo-accidentals-label">
            {(['sharp', 'flat'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                className={`tool-segment${accidentals === choice ? ' is-on' : ''}`}
                aria-pressed={accidentals === choice}
                onClick={() => setAccidentals(choice)}
                translate="no"
              >
                {choice === 'sharp' ? 'F#' : 'Gb'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="tool-pane">
        <div className="tool-pane-head">
          <label htmlFor="capo-input" className="tool-pane-label">
            Your chords, or the whole sheet
          </label>
          <button type="button" className="tool-link-button" onClick={() => setText(SAMPLE)}>
            Use an example
          </button>
        </div>

        <textarea
          id="capo-input"
          className="tool-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={SAMPLE}
          spellCheck={false}
          /* A browser translating this box would turn A into La and the paste into nonsense.
             Same rule as the sheet and the editor — see app/layout.tsx. */
          translate="no"
          rows={6}
        />
      </div>

      {found && (
        <>
          <p className="tool-verdict" aria-live="polite">
            {advice.best === null
              ? `${advice.total} ${advice.total === 1 ? 'chord' : 'chords'}, and no fret makes them easier — these shapes are already as open as they get on a ${INSTRUMENT_LABEL[instrument].toLowerCase()}.`
              : `${advice.total} ${advice.total === 1 ? 'chord' : 'chords'}. Capo on fret ${advice.best} leaves you ${advice.rows[advice.best].easy} of ${advice.total} in open shapes, against ${advice.rows[0].easy} with no capo — same sound, easier hands.`}
          </p>

          {/* A table and not a row of chips: there are three facts per fret — the fret, the
              count, and the chords you would read — and two of them are text. */}
          <div className="capo-table-wrap">
            <table className="capo-table">
              <caption className="capo-table-caption">
                What each fret does to your hands. The sound never changes — only the shapes do.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Capo</th>
                  <th scope="col">Open shapes</th>
                  <th scope="col">You would read</th>
                </tr>
              </thead>
              <tbody>
                {advice.rows.map((row) => (
                  <tr key={row.fret} className={row.fret === advice.best ? 'is-best' : undefined}>
                    <th scope="row">
                      {row.fret === 0 ? 'None' : `Fret ${row.fret}`}
                      {row.fret === advice.best && <span className="capo-badge">Best</span>}
                    </th>
                    <td className="capo-count">
                      <span translate="no">
                        {row.easy} / {row.total}
                      </span>
                    </td>
                    <td className="capo-chords" translate="no">
                      {row.chords.join('  ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!found && (
        <p className="tool-verdict" aria-live="polite">
          Type your chords above — <span translate="no">F Bb C Dm</span>, or a whole sheet pasted in — and every
          fret&apos;s answer appears here.
        </p>
      )}
    </div>
  )
}
