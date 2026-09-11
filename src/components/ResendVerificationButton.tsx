'use client'

import { useState } from 'react'

import { resetTurnstile, TurnstileWidget } from '@/components/TurnstileWidget'
import { resendVerification } from '@/lib/register/actions'
import { RESEND_MESSAGE } from '@/lib/register/types'

/**
 * The "Rispedisci l'email" arm of `/verify`'s error state (v3.2) — only
 * ever mounted once `check.ts` has already found a `pendingRegistrations` row for this
 * address, expired token or not. A fresh `TurnstileWidget` instance is fine here, unlike
 * `RegisterForm`'s own reuse of one across a phase switch: this component is never
 * remounted in place, it is the only thing rendered for this branch from the start.
 */
export function ResendVerificationButton({ email }: { email: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    try {
      const result = await resendVerification(formData)
      if (result.ok) {
        setSent(true)
      } else {
        /* The message first, the reset after — `resetTurnstile` is a call into Cloudflare's
           script, and this app's own error reporting must not be downstream of whether a
           third party throws. It cannot throw any more (see its own comment); it did, and
           this ordering is what stops that class of accident recurring rather than the guard
           alone. Same in the `catch` below, which is the rescue path this outranks. */
        setError(RESEND_MESSAGE[result.reason])
        resetTurnstile()
      }
    } catch {
      setError(RESEND_MESSAGE.failed)
      resetTurnstile()
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <p className="notice notice-success mt-4" role="status">
        <span>
          Check your inbox at <strong>{email}</strong> for a new link.
        </span>
      </p>
    )
  }

  return (
    <form className="mt-4 grid gap-2.5" onSubmit={submit}>
      <input type="hidden" name="email" value={email} />

      {error !== null && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      <TurnstileWidget />

      <button type="submit" className="btn btn-primary w-full justify-center py-3" disabled={busy}>
        Resend email
      </button>
    </form>
  )
}
