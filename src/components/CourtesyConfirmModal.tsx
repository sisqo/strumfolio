'use client'

import { useId, useRef, useState } from 'react'

import { IconClose } from '@/components/icons'
import { sendCourtesyCheckin, sendCourtesyThanks } from '@/lib/courtesy/actions'
import { COURTESY_MESSAGE } from '@/lib/courtesy/types'
import { courtesyCheckinEmail, courtesyThanksEmail } from '@/lib/email/templates'
import { useDialogA11y } from '@/lib/useDialogA11y'
import { useOnline } from '@/lib/useOnline'

export type CourtesyKind = 'thanks' | 'checkin'

interface Props {
  kind: CourtesyKind
  ownerEmail: string
  onClose: () => void
  /** Told once the send actually succeeded, so `CourtesyIcons` can flip its own icon lit. */
  onSent: () => void
}

const TITLE: Record<CourtesyKind, string> = {
  thanks: 'Send the thank-you email?',
  checkin: 'Send the check-in email?',
}

/*
 * A placeholder, never a real one: the preview below is built client-side, with no account to
 * mint a real link for, and it is never sent anywhere — `sendCourtesyThanks`/
 * `sendCourtesyCheckin` build the real link themselves, server-side, from the account this
 * modal is opened for. The same reasoning `/emails`' own previews follow with `SAMPLE_TOKEN`.
 */
const PLACEHOLDER_UNSUBSCRIBE_URL = 'https://strumfolio.com/courtesy-unsubscribe'

/**
 * The confirmation dialog for either courtesy email — the `GiftNoticeModal` shape, minus every
 * editable field, since nothing in this copy is typed by an operator. What it shows is the
 * plain-text half of the real template, exactly as `GiftNoticeModal`'s own preview is: the one
 * of the two genuinely-sent bodies, so it cannot drift from what actually goes out.
 *
 * **The name is never known here.** `/accounts`' list has the address, not the first name, so
 * the preview reads "Hi," throughout; the real send fills it in from the account row if one is
 * on file. Fetching names into the list just for this preview was judged not worth a second
 * query over every row on the page.
 */
export function CourtesyConfirmModal({ kind, ownerEmail, onClose, onSent }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const online = useOnline()
  useDialogA11y(cardRef, onClose)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preview = (
    kind === 'thanks'
      ? courtesyThanksEmail({ firstName: null, unsubscribeUrl: PLACEHOLDER_UNSUBSCRIBE_URL })
      : courtesyCheckinEmail({ firstName: null, unsubscribeUrl: PLACEHOLDER_UNSUBSCRIBE_URL })
  ).text

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = kind === 'thanks' ? await sendCourtesyThanks(ownerEmail) : await sendCourtesyCheckin(ownerEmail)
      if (result.ok) {
        onSent()
        onClose()
      } else {
        /* Kept open on every refusal: each of those sentences is something the operator has
           to read, and a dialog that vanishes takes its own explanation with it. */
        setError(COURTESY_MESSAGE[result.reason])
      }
    } catch {
      setError(COURTESY_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="upgrade-overlay">
      <div className="upgrade-backdrop" onClick={onClose} aria-hidden />

      <div
        ref={cardRef}
        className="upgrade-card is-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <button type="button" className="upgrade-close" onClick={onClose} aria-label="Close">
          <IconClose size={18} />
        </button>

        <h2 className="section-title" id={titleId}>
          {TITLE[kind]}
        </h2>
        <p className="mt-2 text-sm text-muted">
          To {ownerEmail}. Their name is filled in automatically if we have one on file.
        </p>

        {error && (
          <p className="notice notice-error mt-3 text-sm" role="alert">
            {error}
          </p>
        )}

        <div className="mt-3">
          <span className="acct-label">Message</span>
          <div className="gift-preview" aria-label="The message as it will be sent">
            {preview}
          </div>
        </div>

        <div className="upgrade-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!online || busy}
            onClick={() => void send()}
          >
            {busy ? 'Sending…' : 'Send'}
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={onClose} disabled={busy}>
            Don’t send
          </button>
        </div>
      </div>
    </div>
  )
}
