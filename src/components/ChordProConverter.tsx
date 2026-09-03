'use client'

import { useMemo, useState } from 'react'

import { convert, type InputFormat } from '@/lib/import/convert'
import { splitSongs } from '@/lib/import/split'

/**
 * The converter itself: paste on the left, ChordPro on the right.
 *
 * **It runs entirely in the browser**, and that is the product decision rather than an
 * implementation detail. Somebody arriving from a search has not signed in, may never sign
 * in, and is holding a chord sheet they want converted *now*. A round trip would mean an
 * account, or a rate limit, or at best a spinner; none of those help them and all of them
 * cost the trust that makes them read the rest of the page.
 *
 * It costs nothing to do it here because the conversion was already a pure function.
 * `lib/import/convert.ts` is the same module the signed-in import screen uses — not a
 * simplified copy written for marketing, which would drift from the real one and quietly
 * start promising a conversion the app does not perform. What this page shows is what the
 * app will do with the same paste.
 *
 * Nothing is sent anywhere and nothing is stored. That is worth saying on the page, because
 * a musician pasting unreleased words has every reason to ask.
 */

/** What the detector found, said in words rather than as a format name. */
const VERDICT: Record<InputFormat, string> = {
  chordpro: 'This is already ChordPro — nothing to convert.',
  'chords-above': 'Chords above the words, converted.',
  'lyrics-only': 'No chord lines found — the words came through unchanged.',
}

/**
 * The example behind «Use an example», and its columns are load-bearing.
 *
 * A chord sits over the syllable its column lands on — that is the whole format being
 * demonstrated — so a sample aligned by eye converts to `hom[F]e` and shows a first-time
 * visitor a failure at the first click. These columns were counted: `F` at 21 is «late», `C`
 * at 4 is «I», `G` at 17 is «anyway». Check the output, not the look, if you ever edit it.
 */
const SAMPLE = `Am                   F
The last bus home is late
    C            G
and I am singing anyway`

export function ChordProConverter() {
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)

  /* Recomputed on every keystroke, which is affordable: it is a line-by-line pass over a
   * song, not over a library. */
  const result = useMemo(() => (text.trim() === '' ? null : convert(text)), [text])

  /* How many songs the paste holds. Shown only when it is more than one, because that is the
   * moment to mention the app can split them — see the note below the output. */
  const songCount = useMemo(() => (text.trim() === '' ? 0 : splitSongs(text).length), [text])

  const output = result?.body ?? ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
      /* No timer to clear on unmount: the label resets on the next edit instead, which is the
       * next thing that happens anyway. */
    } catch {
      /* A browser that refuses clipboard access (no permission, insecure origin) leaves the
       * text selectable in the box, which is the fallback that always works. */
      setCopied(false)
    }
  }

  function download() {
    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'song.chopro'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="tool">
      <div className="tool-panes">
        <div className="tool-pane">
          <div className="tool-pane-head">
            <label htmlFor="tool-input" className="tool-pane-label">
              Paste your chord sheet
            </label>
            <button
              type="button"
              className="tool-link-button"
              onClick={() => {
                setText(SAMPLE)
                setCopied(false)
              }}
            >
              Use an example
            </button>
          </div>

          <textarea
            id="tool-input"
            className="tool-input"
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setCopied(false)
            }}
            placeholder={SAMPLE}
            spellCheck={false}
            /* Chord names are one and two letters long; a browser translating this box would
               turn A into La and the paste into nonsense. Same rule as the sheet and the
               editor — see app/layout.tsx. */
            translate="no"
            rows={14}
          />
        </div>

        <div className="tool-pane">
          <div className="tool-pane-head">
            <span className="tool-pane-label">ChordPro</span>

            {output !== '' && (
              <span className="tool-pane-actions">
                <button type="button" className="tool-link-button" onClick={copy}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button type="button" className="tool-link-button" onClick={download}>
                  Download
                </button>
              </span>
            )}
          </div>

          <textarea
            className="tool-input tool-output"
            value={output}
            readOnly
            spellCheck={false}
            translate="no"
            rows={14}
            placeholder="The converted song appears here."
            aria-label="ChordPro output"
          />
        </div>
      </div>

      {/* `aria-live` so the verdict is announced when it changes rather than only being
          visible — it is the one thing on the page that answers "did this work". */}
      <p className="tool-verdict" aria-live="polite">
        {result === null ? 'Paste a chord sheet above, or try the example.' : VERDICT[result.format]}
        {songCount > 1 && ` ${songCount} songs in this paste — Strumfolio splits them on import.`}
      </p>
    </div>
  )
}
