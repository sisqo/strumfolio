'use client'

import { usePathname } from 'next/navigation'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

import { FeedbackLauncher } from '@/components/FeedbackLauncher'
import { FeedbackSheet } from '@/components/FeedbackSheet'

interface FeedbackContextValue {
  open: () => void
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

/**
 * The reading screen and the editor — the two surfaces "Share your feedback" deliberately
 * never appears on, launcher or menu entry alike, because they are where a reader's or an
 * editor's attention belongs entirely to the song. `/songs/[slug]` is the reader,
 * `/songs/[slug]/edit` the editor; nothing else in the app lives one level under `/songs/`.
 */
function isExcludedRoute(pathname: string): boolean {
  return /^\/songs\/[^/]+(\/edit)?$/.test(pathname)
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
