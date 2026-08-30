'use client'

import { useFeedback } from '@/components/FeedbackProvider'
import { useRole } from '@/components/RoleProvider'
import { IconComment } from '@/components/icons'

/**
 * The persistent way into "Share your feedback" — a round button, bottom-right, present on
 * every page `FeedbackProvider` doesn't already exclude (the reading screen, the editor).
 *
 * Naturally absent while signed out, the same `known && email !== null` gate
 * `FeatureRequestScreen` already used: a control that appears and then vanishes reads as
 * broken, one that simply isn't there yet while the session is still being asked about does
 * not. Every public page — `/login`, `(auth)`, `(legal)`, `/pricing`, `/changelog` — needs
 * no separate check because of this alone.
 */
export function FeedbackLauncher() {
  const { known, email } = useRole()
  const { open } = useFeedback()

  if (!known || email === null) return null

  return (
    <button type="button" className="feedback-launcher" onClick={open} aria-label="Share your feedback">
      <IconComment size={22} />
    </button>
  )
}
