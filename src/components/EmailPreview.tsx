'use client'

import { useEffect, useRef, useState } from 'react'

import { IconCheck } from '@/components/icons'
import { COURTESY_FROM, COURTESY_REPLY_TO } from '@/lib/courtesy/types'
import { sendTestEmail } from '@/lib/email/actions'
import { PREVIEW_KEYS, PREVIEW_LABEL, isCourtesyPreview } from '@/lib/email/preview'
import type { PreviewKey } from '@/lib/email/preview'
import type { EmailTemplate } from '@/lib/email/templates'
import { useOnline } from '@/lib/useOnline'

const FAILURE_MESSAGE: Record<'no-session' | 'not-owner', string> = {
  'no-session': 'Your session expired — sign in again.',
  'not-owner': 'Only a global owner can send a test email.',
}

/** The two tab rows (`Email Previews.dc.html`), derived from `PREVIEW_KEYS` rather than
    listed a second time here. */
const TRANSACTIONAL_KEYS = PREVIEW_KEYS.filter((key) => !isCourtesyPreview(key))
const COURTESY_KEYS = PREVIEW_KEYS.filter(isCourtesyPreview)

/** How long "Sent — check your inbox." stands before it clears itself. */
const SENT_TIMEOUT_MS = 3500

/**
 * The tabbed viewer behind `/emails`: two rows of templates — six transactional, two
 * courtesy — each's sender, its subject, an HTML/plain-text toggle, and a button that sends
 * the real thing to whoever is signed in.
 *
 * The HTML goes into an `<iframe srcDoc>`, not straight into this page's DOM: those inline
 * styles are built for a mail client, not to sit next to Tailwind and this page's own resets
 * — and unlike the rest of this app, the frame is deliberately always light, because that is
 * what every inbox will actually show regardless of the reader's own theme.
 *
 * `defaultFrom` arrives as a prop rather than a constant declared here: the real value can
 * carry an env override (`RESEND_FROM`), read by `email/send.ts`, which pulls in the Resend
 * SDK — importing that here would put it in this client component's bundle for nothing. The
 * two courtesy templates need no such prop: `COURTESY_FROM`/`COURTESY_REPLY_TO` live in
 * `courtesy/types.ts`, written to be safely importable from client code (see that file's own
 * header) since a `'use server'` module may not export a plain constant at all.
 */
export function EmailPreview({ previews, defaultFrom }: { previews: Record<PreviewKey, EmailTemplate>; defaultFrom: string }) {
  const online = useOnline()
  const [active, setActive] = useState<PreviewKey>('verification')
  const [mode, setMode] = useState<'html' | 'text'>('html')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const doneTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(doneTimer.current), [])

  const template = previews[active]
  const courtesy = isCourtesyPreview(active)
  const from = courtesy ? COURTESY_FROM : defaultFrom
  const replyTo = courtesy ? COURTESY_REPLY_TO : null

  const select = (key: PreviewKey) => {
    setActive(key)
    setError(null)
    setDone(null)
  }

  const send = async () => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await sendTestEmail(active)
      if (result.ok) {
        setDone('Sent — check your inbox.')
        clearTimeout(doneTimer.current)
        // Transient rather than left standing: an operator sending several templates in a
        // row would otherwise read a stale "Sent" beside a template it was never true of.
        doneTimer.current = setTimeout(() => setDone(null), SENT_TIMEOUT_MS)
      } else {
        setError(FAILURE_MESSAGE[result.reason])
      }
    } catch {
      setError('Could not send the test email.')
    } finally {
      setBusy(false)
    }
  }

  const tabRow = (keys: readonly PreviewKey[], label: string) => (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="w-[6.625rem] flex-none text-[0.6875rem] font-semibold uppercase tracking-[0.07em] text-faint">
        {label}
      </span>
      <div className="segment w-fit flex-wrap" role="tablist" aria-label={`${label} emails`}>
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={key === active}
            className={key === active ? 'segment-button is-on px-4' : 'segment-button px-4'}
            onClick={() => select(key)}
          >
            {PREVIEW_LABEL[key]}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="card p-4">
      <div className="mb-4 flex flex-col gap-2">
        {tabRow(TRANSACTIONAL_KEYS, 'Transactional')}
        {tabRow(COURTESY_KEYS, 'Courtesy')}
      </div>

      <dl className="mb-4 grid grid-cols-[6.625rem_1fr] gap-x-2.5 gap-y-2.5 border-t border-line-soft pt-4 text-[0.96875rem]">
        <dt className="text-[0.6875rem] font-semibold uppercase leading-[1.5] tracking-[0.07em] text-faint">From</dt>
        <dd className="m-0 break-words text-ink">{from}</dd>
        {replyTo !== null && (
          <>
            <dt className="text-[0.6875rem] font-semibold uppercase leading-[1.5] tracking-[0.07em] text-faint">Reply to</dt>
            <dd className="m-0 break-words text-ink">{replyTo}</dd>
          </>
        )}
        <dt className="text-[0.6875rem] font-semibold uppercase leading-[1.5] tracking-[0.07em] text-faint">Subject</dt>
        <dd className="m-0 font-medium text-ink">{template.subject}</dd>
      </dl>

      <div className="segment mb-3 w-fit" role="group" aria-label="View as">
        <button
          type="button"
          className={mode === 'html' ? 'segment-button is-on px-4' : 'segment-button px-4'}
          aria-pressed={mode === 'html'}
          onClick={() => setMode('html')}
        >
          HTML
        </button>
        <button
          type="button"
          className={mode === 'text' ? 'segment-button is-on px-4' : 'segment-button px-4'}
          aria-pressed={mode === 'text'}
          onClick={() => setMode('text')}
        >
          Plain text
        </button>
      </div>

      {mode === 'html' ? (
        /* `p-4` insets the document inside the frame without changing a byte of it: the two
           courtesy notes carry no chrome of their own (`plainMessage`, `email/templates.ts`),
           so without it they sit at the browser's default 8px from the border and read as
           broken — when in a real inbox that air is what the client puts there. Unconditional
           rather than behind `isCourtesyPreview`: the six transactional templates bring their
           own wash and cannot tell the difference. */
        <iframe
          title={`${PREVIEW_LABEL[active]} preview`}
          srcDoc={template.html}
          className="h-[520px] w-full rounded-[var(--r-lg)] border border-line bg-white p-4"
        />
      ) : (
        <pre className="h-[520px] overflow-auto whitespace-pre-wrap rounded-[var(--r-lg)] border border-line bg-nested p-3 text-sm text-ink">
          {template.text}
        </pre>
      )}

      {error && (
        <p className="notice notice-error mt-3" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="notice notice-success mt-3" role="status">
          <IconCheck />
          {done}
        </p>
      )}

      <button type="button" className="btn btn-primary btn-sm mt-3" disabled={!online || busy} onClick={() => void send()}>
        Send to myself
      </button>
    </div>
  )
}
