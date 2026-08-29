/**
 * The visual editor, shown rather than described — the landing page's one moving
 * picture. Two lines of the sample song (`lib/songbooks/sample.ts`, the one song
 * written to be quoted), drawn with the editor's own trick: a hidden copy of the
 * words with zero-width anchors between the letters, chips hung from the anchors.
 * Because it is the same mechanism, the chips sit on their syllables exactly as
 * they do in the app, in both themes, at every width — this is a demo, not a
 * screenshot, and it can never drift out of date the way a screenshot does.
 *
 * It plays one loop in four acts, the shape of a real edit: the song at rest; a
 * chord picked up and carried onto its syllable; a tap on the empty space between
 * two chords, which opens a new one and brings up the chord bar; and a suggestion
 * taken, confirmed, the bar gone. Every ring is a finger landing — four of them,
 * one per act, each in the place its act happens.
 *
 * All of it is decoration around one `role="img"` label: nothing here is
 * interactive, and `prefers-reduced-motion` shows the finished state — both
 * chords placed, no bar, no rings — instead of playing anything.
 */
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
            {/* Act three lands here: the gap between two chords, where a tap adds. */}
            <span className="demo-anchor">
              <span className="demo-field">
                <span className="demo-name">G</span>
              </span>
              <span className="demo-ring demo-ring-add" />
            </span>
            song I love, one{' '}
            <span className="demo-anchor">
              <span className="demo-chip is-held">C</span>
              <span className="demo-ring demo-ring-drag" />
            </span>
            tap away
          </div>
          <div className="demo-words">Every song I love, one tap away</div>
        </div>

        {/* Always in the flow, so the sheet never reflows as it comes and goes. */}
        <div className="demo-bar">
          <span className="demo-key">‹</span>
          <span className="demo-key">›</span>
          <span className="demo-suggest">
            <span className="demo-suggestion">C</span>
            <span className="demo-suggestion is-picked">
              G
              <span className="demo-ring demo-ring-pick" />
            </span>
            <span className="demo-suggestion">Am</span>
            <span className="demo-suggestion">F</span>
          </span>
          <span className="demo-key">×</span>
          <span className="demo-key is-accent">
            ✓
            <span className="demo-ring demo-ring-ok" />
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
      </div>
    </div>
  )
}
