'use client'

import Link from 'next/link'
import { useId, useRef } from 'react'

import { IconClose } from '@/components/icons'
import { paywallBody, paywallPrimaryLabel, paywallTitle } from '@/lib/plans/paywall'
import type { Plan } from '@/lib/plans/types'
import { useDialogA11y } from '@/lib/useDialogA11y'

/**
 * The upgrade paywall for one named, plan-gated feature — Strum Together, printable
 * booklets, ukulele chord shapes, feature requests. One template for all four ("Included
 * in {plan}" / "Upgrade to use {feature}, and everything else in the tier."), read from
 * `@/lib/plans/paywall` rather than worded here, so the four call sites can never drift
 * into four different sentences for the same kind of refusal the way they used to.
 *
 * `PlanUpgradeModal` still owns the other two refusals this template cannot say: a
 * numbered cap ("This plan goes up to 300 songs in all.", where no single plan is "the"
 * answer — Plus and Premium both lift it) and `frozen` (no plan fixes an over-limit
 * repertoire at all). Same `.upgrade-overlay`/`.upgrade-card` shape and the same
 * `useDialogA11y` as that dialog, so the two read as one family of "a card over a dimmed
 * backdrop" rather than two designs that happen to look similar.
 *
 * `plan` is the `Plan` slug rather than an already-worded display name, because it drives
 * both the copy (through `PLAN_LABEL`, inside the three `paywall*` functions) and the
 * `/pricing` link below — threading a separate display-name prop alongside it would risk
 * the two disagreeing the day a plan is renamed.
 */
export function FeaturePaywallModal({
  feature,
  plan,
  onUpgrade,
  onDismiss,
}: {
  feature: string
  plan: Plan
  /** An optional side effect on top of the navigation itself — nothing today needs one. */
  onUpgrade?: () => void
  onDismiss: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useDialogA11y(cardRef, onDismiss)

  return (
    <div className="upgrade-overlay">
      <div className="upgrade-backdrop" onClick={onDismiss} aria-hidden />

      <div
        ref={cardRef}
        className="upgrade-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <button type="button" className="upgrade-close" onClick={onDismiss} aria-label="Close">
          <IconClose size={18} />
        </button>

        <h2 className="section-title" id={titleId}>
          {paywallTitle(plan)}
        </h2>
        <p className="mt-2 text-sm text-muted">{paywallBody(feature)}</p>

        <div className="upgrade-actions">
          <Link
            href={`/pricing?plan=${plan}`}
            className="btn btn-primary btn-sm"
            onClick={() => {
              onUpgrade?.()
              onDismiss()
            }}
          >
            {paywallPrimaryLabel(plan)}
          </Link>
          <button type="button" className="btn btn-quiet btn-sm" onClick={onDismiss}>
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
