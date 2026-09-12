'use client'

import { useState } from 'react'

import { CourtesyConfirmModal } from '@/components/CourtesyConfirmModal'
import type { CourtesyKind } from '@/components/CourtesyConfirmModal'
import { IconMail } from '@/components/icons'

interface Props {
  ownerEmail: string
  thanksSent: boolean
  checkinSent: boolean
  optedOut: boolean
}

/**
 * The two courtesy-email icons on one row of `/accounts` — one column, two independent
 * buttons, each with three states: **sendable** (dim, clickable), **sent** (solid, a `done`
 * row exists, no longer clickable), and **blocked** (dim and disabled for a reason other than
 * "already sent" — the check-in before its thank-you, or the address opted out).
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
    <span className="accounts-courtesy">
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
        <IconMail size={13} />
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
        <IconMail size={13} />
      </button>

      {open !== null && (
        <CourtesyConfirmModal
          kind={open}
          ownerEmail={ownerEmail}
          onClose={() => setOpen(null)}
          onSent={() => (open === 'thanks' ? setThanksSent(true) : setCheckinSent(true))}
        />
      )}
    </span>
  )
}
