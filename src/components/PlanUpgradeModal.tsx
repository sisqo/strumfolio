'use client'

import Link from 'next/link'
import { useEffect, useId, useRef } from 'react'

import { IconClose } from '@/components/icons'
import { LIMIT_MESSAGE, limitSentence, type LimitFacts, type LimitReason } from '@/lib/plans/types'

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
   * What `aria-modal="true"` claims and nothing here used to do (v3.13).
   *
   * The attribute tells assistive technology that the rest of the page is inert while this is
   * open; the browser does not enforce any of it. Without the three things below, the claim was
   * false in the way that matters most to whoever relies on it: the focus stayed on the button
   * that had just been pressed, *behind* the backdrop, so a keyboard reader was told a dialog
   * had opened and then given no way into it — Tab walked the page underneath instead, whose
   * controls are exactly the ones the plan had just refused.
   *
   * Focus goes to the card itself rather than to the first button in it (`tabIndex={-1}`, which
   * makes a container focusable without putting it in the tab order): the dialog's own title is
   * then what gets read out, instead of «Close» — which is the one action a reader who has just
   * hit a limit is least likely to want first. `aria-labelledby` over the `aria-label` this
   * carried, so that title is the same string on the screen and in the announcement, and cannot
   * drift from it — the heading already says two different things depending on `canUpgrade`.
   *
   * A second effect, deliberately, and with an empty dependency list: the Escape handler below
   * depends on `onClose`, which every call site passes as a fresh arrow on each render. Folded
   * together, a parent re-render would tear this down and set it up again — and the teardown is
   * what *restores* focus to the opener, so the dialog would hand focus back to the page behind
   * it in the middle of being open. This one runs on mount and unmount, which for this
   * component are exactly when it opens and closes (every call site renders it behind a
   * `notice !== null`).
   */
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cardRef.current?.focus()

    const onTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const root = cardRef.current
      if (root === null) return

      /* Every focusable this dialog can hold: the close button, «See plans» when it is offered,
         and the dismissing one. Queried on each press rather than once, so nothing has to be
         re-run if the contents ever become conditional on more than they already are. */
      const items = Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
      if (items.length === 0) return

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      /* Off the end in either direction wraps; anywhere outside the card at all — the page
         behind, or the card itself, which is where focus starts — comes back to the top. */
      if (active === (event.shiftKey ? first : last)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (!(active instanceof HTMLElement) || !root.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onTab)
    return () => {
      window.removeEventListener('keydown', onTab)
      /* Back where it came from, which is the button that was refused — the reader carries on
         from the place they were, rather than from the top of the document. */
      opener?.focus()
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
