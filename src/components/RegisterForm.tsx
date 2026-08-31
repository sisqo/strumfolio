'use client'

import { useState } from 'react'

import { resetTurnstile, TurnstileWidget } from '@/components/TurnstileWidget'
import { MIN_PASSWORD } from '@/lib/auth/types'
import { register } from '@/lib/register/actions'
import { REGISTER_MESSAGE } from '@/lib/register/types'

type Phase = 'form' | 'sent'

/**
 * The email/password half of `/register` (v3.2, PLAN.md point 4) — the Google button
 * next to it needs none of this, since a successful OAuth sign-in already redirects on
 * its own (see `page.tsx`).
 *
 * One `<form>`, not two: the fields sent by `register` become hidden once the request
 * has gone through once, and the same submit handler serves the "resend" button that
 * appears in their place — this is the "no separate resend action" PLAN.md asks for,
 * since `register`'s own upsert on `pendingRegistrations.email` already renews the token
 * without failing (see `lib/register/actions.ts`).
 *
 * `TurnstileWidget` itself is never remounted across that switch — see the comment
 * next to it below for why a fresh instance would be worse, not better, for "Resend".
 */
export function RegisterForm() {
  const [phase, setPhase] = useState<Phase>('form')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentCount, setSentCount] = useState(0)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    try {
      const result = await register(formData)
      if (result.ok) {
        setPhase('sent')
        setSentCount((count) => count + 1)
      } else {
        resetTurnstile()
        setError(REGISTER_MESSAGE[result.reason])
      }
    } catch {
      resetTurnstile()
      setError(REGISTER_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="grid gap-2.5" onSubmit={submit}>
      {phase === 'sent' && (
        <p className="notice notice-success" role="status">
          <span>
            {sentCount > 1 ? 'Sent again — check ' : 'Check '}
            your inbox at <strong>{email}</strong> for a link to finish setting up your account.
          </span>
        </p>
      )}

      {error !== null && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      {phase === 'form' ? (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block">
              <span className="sr-only">First name</span>
              <input
                type="text"
                name="firstName"
                required
                autoComplete="given-name"
                placeholder="First name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="form-field"
              />
            </label>

            <label className="block">
              <span className="sr-only">Last name</span>
              <input
                type="text"
                name="lastName"
                required
                autoComplete="family-name"
                placeholder="Last name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="form-field"
              />
            </label>
          </div>

          <label className="block">
            <span className="sr-only">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="form-field"
            />
          </label>

          <label className="block">
            <span className="sr-only">Password</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="new-password"
              placeholder={`Password — at least ${MIN_PASSWORD} characters`}
              minLength={MIN_PASSWORD}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="form-field"
            />
          </label>

          <label className="block">
            <span className="sr-only">Confirm password</span>
            <input
              type="password"
              name="confirmPassword"
              required
              autoComplete="new-password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="form-field"
            />
          </label>
        </>
      ) : (
        <>
          <input type="hidden" name="email" defaultValue={email} />
          <input type="hidden" name="firstName" defaultValue={firstName} />
          <input type="hidden" name="lastName" defaultValue={lastName} />
          <input type="hidden" name="password" defaultValue={password} />
          <input type="hidden" name="confirmPassword" defaultValue={confirmPassword} />
        </>
      )}

      {/*
       * Never remounted (no `key`) across the phase switch: Cloudflare's implicit
       * rendering (`TurnstileWidget`'s own comment) scans the DOM exactly once, at
       * script load, so a fresh `.cf-turnstile` node inserted later is never picked up
       * at all — remounting here would leave "Resend" with no captcha token, not
       * merely a stale one. `submit` only calls `resetTurnstile()` on the failure path,
       * not on success: keeping the same spent token across the phase switch means
       * "Resend" clicked right after "Create account" is correctly refused by
       * `verifyTurnstile` (Turnstile tokens are single-use), the same way a plain retry
       * after a failed "Create account" now gets a fresh token instead of resending the
       * one `verifyTurnstile` already consumed.
       */}
      <TurnstileWidget />

      <button type="submit" className="btn btn-primary mt-1 w-full justify-center py-3" disabled={busy}>
        {phase === 'form' ? 'Create account' : 'Resend email'}
      </button>
    </form>
  )
}
