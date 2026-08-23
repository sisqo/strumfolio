'use client'

import { useEffect, useState } from 'react'

/**
 * The live value a CSS custom property resolves to right now — read off the page rather
 * than typed by hand, so it can never say something the token itself has stopped saying.
 * Every swatch in `/design-system` already paints itself with `var(--x)` and needs no
 * script to do it; this is only for the text beside it, which a stylesheet cannot print.
 *
 * Re-reads on every `data-theme` change (`ThemeToggle`, `ThemePicker`) and on a system
 * scheme change while the choice is auto, so the number on screen always matches whichever
 * theme the reader is actually looking at — never a light value shown while dark is on, or
 * the reverse.
 */
export function TokenValue({ name }: { name: string }) {
  const [value, setValue] = useState('')

  useEffect(() => {
    const read = () => {
      setValue(getComputedStyle(document.documentElement).getPropertyValue(name).trim())
    }
    read()

    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', read)

    return () => {
      observer.disconnect()
      media.removeEventListener('change', read)
    }
  }, [name])

  /* Empty until the effect above runs — never a value guessed ahead of the real one. */
  return <span className="font-mono">{value || '…'}</span>
}
