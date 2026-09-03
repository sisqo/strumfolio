'use client'

import { useMemo, useState } from 'react'

import { type Accidentals } from '@/lib/music/chord'
import { transposeSheet } from '@/lib/music/sheet'
import { clampSemitones } from '@/lib/prefs/types'

/**
 * The transposer: paste on the left, the same sheet in another key on the right.
 *
 * **In the browser, like the converter**, and for the same reasons written down in
 * `ChordProConverter`: somebody who arrived from a search has not signed in and may never
 * sign in, and a round trip would buy them a spinner and cost us the trust that gets the rest
 * of the page read. Nothing is uploaded and nothing is stored.
 *
 * The rules live in `lib/music/sheet.ts` — which line is a chord line, how a chord line keeps
 * its columns, what happens to `{key: …}` — because `npm test` here reaches a module and not
 * a component. This file is the controls and the wiring, and it is meant to stay that thin.
 *
 * `clampSemitones` is the app's own: transposition wraps at the octave, so the stepper runs
 * −5…+6 and not −11…+11, and the reason is written where the rule is rather than repeated
 * here.
 */

/**
 * The example behind «Use an example», and it is not the converter's.
 *
 * The converter's sample demonstrates *columns*, which is what it converts. This one has to
 * demonstrate transposition, so it is ChordPro — the layout that survives a key change
 * perfectly — and it holds one chord of each shape a reader will want to check: a minor, a
 * seventh, and a slash bass whose bass note has to move with the root.
 */
const SAMPLE = `{title: The Last Bus Home}
{key: Am}

[Am]The last bus home is [F]late
and I am [C]singing any[G]way
[Am]Nobody waits at the [E7]stop
and the [F]rain comes down on [G/B]top`

/**
 * What the reader gets told about the paste, in words rather than as a format name.
 *
 * The zero-step case is its own sentence because it is the state every visitor arrives in, and
 * «8 chords moved» would be a lie about a sheet nobody has transposed yet — the tool has read
 * the chords and is waiting to be told where to put them.
 */
function verdict(format: string, moved: number, crowded: boolean, semitones: number): string {
  if (moved === 0) {
    return 'No chords found yet — paste a sheet with chord names in it, or try the example.'
  }

  if (semitones === 0) {
    return `${moved} ${moved === 1 ? 'chord' : 'chords'} read. Step the key up or down, or switch ♯/♭ to respell them where they are.`
  }

  const counted = `${moved} ${moved === 1 ? 'chord' : 'chords'} moved.`

  if (format === 'chordpro') {
    return `${counted} ChordPro keeps every chord on its own syllable, so nothing else changed.`
  }

  if (crowded) {
    return `${counted} One chord name grew longer than the gap in front of the next one, so a column had to shift — check the lines where that happened.`
  }

  return `${counted} Every chord is still in the column it was in, above the same syllable.`
}

export function ChordTransposer() {
  const [text, setText] = useState('')
  const [semitones, setSemitones] = useState(0)
  const [accidentals, setAccidentals] = useState<Accidentals>('sharp')
  const [copied, setCopied] = useState(false)

  /* Recomputed on every keystroke and every step, which is affordable for the same reason the
   * converter's is: a pass over one song, not over a library. */
  const result = useMemo(
    () => (text.trim() === '' ? null : transposeSheet(text, semitones, accidentals)),
    [text, semitones, accidentals],
  )

  const output = result?.text ?? ''

  function step(by: number) {
    setSemitones((current) => clampSemitones(current + by))
    setCopied(false)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
    } catch {
      /* A browser that refuses clipboard access leaves the text selectable in the box, which
       * is the fallback that always works. */
      setCopied(false)
    }
  }

  function download() {
    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'song.chopro'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="tool">
      <div className="tool-controls">
        <div className="tool-control">
          <span className="tool-control-label" id="tool-steps-label">
            Transpose
          </span>

          {/* A group rather than three loose buttons, so a screen reader announces the
              stepper and its current value together instead of «minus, 2, plus». */}
          <div className="tool-stepper" role="group" aria-labelledby="tool-steps-label">
            <button type="button" className="tool-step" onClick={() => step(-1)} aria-label="Down one semitone">
              −
            </button>

            {/* `translate="no"`: a browser rewriting this as a note name would be rewriting a
                number of semitones into a chord. Same rule as the boxes below. */}
            <span className="tool-step-value" translate="no" aria-live="polite">
              {semitones > 0 ? `+${semitones}` : semitones}
            </span>

            <button type="button" className="tool-step" onClick={() => step(1)} aria-label="Up one semitone">
              +
            </button>
          </div>

          <span className="tool-control-note">semitones{semitones !== 0 && ' from the written key'}</span>
        </div>

        <div className="tool-control">
          <span className="tool-control-label" id="tool-accidentals-label">
            Write accidentals as
          </span>

          <div className="tool-segments" role="group" aria-labelledby="tool-accidentals-label">
            {(['sharp', 'flat'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                className={`tool-segment${accidentals === choice ? ' is-on' : ''}`}
                aria-pressed={accidentals === choice}
                onClick={() => {
                  setAccidentals(choice)
                  setCopied(false)
                }}
                translate="no"
              >
                {choice === 'sharp' ? 'F#' : 'Gb'}
              </button>
            ))}
          </div>

          <span className="tool-control-note">
            {accidentals === 'sharp' ? 'sharps, as in F#m' : 'flats, as in Bb'}
          </span>
        </div>
      </div>

      <div className="tool-panes">
        <div className="tool-pane">
          <div className="tool-pane-head">
            <label htmlFor="tool-input" className="tool-pane-label">
              Paste your chord sheet
            </label>
            <button
              type="button"
              className="tool-link-button"
              onClick={() => {
                setText(SAMPLE)
                setCopied(false)
              }}
            >
              Use an example
            </button>
          </div>

          <textarea
            id="tool-input"
            className="tool-input"
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setCopied(false)
            }}
            placeholder={SAMPLE}
            spellCheck={false}
            /* Chord names are one and two letters long; a browser translating this box would
               turn A into La and the paste into nonsense. Same rule as the sheet and the
               editor — see app/layout.tsx. */
            translate="no"
            rows={16}
          />
        </div>

        <div className="tool-pane">
          <div className="tool-pane-head">
            <span className="tool-pane-label">Transposed</span>

            {output !== '' && (
              <span className="tool-pane-actions">
                <button type="button" className="tool-link-button" onClick={copy}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button type="button" className="tool-link-button" onClick={download}>
                  Download
                </button>
              </span>
            )}
          </div>

          <textarea
            className="tool-input tool-output"
            value={output}
            readOnly
            spellCheck={false}
            translate="no"
            rows={16}
            placeholder="The transposed song appears here."
            aria-label="Transposed song"
          />
        </div>
      </div>

      {/* `aria-live` so the verdict is announced when it changes rather than only being
          visible — it is the one thing on the page that answers "did this work". */}
      <p className="tool-verdict" aria-live="polite">
        {result === null
          ? 'Paste a chord sheet above, or try the example, then step the key up or down.'
          : verdict(result.format, result.moved, result.crowded, semitones)}
      </p>
    </div>
  )
}
