'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'

import { ChordDiagram } from '@/components/ChordDiagram'
import { IconChevronLeft, IconChevronRight, IconClose } from '@/components/icons'
import { type Chord, type Notation, formatChord } from '@/lib/music/chord'
import { noteToItalian } from '@/lib/music/notes'
import { type ChordShape, type Instrument, chordNoteNames, fingeringText, pickShape } from '@/lib/music/shapes'

/**
 * The shape of the chord you tapped.
 *
 * Shows the chord as it is currently displayed — transposed, in the reader's
 * notation — because that is the chord to play, not the one the file was written
 * with. When the suffix is outside the table there is still something useful to
 * say, so the notes are always listed and the diagram is what may be missing.
 */
export function ChordPopup({
  chord,
  notation,
  instrument,
  capo,
  chordShapes,
  onChangeShape,
  onClose,
}: {
  chord: Chord
  notation: Notation
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
  const notes = chordNoteNames(chord).map((note) =>
    notation === 'it' ? noteToItalian(note) : note,
  )

  return (
    <div className="chord-overlay" role="dialog" aria-modal="true" aria-label="Chord shape">
      <div className="chord-backdrop" onClick={onClose} aria-hidden />

      <div className="chord-card">
        <button type="button" className="chord-close" onClick={onClose} aria-label="Close">
          <IconClose size={18} />
        </button>

        <p className="chord-name">{formatChord(chord, notation)}</p>

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
            Bass {notation === 'it' ? noteToItalian(chord.bassName) : chord.bassName}, to be
            played beneath this shape.
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Every candidate shape for the chord shown above, as a slideshow rather than a row of
 * miniatures: one shape at a time, at the same size the single diagram used to be,
 * swiped or dragged between like a gallery. Landing on the first slide and stopping
 * there is the reset to the default shape — there is no separate control for it, the
 * same reasoning `PLAN-chord-forms.md`'s Decision 6 gives for the row this replaces.
 *
 * Settling is decided from the scroll position itself, debounced: native touch/trackpad
 * scrolling already snaps to a slide, and the callback only fires once scrolling has
 * actually stopped, so a swipe in progress does not save a shape mid-gesture.
 */
function ShapeCarousel({
  shapes,
  active,
  capo,
  onSettle,
}: {
  shapes: ChordShape[]
  /** The shape this song currently resolves to — where the carousel opens on. */
  active: ChordShape
  capo: number
  /** Fired once scrolling settles on a slide, with the shape and its index. */
  onSettle: (shape: ChordShape, index: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const settleTimer = useRef<number | undefined>(undefined)
  const activeIndex = Math.max(0, shapes.indexOf(active))

  // Opens on the shape already chosen for this song, no transition to watch happen.
  useLayoutEffect(() => {
    const track = trackRef.current
    if (track === null) return
    track.scrollLeft = activeIndex * track.clientWidth
    // Only on mount — a swipe already in progress must not be reset by this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(
    () => () => {
      if (settleTimer.current !== undefined) window.clearTimeout(settleTimer.current)
    },
    [],
  )

  const scrollToIndex = (index: number) => {
    const track = trackRef.current
    if (track === null) return
    track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' })
  }

  const onScroll = () => {
    if (settleTimer.current !== undefined) window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      const track = trackRef.current
      if (track === null || track.clientWidth === 0) return
      const index = Math.max(
        0,
        Math.min(shapes.length - 1, Math.round(track.scrollLeft / track.clientWidth)),
      )
      onSettle(shapes[index], index)
    }, 140)
  }

  return (
    <div className="chord-carousel">
      {shapes.length > 1 && activeIndex > 0 && (
        <button
          type="button"
          className="chord-carousel-nav is-prev"
          onClick={() => scrollToIndex(activeIndex - 1)}
          aria-label="Previous shape"
        >
          <IconChevronLeft size={18} />
        </button>
      )}

      <div className="chord-carousel-track" ref={trackRef} onScroll={onScroll}>
        {shapes.map((shape, index) => (
          <div key={fingeringText(shape.frets)} className="chord-carousel-slide">
            <ChordDiagram shape={shape} capo={capo} />
            {index === 0 && <span className="chord-carousel-caption">Standard</span>}
          </div>
        ))}
      </div>

      {shapes.length > 1 && activeIndex < shapes.length - 1 && (
        <button
          type="button"
          className="chord-carousel-nav is-next"
          onClick={() => scrollToIndex(activeIndex + 1)}
          aria-label="Next shape"
        >
          <IconChevronRight size={18} />
        </button>
      )}

      {shapes.length > 1 && (
        <div className="chord-carousel-dots" role="group" aria-label="Shape, in this song">
          {shapes.map((shape, index) => (
            <button
              key={fingeringText(shape.frets)}
              type="button"
              className={index === activeIndex ? 'chord-carousel-dot is-on' : 'chord-carousel-dot'}
              aria-label={index === 0 ? 'Standard shape' : `Alternative shape ${index + 1}`}
              aria-current={index === activeIndex}
              onClick={() => scrollToIndex(index)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
