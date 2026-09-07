'use client'

import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react'

import { IconClose } from '@/components/icons'
import { ShapeCarousel } from '@/components/ShapeCarousel'
import type { LibraryChord } from '@/lib/music/chordLibrary'

/**
 * The chart's alternate-shapes picker: tap a box and every other way to play that chord
 * is there to page through, which is the same gesture and the same carousel a reader gets
 * by tapping a chord inside a song.
 *
 * **One listener over the whole grid, not a handler on each of 216 cards.** The cards are
 * server-rendered by `ChordLibrary` and arrive here as `children` — this component adds a
 * click listener above them and reads `data-chord` off whatever was hit. Which is also
 * why the card's own hit target is a real `<button>` rendered on the server with no
 * handler of its own: a delegated listener gives a keyboard or a screen reader nothing to
 * find, and `role="button"` plus a keydown handler would be re-implementing what the
 * element already does.
 *
 * **Nothing here recomputes a shape.** `cards` is what `chordLibrary` already worked out
 * at build time, fingering text included, so the only music code that reaches the browser
 * is `ChordDiagram` drawing fret numbers it was handed — never `shapesFor`, whose ukulele
 * half is a search of some thirteen thousand fingerings per chord.
 *
 * **And nothing is remembered.** In a song, settling on a shape is that song's own choice
 * and is saved; here there is no song and no account, so the carousel commits nowhere and
 * the dialog closes with the chart exactly as it was. The pages' prose is written to say
 * so, because "your choice is remembered" is what the app adds over this page.
 */
export function ChordChartPicker({ cards, children }: { cards: LibraryChord[]; children: ReactNode }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  /** The card that opened the dialog, so closing it puts focus back where it was. */
  const opener = useRef<HTMLElement | null>(null)

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    // `Element` and not `HTMLElement`: what is actually hit is almost always the diagram,
    // and an `<svg>` is an `SVGElement` — the narrower test silently dropped every click
    // that landed on the picture rather than on the padding around it.
    const target = event.target
    if (!(target instanceof Element)) return

    const hit = target.closest<HTMLElement>('[data-chord]')
    if (hit === null) return

    const index = Number(hit.dataset.chord)
    if (!Number.isInteger(index) || cards[index] === undefined) return

    opener.current = hit
    setOpenIndex(index)
  }

  const close = () => {
    setOpenIndex(null)
    opener.current?.focus()
  }

  const card = openIndex === null ? null : cards[openIndex]

  return (
    <>
      <div className="chord-chart-cards" onClick={onClick}>
        {children}
      </div>

      {card !== null && <ChordChartDialog card={card} onClose={close} />}
    </>
  )
}

/**
 * One chord, big, with every shape it has behind it.
 *
 * The same shell as the reading screen's own `ChordPopup` — `.chord-overlay`,
 * `.chord-card`, the carousel — and deliberately not that component: it resolves a
 * `Chord` through a reader's saved choices for a song, and none of those three things
 * exist on a page anybody can open without an account.
 *
 * The fingering line under the box follows the slide rather than the card that opened
 * the dialog, which is what `onSettle` is reported for. It is here and not in the
 * carousel because the reading screen's popup deliberately doesn't print one: on the
 * sheet the picture is the answer, on a chart the text under it is half of what the page
 * is for.
 */
function ChordChartDialog({ card, onClose }: { card: LibraryChord; onClose: () => void }) {
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="chord-overlay" role="dialog" aria-modal="true" aria-label="Chord shape">
      <div className="chord-backdrop" onClick={onClose} aria-hidden />

      <div className="chord-card">
        <button type="button" className="chord-close" onClick={onClose} aria-label="Close">
          <IconClose size={18} />
        </button>

        <p className="chord-name" translate="no">
          {card.name}
        </p>
        <p className="chord-chart-dialog-label">{card.label}</p>

        <ShapeCarousel
          shapes={card.shapes}
          active={card.shapes[0]}
          onSettle={(_shape, index) => setShown(index)}
        />

        <p className="chord-chart-dialog-fingering" translate="no">
          {card.shapes[shown]?.fingering}
        </p>

        <p className="chord-notes" translate="no">
          {card.notes.join(' · ')}
        </p>
      </div>
    </div>
  )
}
