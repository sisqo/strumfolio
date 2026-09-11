'use client'

import { useEffect, useState } from 'react'

import { resetTurnstile, TurnstileWidget } from '@/components/TurnstileWidget'
import { MIN_PASSWORD } from '@/lib/auth/types'
import { register } from '@/lib/register/actions'
import { REGISTER_MESSAGE } from '@/lib/register/types'

type Phase = 'form' | 'sent'

/**
 * The email/password half of `/register` (v3.2) — the Google button
 * next to it needs none of this, since a successful OAuth sign-in already redirects on
 * its own (see `page.tsx`).
 *
 * One `<form>`, not two: the fields sent by `register` become hidden once the request
 * has gone through once, and the same submit handler serves the "resend" button that
 * appears in their place — this is the "no separate resend action" v3.2 asks for,
 * since `register`'s own upsert on `pendingRegistrations.email` already renews the token
 * without failing (see `lib/register/actions.ts`).
 *
 * `TurnstileWidget` itself is never remounted across that switch — see the comment
 * next to it below for why a fresh instance would hand "Resend" a token it has not earned.
 */
export function RegisterForm() {
  const [phase, setPhase] = useState<Phase>('form')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newsletterOptIn, setNewsletterOptIn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentCount, setSentCount] = useState(0)
  /**
   * This form has no `action`, unlike the inline server actions on `/login` — it
   * needs `onSubmit` for the phase switch, the controlled inputs, and the
   * Turnstile-reset-on-failure dance above, none of which a plain form action
   * gives it. That trade means it has no native fallback: a tap that lands before
   * React attaches this handler falls through to the browser's own submit, a GET
   * to this same URL with every field — password included — in the query string,
   * which reads as the button doing nothing and silently drops what was typed.
   * Starting the button disabled and enabling it once mounted closes that window
   * instead of leaving it to how fast the bundle happens to load.
   */
  const [ready, setReady] = useState(false)

  useEffect(() => setReady(true), [])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      const formData = new FormData(event.currentTarget)
      const result = await register(formData)
      if (result.ok) {
        setPhase('sent')
        setSentCount((count) => count + 1)
      } else {
        /* The message first, the reset after — `resetTurnstile` is a call into Cloudflare's
           script, and this app's own error reporting must not be downstream of whether a
           third party throws. It cannot throw any more (see its own comment); it did, and
           this ordering is what stops that class of accident recurring rather than the guard
           alone. Same in the `catch` below, which is the rescue path this outranks. */
        setError(REGISTER_MESSAGE[result.reason])
        resetTurnstile()
      }
    } catch {
      setError(REGISTER_MESSAGE.failed)
      resetTurnstile()
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

          {/* `.toggle-switch`, not a bare checkbox — same reasoning as `AppSettingsForm`'s
              own note: this is saved to the account, a real Toggle (DESIGN.md §5). */}
          <label className="row cursor-pointer">
            <input
              type="checkbox"
              role="switch"
              name="newsletterOptIn"
              className="toggle-switch"
              checked={newsletterOptIn}
              onChange={(event) => setNewsletterOptIn(event.target.checked)}
            />
            <span className="text-sm text-ink">Subscribe to the newsletter</span>
          </label>
        </>
      ) : (
        <>
          <input type="hidden" name="email" defaultValue={email} />
          <input type="hidden" name="firstName" defaultValue={firstName} />
          <input type="hidden" name="lastName" defaultValue={lastName} />
          <input type="hidden" name="password" defaultValue={password} />
          <input type="hidden" name="confirmPassword" defaultValue={confirmPassword} />
          <input type="hidden" name="newsletterOptIn" defaultValue={newsletterOptIn ? 'on' : ''} />
        </>
      )}

      {/*
       * Never remounted (no `key`) across the phase switch, and **the reason is no longer the
       * one that used to be written here.** It read: Cloudflare's implicit rendering scans the
       * DOM once at script load, so a fresh node inserted later is never picked up, and
       * remounting would leave "Resend" with no captcha token at all. That was true, and it
       * was also the bug — the same one-time scan broke this form outright on any client-side
       * arrival, which is why `TurnstileWidget` renders explicitly now and a remount here
       * would be perfectly safe.
       *
       * What survives is the argument that was always the real one: `submit` calls
       * `resetTurnstile()` only on the failure path, not on success, so the token stays spent
       * across the phase switch and "Resend" clicked straight after "Create account" is
       * correctly refused by `verifyTurnstile` (Turnstile tokens are single-use) — while a
       * plain retry after a *failed* "Create account" gets a fresh one instead of resending
       * the token Cloudflare has already consumed. A remount would hand "Resend" an unspent
       * token and quietly retire that.
       */}
      <TurnstileWidget />

      <button type="submit" className="btn btn-primary mt-1 w-full justify-center py-3" disabled={busy || !ready}>
        {phase === 'form' ? 'Create account' : 'Resend email'}
      </button>
    </form>
  )
}
