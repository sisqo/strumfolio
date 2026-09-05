'use client'

import { usePathname } from 'next/navigation'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

import { FeedbackLauncher } from '@/components/FeedbackLauncher'
import { FeedbackSheet } from '@/components/FeedbackSheet'
import { isSessionFreePath } from '@/lib/publicRoutes'

interface FeedbackContextValue {
  open: () => void
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

/**
 * Where "Share your feedback" deliberately never appears, launcher or menu entry alike.
 *
 * Two different reasons, kept apart because they would be edited for different causes:
 *
 * 1. **The reading screen and the editor.** `/songs/[slug]` is the reader,
 *    `/songs/[slug]/edit` the editor; nothing else in the app lives one level under
 *    `/songs/`. Attention there belongs entirely to the song.
 * 2. **Every public page** — the sign-in form, `/pricing`, `/changelog`, the tools, the
 *    legal documents, the blog, a Strum Together guest's screen. Feedback is a thing you
 *    give about an app you are *using*, from inside it; on the pages somebody reads while
 *    deciding whether to sign up it is a support widget on a shop window.
 *
 * The second was missing and the bug it left was invisible to whoever wrote it: signed
 * *out*, `FeedbackLauncher` renders nothing anyway, so `/pricing` and the blog looked
 * correct to anybody who checked them the obvious way. A reader with a session standing on
 * those same pages got the bubble. `isSessionFreePath` is asked rather than a second list
 * copied here, so a public page added tomorrow is covered without anybody remembering this
 * file exists.
 */
function isExcludedRoute(pathname: string): boolean {
  return /^\/songs\/[^/]+(\/edit)?$/.test(pathname) || isSessionFreePath(pathname)
}

/**
 * The one open/close state behind "Share your feedback", shared by two triggers that share
 * no closer ancestor than root layout: the floating launcher, a sibling of every page, and
 * the hamburger menu's own entry, inside `TopBar`, rendered by each page separately — the
 * exact situation `StrumTogetherProvider`'s own comment describes for its two consumers.
 *
 * Renders the launcher and the one sheet instance itself, so mounting this once in
 * `src/app/layout.tsx` is the entire wiring: nothing else has to remember to render either.
 */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  const value = useMemo<FeedbackContextValue>(() => ({ open: () => setOpen(true) }), [])

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {!isExcludedRoute(pathname) && <FeedbackLauncher />}
      {open && <FeedbackSheet onClose={() => setOpen(false)} />}
    </FeedbackContext.Provider>
  )
}

export function useFeedback(): FeedbackContextValue {
  const context = useContext(FeedbackContext)
  if (context === null) throw new Error('useFeedback must be used inside a FeedbackProvider')
  return context
}
