'use client'

import { useId, useRef, useState } from 'react'

import { IconClose } from '@/components/icons'
import { sendGiftNotice } from '@/lib/accounts/actions'
import { MAX_GIFT_PERSONAL_LINE, MAX_GIFT_SUBJECT, defaultGiftSubject } from '@/lib/accounts/giftNotice'
import { GIFT_NOTICE_MESSAGE } from '@/lib/accounts/types'
import { giftEmail } from '@/lib/email/templates'
import { useDialogA11y } from '@/lib/useDialogA11y'
import { useOnline } from '@/lib/useOnline'

interface Props {
  ownerEmail: string
  /** `PLAN_LABEL`'s spelling for the gift that was just given. */
  planLabel: string
  /** The end date already written out («1 March 2027»), or null for a gift with no end. */
  endsOn: string | null
  onClose: () => void
  /** Told once the message has actually gone, so the panel behind can say so in its own line. */
  onSent: (said: string) => void
}

/**
 * The confirmation dialog for telling a reader about the gift they have just been given —
 * subject and message already written, so an operator with nothing to add can simply press
 * Send.
 *
 * **The gift is already saved by the time this opens.** Dismissing it, going offline, or a
 * refused send all leave the account exactly as it was set: this dialog only ever decides
 * whether somebody is *told*. That is why closing it is a plain close with no warning, and why
 * a failure keeps it open rather than rolling anything back.
 *
 * **Two fields, and the body is not one of them.** The subject is editable because it is the
 * one line a reader sees before opening anything, and the personal line because a gift with a
 * sentence attached to it is a different object from a form letter. What the message *claims*
 * — which plan, until when — is neither typed nor even sent: `sendGiftNotice` reads it back
 * out of the account row, so no press here can announce a plan the account does not hold.
 * The preview below is built with the same template and the same values the action will use,
 * which is what makes it a preview rather than a description.
 *
 * The preview is the plain-text half, deliberately. It is one of the two bodies genuinely
 * sent, so it cannot drift from the message the way a hand-written summary would, and it
 * needs no iframe inside a dialog — `/emails` is where the HTML is checked against a real
 * mail client, with this template among the six.
 */
export function GiftNoticeModal({ ownerEmail, planLabel, endsOn, onClose, onSent }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const subjectId = useId()
  const lineId = useId()
  const online = useOnline()
  useDialogA11y(cardRef, onClose)

  const [subject, setSubject] = useState(() => defaultGiftSubject(planLabel))
  const [line, setLine] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedLine = line.trim()
  /* Rebuilt on every keystroke rather than memoised: it is string concatenation over a
     handful of clauses, and a preview that lags behind the field it previews is worse than
     one that costs nothing to compute. */
  const preview = giftEmail({
    planLabel,
    endsOn,
    personalLine: trimmedLine === '' ? null : trimmedLine,
    subject,
  }).text

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await sendGiftNotice(ownerEmail, { subject, personalLine: line })
      if (result.ok) {
        onSent(`Sent to ${ownerEmail}.`)
        onClose()
      } else {
        /* Kept open on every refusal, including «already sent»: each of those sentences is
           something the operator has to read, and a dialog that vanishes takes its own
           explanation with it. */
        setError(GIFT_NOTICE_MESSAGE[result.reason])
      }
    } catch {
      setError(GIFT_NOTICE_MESSAGE.failed)
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
          Tell them about it?
        </h2>
        <p className="mt-2 text-sm text-muted">
          The gift is saved either way. This only sends {ownerEmail} a note about it.
        </p>

        {error && (
          <p className="notice notice-error mt-3 text-sm" role="alert">
            {error}
          </p>
        )}

        <div className="mt-3">
          <label className="acct-label" htmlFor={subjectId}>
            Subject
          </label>
          <input
            id={subjectId}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="acct-field"
            // The client half of a limit `sendGiftNotice` also enforces, for the reason
            // `MAX_GRANT_NOTE` gives: an attribute is a hint to a browser.
            maxLength={MAX_GIFT_SUBJECT}
          />
        </div>

        <div className="mt-3">
          <span className="acct-label">Message</span>
          <div className="gift-preview" aria-label="The message as it will be sent">
            {preview}
          </div>
        </div>

        <div className="mt-3">
          <label className="acct-label" htmlFor={lineId}>
            A personal line (optional)
          </label>
          <input
            id={lineId}
            value={line}
            onChange={(event) => setLine(event.target.value)}
            placeholder="Something just for them — it goes under the gift"
            className="acct-field"
            maxLength={MAX_GIFT_PERSONAL_LINE}
          />
          {/* Said out loud because the field sits below the preview it writes into, and the
              reason for that order is that the preview is what an operator reads first. */}
          <p className="acct-hint">Whatever you type appears in the message above.</p>
        </div>

        <div className="upgrade-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!online || busy || subject.trim().length === 0}
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
