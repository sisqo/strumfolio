'use client'

import { useId, useRef } from 'react'

import { IconClose } from '@/components/icons'
import { useDialogA11y } from '@/lib/useDialogA11y'
import type { InfoRow } from '@/lib/songInfo'

/**
 * What the file says about the song, behind a tap on the header.
 *
 * Behind a tap rather than under the title, and that is the whole of the layout decision: on
 * a phone at a music stand the vertical space is what the words are competing for, and a
 * composer, a year and a copyright are never read while playing. They are read once, or when
 * somebody wants to know who wrote it — so they get a screen of their own and cost the song
 * nothing.
 *
 * Only the metadata. The typesetting a file may also carry — fonts, page breaks, columns —
 * belongs to whoever is working on the file and is shown in the editor, graphic and raw,
 * where it can be changed. Printing it here would put a font name in front of a musician.
 */
export function SongInfoPanel({ rows, onClose }: { rows: InfoRow[]; onClose: () => void }) {
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
          About this song
        </h2>

        {/* A description list, because that is what this is: each row is a term and what the
            file says about it. The label column is fixed so the values line up down the
            panel, and wraps rather than truncating — a copyright line is a sentence. */}
        <dl className="mt-3 grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted">{row.label}</dt>
              <dd className="break-words">{row.value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-xs text-faint">
          Written in the song file. Strumfolio keeps it exactly as it is and hands it back
          unchanged when the song is exported.
        </p>
      </div>
    </div>
  )
}
