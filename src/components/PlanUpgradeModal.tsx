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
 *
 * The fourth reason, `plan-required`, no longer reaches this dialog in practice: the four
 * gates that ever produce it (`entitlements.ts`'s `lead`/`booklet`/`ukulele`/
 * `featureRequest`) now open `FeaturePaywallModal` instead, whose "Included in {plan}"
 * template can name the one plan that grants a single feature — a claim this dialog cannot
 * make for a numbered cap, where more than one plan lifts it. `LIMIT_MESSAGE['plan-required']`
 * stays as the bare fallback below for the same reason it always has: a `Record<LimitReason,
 * string>` demands all four keys, and a future call site that forgets `limit` should read a
 * vague truth rather than crash on a missing one.
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
  const message = notice.limit !== undefined ? limitSentence(notice.limit) : LIMIT_MESSAGE[notice.reason]

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
