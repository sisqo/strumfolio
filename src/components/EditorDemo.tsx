/**
 * The visual editor, shown rather than described — the landing page's one moving
 * picture. Two lines of the sample song (`lib/songbooks/sample.ts`, the one song
 * written to be quoted), drawn with the editor's own trick: a hidden copy of the
 * words with zero-width anchors between the letters, chips hung from the anchors.
 * Because it is the same mechanism, the chips sit on their syllables exactly as
 * they do in the app, in both themes, at every width — this is a demo, not a
 * screenshot, and it can never drift out of date the way a screenshot does.
 *
 * One twenty-second loop, and it comes back to where it began rather than
 * blinking back: a chord is carried onto its syllable, a tap in the gap between
 * two chords opens a new one and brings the bar up, a suggestion is taken and
 * confirmed — and then the same two moves in reverse, the chord carried back and
 * the new one removed, which leaves the song at 100% exactly as it was at 0%. A
 * loop that undoes itself needs no hidden reset.
 *
 * Every point the finger lands on gets a splash (`Splash` below). All of it is
 * decoration around one `role="img"` label: nothing here is interactive, and
 * `prefers-reduced-motion` shows the finished line — both chords placed, no bar,
 * no splashes — instead of playing anything.
 */

/** The eight directions a splash throws a spark in. */
const SPOKES = [0, 45, 90, 135, 180, 225, 270, 315]

/**
 * The splash a finger leaves where it lands: eight sparks thrown out of the
 * point and fading as they go. `cue` names which moment of the loop it belongs
 * to — the timing lives in the matching `burst-*` keyframes, so a splash has no
 * clock of its own and cannot drift from the rest.
 *
 * `long` is for the bar's own controls, whose sparks are a little longer than a
 * chip's: the buttons are bigger, and a spark sized for a chord name reads as a
 * smudge next to them.
 */
function Splash({ cue, long = false }: { cue: string; long?: boolean }) {
  return (
    <span className={`demo-splash demo-transient demo-splash-${cue}`} aria-hidden>
      {SPOKES.map((angle) => (
        <span key={angle} className="demo-spoke" style={{ rotate: `${angle}deg` }}>
          <span className={long ? 'demo-spark is-long' : 'demo-spark'} />
        </span>
      ))}
    </span>
  )
}

export function EditorDemo() {
  return (
    <div
      className="editor-demo"
      role="img"
      aria-label="The visual editor: chords sit above the words of a song. A chord is dragged onto its syllable, then a tap on the empty space between two chords opens a new one, with the song's own chords offered as one-tap suggestions."
    >
      <div aria-hidden>
        <div className="demo-line">
          <div className="demo-chords">
            <span className="demo-anchor">
              <span className="demo-chip">Am</span>
            </span>
            Every{' '}
            {/* The gap between two chords: where the tap adds one, and where it
                is taken away again on the way back. */}
            <span className="demo-anchor">
              <span className="demo-field">
                <span className="demo-name">G</span>
              </span>
              {/*
                * The same box again, transparent and never faded, carrying only
                * the two splashes: a splash inside the field itself would be
                * invisible for exactly as long as the field is — and both of
                * these land while it is still opening or already closing.
                */}
              <span className="demo-field is-seat">
                G
                <Splash cue="add" />
                <Splash cue="gtap" />
              </span>
            </span>
            song I love, one{' '}
            <span className="demo-anchor">
              <span className="demo-chip is-held">
                C
                <Splash cue="pickup" />
                <Splash cue="drop" />
                <Splash cue="back-pickup" />
                <Splash cue="back-drop" />
              </span>
            </span>
            tap away
          </div>
          <div className="demo-words">Every song I love, one tap away</div>
        </div>

        {/* Opens the line apart to come up, and closes it again on the way out. */}
        <div className="demo-bar demo-transient">
          <span className="demo-key">‹</span>
          <span className="demo-key">›</span>
          <span className="demo-suggest">
            <span className="demo-suggestion">C</span>
            <span className="demo-suggestion is-picked">
              G
              <Splash cue="pick" long />
            </span>
            <span className="demo-suggestion">Am</span>
            <span className="demo-suggestion">F</span>
          </span>
          <span className="demo-key">
            ×
            <Splash cue="remove" long />
          </span>
          <span className="demo-key is-accent">
            ✓
            <Splash cue="ok" long />
          </span>
        </div>

        <div className="demo-line">
          <div className="demo-chords">
            <span className="demo-anchor">
              <span className="demo-chip">F</span>
            </span>
            Transpose it,{' '}
            <span className="demo-anchor">
              <span className="demo-chip">C</span>
            </span>
            play it, my way
            <span className="demo-trailing">
              <span className="demo-chip">G</span>
              <span className="demo-chip">Am</span>
            </span>
            <span className="demo-slot">+</span>
          </div>
          <div className="demo-words">Transpose it, play it, my way</div>
        </div>

        {/* The row the graphic editor always keeps at the foot of a song: there is
            never a button for "add a verse", there is always one more line. */}
        <span className="editor-add-line">+ line</span>
      </div>
    </div>
  )
}
