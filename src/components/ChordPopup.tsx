'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { ChordDiagram } from '@/components/ChordDiagram'
import { IconChevronLeft, IconChevronRight, IconClose } from '@/components/icons'
import { type Chord, type Spelling, formatChord, formatNoteName } from '@/lib/music/chord'
import { type ChordShape, type Instrument, chordNoteNames, fingeringText, pickShape } from '@/lib/music/shapes'

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

/**
 * Every candidate shape for the chord shown above, as a slideshow rather than a row of
 * miniatures: one shape at a time, at the same size the single diagram used to be,
 * swiped or dragged between like a gallery, with its neighbours peeking in at the edges
 * so there is something to invite the swipe. Landing on the first slide and stopping
 * there is the reset to the default shape — there is no separate control for it, the
 * same reasoning `PLAN-chord-forms.md`'s Decision 6 gives for the row this replaces.
 *
 * The dots track the scroll position directly, once per animation frame — not the
 * `active` prop, which only catches up once `onSettle`'s write has round-tripped through
 * `SongPrefs` and back down as new props. Reading the prop instead read as a beat of lag
 * on every swipe: real, and worth avoiding, since a reader mid-swipe wants to see the
 * dot move under their thumb, not half a render cycle later.
 *
 * `onSettle` runs on every one of those frames too, not only once scrolling has fully
 * stopped. A debounced "wait until scrolling stops, then fire once" version had a real
 * bug: closing the popup cancels whatever is still pending, so a swipe followed quickly
 * by the close button was silently thrown away — the shape looked chosen and then simply
 * wasn't, the moment the card closed. Committing continuously removes the pending write
 * there ever was to lose; `PrefsProvider`'s own no-op guard (deep-equal on
 * `chordShapes`) and the save queue's "keeps only the latest value per song" both already
 * exist for exactly this shape of caller, so firing on every frame costs nothing extra.
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
  /** Fired continuously while scrolling, with the slide nearest the centre right now. */
  onSettle: (shape: ChordShape, index: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const frame = useRef<number | undefined>(undefined)
  const openIndex = Math.max(0, shapes.indexOf(active))
  const [liveIndex, setLiveIndex] = useState(openIndex)

  /**
   * The slide nearest the middle of the visible track right now — found from each
   * slide's own `offsetLeft`, not from a slide-width-times-index formula. The slides
   * peek their neighbours and sit on `gap`, so a single "width" is not enough to place
   * them; comparing actual positions is correct regardless of how they are sized.
   */
  const nearestIndex = (track: HTMLDivElement): number => {
    const center = track.scrollLeft + track.clientWidth / 2
    let best = 0
    let bestDistance = Infinity
    for (let i = 0; i < track.children.length; i += 1) {
      const slide = track.children[i] as HTMLElement
      const distance = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - center)
      if (distance < bestDistance) {
        bestDistance = distance
        best = i
      }
    }
    return best
  }

  const commit = () => {
    const track = trackRef.current
    if (track === null || track.children.length === 0) return
    const index = nearestIndex(track)
    setLiveIndex(index)
    onSettle(shapes[index], index)
  }

  // Opens on the shape already chosen for this song, no transition to watch happen.
  useLayoutEffect(() => {
    const track = trackRef.current
    const slide = track?.children[openIndex]
    if (slide instanceof HTMLElement) slide.scrollIntoView({ inline: 'center', block: 'nearest' })
    // Only on mount — a swipe already in progress must not be reset by this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A frame already queued means a scroll position `commit` has not yet read is still
  // waiting — closing the popup right now must still read and save it, not drop it.
  useEffect(
    () => () => {
      if (frame.current !== undefined) {
        cancelAnimationFrame(frame.current)
        commit()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const scrollToIndex = (index: number) => {
    const slide = trackRef.current?.children[index]
    if (slide instanceof HTMLElement) {
      slide.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    }
  }

  const onScroll = () => {
    if (frame.current !== undefined) return
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined
      commit()
    })
  }

  return (
    <div className="chord-carousel">
      {shapes.length > 1 && liveIndex > 0 && (
        <button
          type="button"
          className="chord-carousel-nav is-prev"
          onClick={() => scrollToIndex(liveIndex - 1)}
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

      {shapes.length > 1 && liveIndex < shapes.length - 1 && (
        <button
          type="button"
          className="chord-carousel-nav is-next"
          onClick={() => scrollToIndex(liveIndex + 1)}
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
              className={index === liveIndex ? 'chord-carousel-dot is-on' : 'chord-carousel-dot'}
              aria-label={index === 0 ? 'Standard shape' : `Alternative shape ${index + 1}`}
              aria-current={index === liveIndex}
              onClick={() => scrollToIndex(index)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
