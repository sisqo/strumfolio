'use client'

import { useState } from 'react'

import { resetTurnstile, TurnstileWidget } from '@/components/TurnstileWidget'
import { requestPasswordReset } from '@/lib/forgotPassword/actions'
import { REQUEST_RESET_MESSAGE } from '@/lib/forgotPassword/types'

/**
 * `/forgot-password`'s only form (v3.2). The success message is the
 * same sentence whether or not the address turns out to have an account — see
 * `requestPasswordReset`'s own comment on why that has to be true regardless of what this
 * component does — so there is nothing here to make it a two-phase form the way
 * `RegisterForm` is: once sent, that is the only thing left to say.
 */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    try {
      const result = await requestPasswordReset(formData)
      if (result.ok) {
        setSent(true)
      } else {
        resetTurnstile()
        setError(REQUEST_RESET_MESSAGE[result.reason])
      }
    } catch {
      resetTurnstile()
      setError(REQUEST_RESET_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <p className="notice notice-accent" role="status">
        If that address has an account, you&apos;ll receive an email with a link to reset your
        password.
      </p>
    )
  }

  return (
    <form className="grid gap-2.5" onSubmit={submit}>
      {error !== null && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      <label className="block">
        <span className="sr-only">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="Email"
          className="form-field"
        />
      </label>

      <TurnstileWidget />

      <button type="submit" className="btn btn-primary mt-1 w-full justify-center py-3" disabled={busy}>
        Send reset link
      </button>
    </form>
  )
}
