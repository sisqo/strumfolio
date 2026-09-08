'use client'

import { useLayoutEffect, useRef, useState } from 'react'

import { ChordDiagram } from '@/components/ChordDiagram'
import { IconChevronLeft, IconChevronRight } from '@/components/icons'
import type { ChordShape } from '@/lib/music/shapes'

/**
 * Every candidate shape for one chord, as a slideshow rather than a row of miniatures:
 * one shape at a time, at the size a single diagram would have been, swiped or dragged
 * between like a gallery, with its neighbours peeking in at the edges so there is
 * something to invite the swipe. Landing on the first slide and stopping there is the
 * reset to the default shape — there is no separate control for it, the same reasoning
 * that applied to the row this replaces.
 *
 * **Two callers, and they are not the same kind of surface.** `ChordPopup` is a reader
 * tapping a chord in a song, and settling on a slide is that song's own choice of shape,
 * saved. `ChordChartPicker` is the public chord chart, where there is no song and nothing
 * to remember — so `onSettle` is optional, and with no writer attached the mechanism is
 * the same and simply commits nowhere.
 *
 * **Keyed by position, which is the one thing that never moves here.** A chord's candidate
 * list is fixed and deduplicated by the time it arrives, and a different chord remounts the
 * whole carousel rather than re-keying its slides — `ChordPopup` passes `key={picked.key}`
 * and `ChordChartPicker` mounts a fresh dialog. The obvious alternative, the fingering text,
 * would mean importing `fingeringText` from `shapes.ts` and so shipping the guitar tables
 * and the ukulele search to a browser that never calls either — a real cost on the public
 * chart pages, which are static documents and otherwise carry no music code at all.
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
export function ShapeCarousel({
  shapes,
  active,
  capo = 0,
  dotsLabel = 'Shape',
  onSettle,
}: {
  shapes: ChordShape[]
  /** The shape this song currently resolves to — where the carousel opens on. */
  active: ChordShape
  /** The fret the capo is on: the shape is the same, but it starts from there. */
  capo?: number
  /**
   * What the row of dots is a choice *of*. A song remembers the answer and says so
   * («Shape, in this song»); the public chart remembers nothing and must not imply it.
   */
  dotsLabel?: string
  /** Fired continuously while scrolling, with the slide nearest the centre right now. */
  onSettle?: (shape: ChordShape, index: number) => void
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
    onSettle?.(shapes[index], index)
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
  //
  // A layout effect, not a passive one: `commit()` needs `trackRef.current`, and for an
  // unmounting node React nulls that ref during the same synchronous commit that removes
  // it from the DOM — before a passive effect's cleanup gets a turn, only after. A `commit()`
  // that ran there would read a ref already gone and silently do nothing, dropping this
  // exact last swipe. Landing in the same pre-detach phase is what actually catches it.
  useLayoutEffect(
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
          <div key={index} className="chord-carousel-slide">
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
        <div className="chord-carousel-dots" role="group" aria-label={dotsLabel}>
          {shapes.map((_shape, index) => (
            <button
              key={index}
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
