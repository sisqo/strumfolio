/**
 * The little table an article uses to put two rows of chords side by side — what the room
 * hears against what the hand holds, which is the whole subject of the capo piece.
 *
 * A component rather than a markdown table because markdown cannot express the two things
 * that make it readable: the played row in the accent colour, and every chord name in it
 * marked `translate="no"`. That second one is not decoration. The rule this repo settled on
 * when the root layout stopped banning translation outright is that **a surface printing a
 * chord name marks itself**, and eight chord names in a grid is exactly that surface — a
 * browser rewriting `A` to `La` in the "Sounds" row while the prose around it explains why
 * the note is called `A` would turn the article into nonsense.
 *
 * The columns follow the rows: the mock draws four chords, but a progression with three or
 * five should not need a new component.
 */
export function BlogChordTable({
  label,
  sounds,
  played,
  note,
}: {
  /** What this table is a table of — «Song in A, capo 2». */
  label: string
  /** What the room hears. */
  sounds: string[]
  /** What the hand holds, printed in the accent. */
  played: string[]
  /** One line under it, in the app's own voice rather than in mono. */
  note?: string
}) {
  const columns = Math.max(sounds.length, played.length)

  return (
    <figure className="blog-chord-table">
      <p className="blog-chord-table-label">{label}</p>

      <div
        className="blog-chord-table-grid"
        style={{ '--blog-chord-columns': columns } as React.CSSProperties}
        translate="no"
      >
        <span className="blog-chord-table-row-label">Sounds</span>
        {sounds.map((chord, index) => (
          <span key={`sounds-${index}-${chord}`}>{chord}</span>
        ))}

        <span className="blog-chord-table-row-label">You play</span>
        {played.map((chord, index) => (
          <span key={`played-${index}-${chord}`} className="blog-chord-table-played">
            {chord}
          </span>
        ))}
      </div>

      {note !== undefined && <figcaption className="blog-chord-table-note">{note}</figcaption>}
    </figure>
  )
}
