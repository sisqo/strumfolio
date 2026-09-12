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
 * The two courtesy-email buttons in the Actions column of `/accounts` (`Accounts.dc.html`,
 * revised 2026-09-12) — two independent controls, each with three states: **sendable** (dim,
 * clickable), **sent** (solid, a `done` row exists, no longer clickable), and **blocked**
 * (dim and disabled for a reason other than "already sent" — the check-in before its
 * thank-you, or the address opted out).
 *
 * Both share one glyph, the mail mark — they are the same kind of thing, a one-to-one,
 * reply-carrying note, the same reasoning `OutreachPanel`'s own `KIND_ICON` already gives for
 * its courtesy rows — and are told apart by a small numbered badge instead (1 for the
 * thank-you, 2 for the check-in), which is what the mock draws. An earlier version of this
 * column gave the two different glyphs (a paper plane, a speech bubble); the mock settled on
 * one shape plus a badge instead, and this now matches it exactly.
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
        <IconMail size={14} />
        <span className="accounts-courtesy-badge" aria-hidden>
          1
        </span>
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
        <IconMail size={14} />
        <span className="accounts-courtesy-badge" aria-hidden>
          2
        </span>
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
