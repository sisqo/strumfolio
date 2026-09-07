'use client'

import { useEffect } from 'react'

import { IconClose } from '@/components/icons'
import { ShapeCarousel } from '@/components/ShapeCarousel'
import { type Chord, type Spelling, formatChord, formatNoteName } from '@/lib/music/chord'
import { type Instrument, chordNoteNames, fingeringText, pickShape } from '@/lib/music/shapes'

/**
 * The shape of the chord you tapped.
 *
 * Shows the chord as it is currently displayed — transposed, in the reader's
 * notation — because that is the chord to play, not the one the file was written
 * with. When the suffix is outside the table there is still something useful to
 * say, so the notes are always listed and the diagram is what may be missing.
 *
 * The heading follows the sheet all the way into Nashville numbers, so a reader who tapped
 * `5` is answered about `5`. The notes underneath stay letters even there, and
 * `formatNoteName` is where that is argued: a chord has a degree, the notes inside it do
 * not.
 */
export function ChordPopup({
  chord,
  spelling,
  instrument,
  capo,
  chordShapes,
  onChangeShape,
  onClose,
}: {
  chord: Chord
  /** The reader's notation, and the tonic Nashville numbers need — see `SongSheet`. */
  spelling: Spelling
  /** Whose fingerings to draw. The chord itself is the same on either. */
  instrument: Instrument
  /** The fret the capo is on: the shape is the same, but it starts from there. */
  capo: number
  /** This song's own choices of shape — see `SongPrefs.chordShapes`. */
  chordShapes: Record<string, string>
  /** Sets, or with `null` clears, this song's choice of shape for the chord shown here. */
  onChangeShape: (key: string, fingering: string | null) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const picked = pickShape(chord, instrument, chordShapes)
  const notes = chordNoteNames(chord).map((note) => formatNoteName(note, spelling.notation))

  return (
    <div className="chord-overlay" role="dialog" aria-modal="true" aria-label="Chord shape">
      <div className="chord-backdrop" onClick={onClose} aria-hidden />

      <div className="chord-card">
        <button type="button" className="chord-close" onClick={onClose} aria-label="Close">
          <IconClose size={18} />
        </button>

        <p className="chord-name">{formatChord(chord, spelling)}</p>

        {picked === null ? (
          <p className="mt-1 text-sm text-muted">
            {instrument === 'ukulele'
              ? 'No shape for this chord on four strings.'
              : 'No shape available for this chord.'}
          </p>
        ) : (
          // Remounts on a genuinely different chord (`picked.key` changes) so the
          // carousel's own scroll position resets instead of fighting the reader's
          // last swipe on some other chord's popup.
          <ShapeCarousel
            key={picked.key}
            shapes={picked.shapes}
            active={picked.shape}
            capo={capo}
            dotsLabel="Shape, in this song"
            onSettle={(shape, index) =>
              onChangeShape(picked.key, index === 0 ? null : fingeringText(shape.frets))
            }
          />
        )}

        <p className="chord-notes">{notes.join(' · ')}</p>

        {picked?.shape.simplified === true && (
          <p className="mt-2 text-xs text-muted">
            Simplified shape: contains only notes of the chord, not all the ones written.
          </p>
        )}

        {chord.bassName !== null && (
          <p className="mt-2 text-xs text-muted">
            Bass {formatNoteName(chord.bassName, spelling.notation)}, to be played beneath
            this shape.
          </p>
        )}
      </div>
    </div>
  )
}
