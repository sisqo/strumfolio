'use client'

import Link from 'next/link'
import { useId, useRef } from 'react'

import { IconClose } from '@/components/icons'
import { LIMIT_MESSAGE, limitSentence, type LimitFacts, type LimitReason } from '@/lib/plans/types'
import { useDialogA11y } from '@/lib/useDialogA11y'

/** What a plan refused, exactly as a `WriteRefusal` carries it once its reason is known to be a `LimitReason`. */
export interface PlanNotice {
  reason: LimitReason
  limit?: LimitFacts
  /**
   * Named only when there is one feature to blame for a `plan-required` refusal with no cap
   * to quote — Sing Together, the printable booklet — so the dialog can say what was refused
   * rather than fall back to `LIMIT_MESSAGE`'s vaguest line, "This is not included in your
   * plan." Left unset for a count refusal, where `limit` already names the cap, and for
   * `frozen`, which is over more than one cap at once and would misname the problem by
   * blaming a single feature.
   */
  feature?: string
}

/**
 * Told in place of the inline notice whenever a write was refused by the plan rather than by
 * a permission — same two facts `writeMessage`/`saveMessage` already read, just carried to a
 * dialog instead of a `<p>` in the flow, since "install a bigger plan" is a decision worth
 * its own screen rather than a line easy to miss among the others near it.
 *
 * `frozen` is the one reason with no purchase that fixes it — see `LimitReason`'s own comment
 * in `plans/types.ts` — so it is also the one case here with no "See plans" button: telling
 * someone to buy more when the answer is to delete would be both wrong and expensive.
 */
export function PlanUpgradeModal({ notice, onClose }: { notice: PlanNotice; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  /*
   * What `aria-modal="true"` claims and nothing here used to do before v3.13 — focus moved
   * onto the dialog, a Tab trap that holds it there, and focus restored to the opener on
   * close. Extracted to `useDialogA11y` (v3.14) once a second dialog needed exactly the same
   * three things; see that hook's own comment for why it is two effects rather than one, and
   * why the trap's own `querySelectorAll` runs on each Tab press rather than once — this
   * dialog's own set of focusables changes with `canUpgrade` below.
   */
  useDialogA11y(cardRef, onClose)

  const canUpgrade = notice.reason !== 'frozen'
  const message =
    notice.limit !== undefined
      ? limitSentence(notice.limit)
      : notice.feature !== undefined
        ? `${notice.feature} is not included in your plan.`
        : LIMIT_MESSAGE[notice.reason]

  return (
    <div className="upgrade-overlay">
      <div className="upgrade-backdrop" onClick={onClose} aria-hidden />

      {/* `role="dialog"` on the card and not on the overlay above it (v3.13): the overlay also
          contains the backdrop, so naming the whole of it the dialog put an `aria-hidden`
          sibling inside the thing that claims to be modal. This element is the dialog, it is
          what takes focus, and it is what the tab trap holds the reader inside. */}
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
          {canUpgrade ? 'Upgrade to continue' : 'Over your plan’s limit'}
        </h2>
        <p className="mt-2 text-sm text-muted">{message}</p>

        <div className="upgrade-actions">
          {canUpgrade && (
            <Link href="/pricing" className="btn btn-primary btn-sm" onClick={onClose}>
              See plans
            </Link>
          )}
          <button type="button" className="btn btn-quiet btn-sm" onClick={onClose}>
            {canUpgrade ? 'Not now' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
