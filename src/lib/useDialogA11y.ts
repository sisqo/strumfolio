'use client'

import { useEffect, type RefObject } from 'react'

/**
 * What every modal dialog in this app needs to make `aria-modal="true"` true rather than
 * merely claimed — extracted from `PlanUpgradeModal`, the first one built with this care
 * (v3.13), once a second dialog needed exactly the same three things: focus moved onto the
 * dialog itself when it opens, a Tab trap that keeps focus inside it while it is open, and
 * focus restored to whatever opened it once it closes. See `PlanUpgradeModal`'s own history
 * for why each of the three matters — the attribute tells assistive technology the rest of
 * the page is inert, and the browser enforces none of it on its own.
 *
 * Two effects, not one, and for the same reason `PlanUpgradeModal` kept them apart: the tab
 * trap runs once, on mount and unmount, so a parent re-render — which hands this a fresh
 * `onClose` on every render — cannot tear it down mid-dialog and hand focus back to the page
 * behind it while the dialog is still open. Escape depends on `onClose` and is fine to
 * re-subscribe on every change, since doing so touches neither focus nor the trap.
 */
export function useDialogA11y(cardRef: RefObject<HTMLDivElement | null>, onClose: () => void): void {
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cardRef.current?.focus()

    const onTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const root = cardRef.current
      if (root === null) return

      const items = Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
      if (items.length === 0) return

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

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
      opener?.focus()
    }
    /*
     * `cardRef` listed despite never changing in practice: every caller holds it from its
     * own `useRef()`, which the linter can prove stable when the call is in the same
     * function — a fact it loses once the ref only arrives here as a parameter. Listing it
     * satisfies the rule without changing what this effect actually does: mount and unmount,
     * once, same as before this was a shared hook.
     */
  }, [cardRef])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}
