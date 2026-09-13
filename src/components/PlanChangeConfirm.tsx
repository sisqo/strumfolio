'use client'

import { useId, useRef } from 'react'

import { IconClose } from '@/components/icons'
import type { ChangeSummary } from '@/lib/plans/changeSummary'
import { useDialogA11y } from '@/lib/useDialogA11y'
import { useOnline } from '@/lib/useOnline'

interface Props {
  /** Exactly what the screen behind this already shows — see `changeSummary`. */
  summary: ChangeSummary
  /** What the confirming button says, since a revert is not a «switch». */
  confirmLabel: string
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}

/**
 * The second press, and the reason there is one.
 *
 * Pressing «Switch to Premium» used to be the whole decision: one tap on a button under a
 * sentence, and a real amount left a real card — or a plan the reader had paid a year for was
 * signed away to a date eleven months out. Every other irreversible act in this app asks twice
 * (`SongForm`'s delete, the cancellation on /billing, and the Free card on /pricing that leads
 * to it); this one, the only one that moves money, asked once.
 *
 * **It restates nothing in its own words.** `changeSummary` builds the rows and the headline,
 * the screen behind renders the same object, and this renders it again — so the dialog cannot
 * promise something the page did not, which is the failure mode of every confirmation written
 * as a second copy of the copy.
 *
 * **What it deliberately does not do is re-price.** A second preview round trip on opening
 * would put a spinner between the press and the question, and could answer differently from
 * the page for reasons the reader cannot see. The guard against a stale quotation is at the
 * other end instead: `changePaddlePlan` decides again, server-side, at the moment of the press,
 * and the sentence a reader is left with is built from **its** answer rather than from anything
 * shown here. So a change that lands differently than this dialog described says so afterwards,
 * rather than this dialog being the only account of what happened.
 */
export function PlanChangeConfirm({ summary, confirmLabel, busy, onConfirm, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const online = useOnline()
  useDialogA11y(cardRef, onClose)

  return (
    <div className="upgrade-overlay">
      <div className="upgrade-backdrop" onClick={busy ? undefined : onClose} aria-hidden />

      <div
        ref={cardRef}
        className="upgrade-card is-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <button
          type="button"
          className="upgrade-close"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
        >
          <IconClose size={18} />
        </button>

        <h2 className="section-title" id={titleId}>
          Before we make this change
        </h2>

        {/* The same rows as the page, in the same order, from the same object. */}
        <dl className="mt-3 grid grid-cols-1 gap-x-3 gap-y-1 border-t border-line-soft pt-3 text-sm sm:grid-cols-[10.5rem_1fr] sm:gap-y-2">
          {summary.rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted">{row.label}</dt>
              <dd className="font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-sm text-muted">{summary.headline}</p>

        <div className="upgrade-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!online || busy}
            onClick={onConfirm}
          >
            {busy ? 'One moment…' : confirmLabel}
          </button>
          {/* «Don't change anything», not «Cancel»: on a screen about subscriptions the word
              cancel means ending the plan, and it is the one word that must not appear on the
              button whose whole job is to leave everything as it is. */}
          <button type="button" className="btn btn-quiet btn-sm" onClick={onClose} disabled={busy}>
            Don’t change anything
          </button>
        </div>
      </div>
    </div>
  )
}
