'use client'

import { useMetronomeControls } from '@/components/MetronomeProvider'
import { BEATS_PER_BAR_OPTIONS, MAX_BPM, MIN_BPM } from '@/lib/metronome/tempo'

/**
 * What the metronome beats, as a set of controls with no frame of its own.
 *
 * Rendered in two places, and shared rather than written twice for the reason this repo
 * already states about the install row and the booklet's key: two surfaces that say the
 * same thing drift the first time one is edited. The Tempo chip under the song title opens
 * one of them, the metronome's own button in the reading bar opens the other, and both read
 * the same context — so they cannot disagree about the number even for a frame.
 *
 * Two ways to move that number, and both earn their place: the steppers are for the last
 * few beats — a song that is nearly right at 94 — and the track is for getting somewhere
 * else entirely, which is the lesson the scroll speed learned when it was eight dots and
 * reaching the far end cost seven taps mid-song.
 */
export function TempoControls() {
  const { bpm, beatsPerBar, chosen, barChosen, songTempo, setBpm, setBeatsPerBar } =
    useMetronomeControls()

  /* The five the menu offers, plus this song's own bar when it is not one of them —
     `{time: 5/4}` is a real song, and a row of five buttons with none of them lit is a
     control that looks broken. */
  const bars = BEATS_PER_BAR_OPTIONS.map((entry) => entry as number)
  const options = bars.includes(beatsPerBar) ? bars : [...bars, beatsPerBar].sort((a, b) => a - b)

  return (
    <>
      <div className="tempo-row">
        <button
          type="button"
          className="tempo-step"
          onClick={() => setBpm(bpm - 1)}
          disabled={bpm <= MIN_BPM}
          aria-label="One beat per minute slower"
        >
          −
        </button>

        <span className="tempo-value" aria-hidden>
          {bpm}
        </span>

        <button
          type="button"
          className="tempo-step"
          onClick={() => setBpm(bpm + 1)}
          disabled={bpm >= MAX_BPM}
          aria-label="One beat per minute faster"
        >
          +
        </button>
      </div>

      <input
        type="range"
        className="speed-range zoom-range tempo-range"
        min={MIN_BPM}
        max={MAX_BPM}
        step={1}
        value={bpm}
        onChange={(event) => setBpm(Number(event.target.value))}
        aria-label="Tempo"
        aria-valuetext={`${bpm} beats per minute`}
        style={
          {
            '--fill': `${((bpm - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 100}%`,
          } as React.CSSProperties
        }
      />

      <div className="chip-menu-head mt-3">
        <span className="control-name-label">Accent</span>
        <span className="chip-menu-head-hint">one beat in</span>
      </div>

      <span className="segment mt-2 w-full" role="group" aria-label="How often the metronome accents">
        {options.map((entry) => (
          <button
            key={entry}
            type="button"
            className={entry === beatsPerBar ? 'segment-button is-on flex-1' : 'segment-button flex-1'}
            aria-pressed={entry === beatsPerBar}
            /* One in a bar of one is every beat accented, which sounds exactly like no
               accent at all — so that is what it is called, and there is no sixth button
               meaning «off». */
            aria-label={entry === 1 ? 'No accent' : `Accent one beat in ${entry}`}
            onClick={() => setBeatsPerBar(entry)}
          >
            {entry === 1 ? 'None' : entry}
          </button>
        ))}
      </span>

      {(chosen || barChosen) && (
        <button
          type="button"
          className="tempo-reset"
          onClick={() => {
            setBpm(null)
            setBeatsPerBar(null)
          }}
        >
          {songTempo === null
            ? 'Forget this tempo — the song does not say one'
            : `Back to the song’s own ${songTempo}`}
        </button>
      )}
    </>
  )
}
