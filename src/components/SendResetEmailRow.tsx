'use client'

import { useAdminAction } from '@/lib/accounts/useAdminAction'
import { sendPasswordResetFor } from '@/lib/auth/actions'
import { PASSWORD_MESSAGE } from '@/lib/auth/types'
import { useOnline } from '@/lib/useOnline'

/**
 * Sends a password-reset email instead of setting the password directly (`PasswordForm`
 * above it) — for when the admin would rather the account holder choose their own.
 *
 * A whole strip and not just a button (`Account Detail.dc.html`), which is why this is a
 * `*Row`: the sentence saying what the account receives is the part an operator needs
 * before pressing anything, and the four actions on the Security tab are drawn as four of
 * these so the one that destroys an account cannot be mistaken for the three that do not.
 */
export function SendResetEmailRow({ ownerEmail }: { ownerEmail: string }) {
  const online = useOnline()
  const { busy, error, done, run } = useAdminAction(() => sendPasswordResetFor(ownerEmail), PASSWORD_MESSAGE)

  return (
    <div className="acct-row">
      <div className="acct-row-text">
        <span className="acct-row-title">Send a reset email</span>
        <span className="acct-row-note">Emails a one-time link so the account can choose its own password.</span>
        {error && (
          <p className="notice notice-error mt-2 text-sm" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="notice notice-accent mt-2 text-sm" role="status">
            Reset email sent.
          </p>
        )}
      </div>
      <button type="button" className="acct-pill" disabled={!online || busy} onClick={() => void run()}>
        Send reset email
      </button>
    </div>
  )
}
