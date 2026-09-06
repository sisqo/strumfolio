'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { MIN_PASSWORD } from '@/lib/auth/types'
import { resetPassword } from '@/lib/forgotPassword/actions'
import { RESET_PASSWORD_MESSAGE } from '@/lib/forgotPassword/types'

/**
 * `/reset-password`'s form, rendered only once the page's own read-only check has
 * already found a valid token (v3.2) — typing and submitting a password
 * is already the explicit action a scanner never takes, so this needs no intermediate
 * button the way `/verify` does.
 *
 * `email` and `token` travel as hidden fields rather than being read back out of the URL
 * a second time inside `resetPassword`: the page already resolved them once, and a hidden
 * field is the plain way a `FormData`-shaped action already expects to receive them (see
 * `RegisterForm`'s own hidden fields for the same reason).
 *
 * Navigates itself on success, with `useRouter`, rather than letting `resetPassword`
 * `redirect()` — see that function's own comment on why a direct client call is not the
 * place to lean on a server-side redirect.
 */
export function ResetPasswordForm({ email, token }: { email: string; token: string }) {
  const router = useRouter()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    try {
      const result = await resetPassword(formData)
      if (result.ok) {
        router.push('/login?reset=1')
      } else {
        setError(RESET_PASSWORD_MESSAGE[result.reason])
        setBusy(false)
      }
    } catch {
      setError(RESET_PASSWORD_MESSAGE.failed)
      setBusy(false)
    }
  }

  return (
    <form className="grid gap-2.5" onSubmit={submit}>
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="token" value={token} />

      {error !== null && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      <label className="block">
        <span className="field-label">New password — at least {MIN_PASSWORD} characters</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          className="form-field"
        />
      </label>

      <label className="block">
        <span className="field-label">Confirm password</span>
        <input
          type="password"
          name="confirmPassword"
          required
          autoComplete="new-password"
          className="form-field"
        />
      </label>

      <button type="submit" className="btn btn-primary mt-1 w-full justify-center py-3" disabled={busy}>
        Set new password
      </button>
    </form>
  )
}
