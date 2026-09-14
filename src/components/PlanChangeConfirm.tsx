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
 * **It restates nothing in its own words.** `changeSummary` builds the title, the figure, the
 * rows and the headline; the screen behind renders the same object's other face — the calendar —
 * and this renders the list. So the dialog cannot promise something the page did not, which is
 * the failure mode of every confirmation written as a second copy of the copy.
 *
 * **It opens with the money, since `Checkout.dc.html`.** «Before we make this change» was the
 * heading for eighteen months, and it is true of every press — it told the reader which change
 * they were confirming only by what sat underneath it. What a person stops at is the figure
 * leaving their card today, so that is the first thing set, at the size the screen's own title
 * uses, with what the change *is* named directly under it.
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
        className="upgrade-card"
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

        {/* The figure first, at the screen title's size: it is what a reader stops at, and
            every other line here is an explanation of it. */}
        <p className="card-eyebrow">You pay today</p>
        <p className="screen-title mt-1 tabular-nums">{summary.payToday}</p>

        <h2 className="section-title mt-3.5" id={titleId}>
          {summary.title}
        </h2>

        {/* The same facts as the calendar behind, listed — from the same object, so the two
            faces of one preview cannot describe the press differently. */}
        <dl className="mt-3.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-line-soft pt-3 text-sm leading-5">
          {summary.rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="whitespace-nowrap text-muted">{row.label}</dt>
              <dd className="text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-[0.8125rem] leading-[1.4] text-muted">{summary.headline}</p>

        <div className="upgrade-actions is-stacked">
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
