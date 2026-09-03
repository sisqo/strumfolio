'use client'

import { useMemo, useState } from 'react'

import {
  finishTime,
  formatDuration,
  formatSpoken,
  parseClockTime,
  readSetlist,
  setlistTotals,
} from '@/lib/tools/setlist'

/**
 * The setlist calculator: a list in, a running time and a finish time out.
 *
 * Every rule is in `lib/tools/setlist.ts` — what counts as a written length, how many gaps a
 * set has, how a clock wraps past midnight — because `npm test` reaches that and not this.
 * What is left here is the four controls and the table.
 *
 * In the browser, storing nothing, like both other tools. A setlist is a more private
 * document than it looks: it names what a band can play and when they are on stage.
 */

/** Defaults chosen to be *typical*, not round: four minutes a song, half a minute between. */
const DEFAULT_LENGTH = 240
const DEFAULT_GAP = 30

const SAMPLE = `The Last Bus Home 3:45
Danny Boy 4:10
Wild Mountain Thyme
Black is the Colour 5:20
Interlude 2
The Parting Glass 3:05`

/** Song lengths worth offering, in seconds — the range a three-chord song and a jam sit in. */
const LENGTHS = [150, 180, 210, 240, 270, 300, 360]

/** Gaps worth offering, in seconds: tuning, a word to the room, a real pause. */
const GAPS = [0, 15, 30, 45, 60, 90, 120]

export function SetlistCalculator() {
  const [text, setText] = useState('')
  const [songLength, setSongLength] = useState(DEFAULT_LENGTH)
  const [gap, setGap] = useState(DEFAULT_GAP)
  const [start, setStart] = useState('21:00')

  const songs = useMemo(() => readSetlist(text), [text])
  const totals = useMemo(() => setlistTotals(songs, songLength, gap), [songs, songLength, gap])

  const startMinutes = parseClockTime(start)
  const finish = startMinutes === null ? null : finishTime(startMinutes, totals.totalSeconds)

  const unreadable = songs.filter((song) => song.unreadable).length

  return (
    <div className="tool">
      <div className="tool-controls">
        <div className="tool-control">
          <label className="tool-control-label" htmlFor="setlist-length">
            A song with no length
          </label>
          <select
            id="setlist-length"
            className="tool-select"
            value={songLength}
            onChange={(event) => setSongLength(Number(event.target.value))}
          >
            {LENGTHS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {formatDuration(seconds)}
              </option>
            ))}
          </select>
        </div>

        <div className="tool-control">
          <label className="tool-control-label" htmlFor="setlist-gap">
            Between songs
          </label>
          <select
            id="setlist-gap"
            className="tool-select"
            value={gap}
            onChange={(event) => setGap(Number(event.target.value))}
          >
            {GAPS.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds === 0 ? 'No gap' : formatDuration(seconds)}
              </option>
            ))}
          </select>
        </div>

        <div className="tool-control">
          <label className="tool-control-label" htmlFor="setlist-start">
            On stage at
          </label>
          {/* `type="time"` so a phone offers its own clock, and so the value arrives as
              `HH:MM` — the one shape `parseClockTime` reads. */}
          <input
            id="setlist-start"
            className="tool-select"
            type="time"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </div>
      </div>

      <div className="tool-pane">
        <div className="tool-pane-head">
          <label htmlFor="setlist-input" className="tool-pane-label">
            One song per line, length at the end
          </label>
          <button type="button" className="tool-link-button" onClick={() => setText(SAMPLE)}>
            Use an example
          </button>
        </div>

        <textarea
          id="setlist-input"
          className="tool-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={SAMPLE}
          spellCheck={false}
          rows={10}
        />
      </div>

      {totals.songs > 0 && (
        <>
          {/* The three numbers somebody came for, before any table. `aria-live` so stepping a
              control announces the new total rather than only redrawing it. */}
          <div className="setlist-totals" aria-live="polite">
            <div className="setlist-total">
              <span className="setlist-total-value">{formatSpoken(totals.totalSeconds)}</span>
              <span className="setlist-total-label">
                {totals.songs} {totals.songs === 1 ? 'song' : 'songs'}, gaps included
              </span>
            </div>

            <div className="setlist-total">
              <span className="setlist-total-value">{formatDuration(totals.playSeconds)}</span>
              <span className="setlist-total-label">music only</span>
            </div>

            {finish !== null && (
              <div className="setlist-total">
                <span className="setlist-total-value">{finish.clock}</span>
                {/* «24h» spelled out because the control above it is a native `type="time"`
                    field, which renders in the *browser's* locale — «09:00 PM» on this
                    machine — while everything computed here is hand-formatted on a 24-hour
                    clock (`formatClockTime`, and `prices.ts` for why nothing here asks
                    `Intl`). One panel showing both conventions has to say which is which. */}
                <span className="setlist-total-label">
                  off stage, 24h{finish.nextDay && ', the next day'}
                </span>
              </div>
            )}
          </div>

          <p className="tool-verdict">
            {totals.assumed > 0 && (
              <>
                {totals.assumed} of {totals.songs} {totals.assumed === 1 ? 'song has' : 'songs have'} no length
                written, so {totals.assumed === 1 ? 'it counts' : 'they count'} as{' '}
                {formatDuration(songLength)} each.{' '}
              </>
            )}
            {unreadable > 0 && (
              <>
                {unreadable} {unreadable === 1 ? 'line ends' : 'lines end'} in something that looks like a length but
                is not one — write lengths as <span translate="no">3:45</span>.{' '}
              </>
            )}
            {totals.assumed === 0 && unreadable === 0 && 'Every song stated its own length, so this total is not a guess.'}
          </p>

          <div className="capo-table-wrap">
            <table className="capo-table setlist-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Song</th>
                  <th scope="col">Length</th>
                  <th scope="col">Ends at</th>
                </tr>
              </thead>
              <tbody>
                {songs.map((song, index) => {
                  /* Where this song finishes: everything before it, plus itself, plus one gap
                     for each boundary already crossed. The same rule `setlistTotals` states —
                     asked of a prefix of the list rather than of the whole of it. */
                  const elapsed = setlistTotals(songs.slice(0, index + 1), songLength, gap).totalSeconds
                  const at = startMinutes === null ? null : finishTime(startMinutes, elapsed)

                  return (
                    <tr key={`${song.title}-${index}`} className={song.unreadable ? 'is-unreadable' : undefined}>
                      <td className="capo-count">{index + 1}</td>
                      <th scope="row" className="setlist-title">
                        {song.title}
                      </th>
                      <td className="capo-count">
                        {formatDuration(song.seconds ?? songLength)}
                        {song.seconds === null && <span className="setlist-assumed">assumed</span>}
                      </td>
                      <td className="capo-count">{at === null ? '—' : at.clock}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {totals.songs === 0 && (
        <p className="tool-verdict" aria-live="polite">
          Paste your set above — one song per line, with its length at the end where you already write it — and the
          running time appears here.
        </p>
      )}
    </div>
  )
}
