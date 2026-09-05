'use client'

import { useFeedback } from '@/components/FeedbackProvider'
import { useRole } from '@/components/RoleProvider'
import { IconComment } from '@/components/icons'

/**
 * The persistent way into "Share your feedback" — a round button, bottom-right, present on
 * every page `FeedbackProvider` doesn't already exclude (the reading screen, the editor).
 *
 * Absent while signed out, the same `known && email !== null` gate `FeatureRequestScreen`
 * already used: a control that appears and then vanishes reads as broken, one that simply
 * isn't there yet while the session is still being asked about does not.
 *
 * **That gate is about the reader, and it was once mistaken for a gate about the page.** This
 * comment used to claim every public page was covered by it alone — true only of a signed-out
 * visitor, which is how anybody checking `/pricing` or the blog would have looked. A reader
 * with a session on those same pages got the bubble. The page half of the question is
 * `isSessionFreePath`, asked by `FeedbackProvider`; both halves have to hold.
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
