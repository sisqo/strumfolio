'use client'

import Link from 'next/link'
import { useId, useRef } from 'react'

import { IconClose } from '@/components/icons'
import { useDialogA11y } from '@/lib/useDialogA11y'

/**
 * Told once the "Add example songbook" button (`HomeScreen`'s empty state) has actually
 * created it.
 *
 * A modal rather than a redirect straight to the new songbook (the first shape this took):
 * jumping there on success took over the one screen the reader had just been looking at,
 * with no way back to it without a second navigation — and for a click made from an *empty*
 * songbook list, there is nothing on that list yet to miss. The modal keeps the reader on
 * the list, which now shows the songbook it names, and lets them choose to open it rather
 * than being taken there.
 */
export function SampleSongbookModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogA11y(cardRef, onClose)

  return (
    <div className="upgrade-overlay">
      <div className="upgrade-backdrop" onClick={onClose} aria-hidden />

      <div
        ref={cardRef}
        className="upgrade-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <button type="button" className="upgrade-close" onClick={onClose} aria-label="Close">
          <IconClose size={18} />
        </button>

        <h2 className="section-title" id={titleId}>
          Example songbook added
        </h2>
        <p className="mt-2 text-sm text-muted">
          It’s in your songbooks now, with eight songs already inside. Open it to play through
          them, or edit it like any other songbook — rename it, rearrange its sections, add,
          remove, or change any of the songs.
        </p>

        <div className="upgrade-actions">
          <Link href={`/songbooks/${slug}`} className="btn btn-primary btn-sm" onClick={onClose}>
            Open songbook
          </Link>
          <button type="button" className="btn btn-quiet btn-sm" onClick={onClose}>
            Stay here
          </button>
        </div>
      </div>
    </div>
  )
}
