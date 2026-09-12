'use client'

import { useState } from 'react'

import { CourtesyConfirmModal } from '@/components/CourtesyConfirmModal'
import type { CourtesyKind } from '@/components/CourtesyConfirmModal'
import { IconComment, IconSend } from '@/components/icons'

interface Props {
  ownerEmail: string
  thanksSent: boolean
  checkinSent: boolean
  optedOut: boolean
}

/**
 * The two courtesy-email buttons in the Actions column of `/accounts` — two independent
 * controls, each with three states: **sendable** (dim, clickable), **sent** (solid, a `done`
 * row exists, no longer clickable), and **blocked** (dim and disabled for a reason other than
 * "already sent" — the check-in before its thank-you, or the address opted out).
 *
 * Returns a fragment rather than its own wrapping element: the page draws one flex row per
 * account (`.accounts-courtesy`) holding these two plus the row's own View control, so the
 * three read as one "Actions" group rather than two groups sitting side by side.
 *
 * Different glyphs for the two, where a single `IconMail` used to stand for both and told
 * them apart only by tooltip: `IconSend` is this app's own mark for something aimed at a
 * reader (`Account Detail.dc.html`'s Outreach tab), which is what the thank-you is, first
 * touch; `IconComment` is the check-in, which is a question rather than an announcement.
 *
 * State is seeded from `listCourtesyStatus()` (the initial page load) and flipped locally the
 * moment a send actually succeeds, so an operator sees the icon light up without a full page
 * reload — `revalidatePath('/accounts')` inside the send action keeps the *next* load correct
 * regardless.
 */
export function CourtesyIcons({ ownerEmail, thanksSent: initialThanksSent, checkinSent: initialCheckinSent, optedOut }: Props) {
  const [thanksSent, setThanksSent] = useState(initialThanksSent)
  const [checkinSent, setCheckinSent] = useState(initialCheckinSent)
  const [open, setOpen] = useState<CourtesyKind | null>(null)

  /* The code-level ordering rule stated in `lib/courtesy/CLAUDE.md`: the check-in's own copy
     ("still Francesco," "a second and last time") is only true once the thank-you has gone
     out. `sendCourtesyCheckin` refuses this server-side regardless; disabling the icon here is
     what lets an operator see why before ever pressing it. */
  const checkinBlocked = !thanksSent

  return (
    <>
      <button
        type="button"
        className={`accounts-courtesy-icon${thanksSent ? ' is-sent' : ''}`}
        disabled={optedOut || thanksSent}
        title={optedOut ? 'Unsubscribed from courtesy emails' : thanksSent ? 'Thank-you email sent' : 'Send the thank-you email'}
        aria-label={
          optedOut
            ? 'Unsubscribed from courtesy emails'
            : thanksSent
              ? 'Thank-you email already sent'
              : 'Send the thank-you email'
        }
        onClick={() => setOpen('thanks')}
      >
        <IconSend size={13} />
      </button>
      <button
        type="button"
        className={`accounts-courtesy-icon${checkinSent ? ' is-sent' : ''}`}
        disabled={optedOut || checkinSent || checkinBlocked}
        title={
          optedOut
            ? 'Unsubscribed from courtesy emails'
            : checkinSent
              ? 'Check-in email sent'
              : checkinBlocked
                ? 'Send the thank-you email first'
                : 'Send the check-in email'
        }
        aria-label={
          optedOut
            ? 'Unsubscribed from courtesy emails'
            : checkinSent
              ? 'Check-in email already sent'
              : checkinBlocked
                ? 'Send the check-in email — blocked until the thank-you email is sent'
                : 'Send the check-in email'
        }
        onClick={() => setOpen('checkin')}
      >
        <IconComment size={13} />
      </button>

      {open !== null && (
        <CourtesyConfirmModal
          kind={open}
          ownerEmail={ownerEmail}
          onClose={() => setOpen(null)}
          onSent={() => (open === 'thanks' ? setThanksSent(true) : setCheckinSent(true))}
        />
      )}
    </>
  )
}
