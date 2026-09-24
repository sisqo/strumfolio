'use client'

import { useActionState } from 'react'

import { MIN_PASSWORD } from '@/lib/auth/types'
import { VERIFY_MESSAGE, type VerifyState } from '@/lib/verify/types'

/**
 * `/verify`'s form: the password, chosen by whoever opened the link, and the newsletter switch.
 *
 * Both used to be answered on `/register`, before the inbox had been proved — which let a
 * stranger's registration decide how somebody else's account would be entered
 * (`NO_PENDING_PASSWORD`). The switch starts from what the registration asked for and the
 * person decides again here.
 *
 * A plain form action rather than an `onSubmit`, unlike `RegisterForm`: it has nothing to switch
 * between, so it can keep the native fallback, and `useActionState` threads the refusal back.
 * The address sits in a read-only `username` field so a password manager files the new
 * password under the right account.
 */
export function VerifyForm({
  email,
  action,
  newsletterOptIn,
}: {
  email: string
  action: (state: VerifyState, formData: FormData) => Promise<VerifyState>
  newsletterOptIn: boolean
}) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form className="grid gap-2.5" action={formAction}>
      {state !== null && (
        <p className="notice notice-error" role="alert">
          {VERIFY_MESSAGE[state.reason]}
        </p>
      )}

      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />

      <label className="block">
        <span className="sr-only">Password</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="new-password"
          placeholder={`Password — at least ${MIN_PASSWORD} characters`}
          minLength={MIN_PASSWORD}
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
          className="form-field"
        />
      </label>

      <label className="row cursor-pointer">
        <input
          type="checkbox"
          role="switch"
          name="newsletterOptIn"
          className="toggle-switch"
          defaultChecked={newsletterOptIn}
        />
        <span className="text-sm text-ink">Subscribe to the newsletter</span>
      </label>

      <button type="submit" className="btn btn-primary mt-1 w-full justify-center py-3" disabled={pending}>
        Create my account
      </button>
    </form>
  )
}
