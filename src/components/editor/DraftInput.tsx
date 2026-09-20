'use client'

import { useState } from 'react'

/**
 * An input whose value round-trips through the document between keystrokes.
 *
 * **The bug this exists to fix: you could not type a space.** A directive row writes its
 * value into `{album: …}` and reads it straight back, and the parse trims — `{album: Disco }`
 * and `{album: Disco}` are the same directive, so the trailing space died on the way back
 * and the next letter landed against the previous word. «Disco di prova» came out
 * «Discodiprova», in the form and in the graphic editor's directive rows alike. Found by
 * typing a value with a space in it in a browser, which no test here had done: every fixture
 * in the suite is one word.
 *
 * So while somebody is typing, what they typed wins. The draft is kept locally and shown
 * instead of the document's value — **but only while the two still agree once trimmed**,
 * which is what keeps this from becoming a second copy of the truth. Undo, a change from
 * the source tab, anything that moves the value out from under the caret makes the two
 * disagree, and the document wins immediately. Blur clears the draft outright.
 *
 * Deliberately not a debounce: every keystroke still reaches the document, so Save and Undo
 * see exactly what they saw before. The draft changes what is *drawn*, never what is stored.
 */
export function DraftInput({
  value,
  onChange,
  className,
  ...rest
}: {
  value: string
  onChange: (next: string) => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft !== null && draft.trim() === value.trim() ? draft : value

  return (
    <input
      {...rest}
      className={className}
      value={shown}
      onChange={(event) => {
        setDraft(event.target.value)
        onChange(event.target.value)
      }}
      onBlur={(event) => {
        setDraft(null)
        rest.onBlur?.(event)
      }}
    />
  )
}
