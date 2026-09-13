'use client'

import { useEffect, useState } from 'react'

/**
 * Which theme is actually on the screen right now — `light` or `dark`, never the reader's
 * *choice*, which has a third value.
 *
 * **`auto` is why this cannot be read from one place.** `theme.ts` stores `auto | light | dark`
 * and the inline script in `app/layout.tsx` writes `data-theme` **only** for the two explicit
 * ones, leaving the media query in `globals.css` to decide the rest. So answering the question
 * takes both sources, and watching it takes both listeners: a mutation on the attribute, and a
 * change of the system scheme while no attribute is set.
 *
 * `TokenValue` runs the same pair for a different purpose — it re-reads a computed custom
 * property rather than naming a theme — and is deliberately left as it is; this exists because
 * something needed the *name*, to hand to a third party that cannot read our CSS.
 *
 * The first value is `light` on the server and until the effect runs, which is right for the
 * only caller: the value is used as a *signal that the theme changed*, and the thing it drives
 * reads the DOM itself at the moment it acts. Anything that renders differently per theme
 * should use CSS custom properties instead and never this.
 */
export type ResolvedTheme = 'light' | 'dark'

export function resolvedTheme(): ResolvedTheme {
  if (typeof document === 'undefined') return 'light'

  const chosen = document.documentElement.dataset.theme
  if (chosen === 'dark' || chosen === 'light') return chosen

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>('light')

  useEffect(() => {
    const read = () => setTheme(resolvedTheme())
    read()

    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', read)

    return () => {
      observer.disconnect()
      media.removeEventListener('change', read)
    }
  }, [])

  return theme
}
