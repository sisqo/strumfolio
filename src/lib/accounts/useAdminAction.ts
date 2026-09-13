'use client'

import { useState } from 'react'

/** The one shape every admin action on `/accounts/[email]` already returns. */
type ActionResult<Reason extends string> = { ok: true } | { ok: false; reason: Reason }

/**
 * The busy/error/done state machine every admin action row on the account detail page
 * hand-rolled on its own — `ClearRateLimitRow`, `DeleteAccountRow`,
 * `SendResetEmailRow` and `SuspendAccountRow` each wrote the same three `useState` calls and
 * the same try/catch/finally around a server action, one message table apart. Extracted here
 * rather than left to keep growing with the next admin row.
 *
 * `run` forwards whatever arguments the action itself takes — `deleteAccount` needs the
 * retyped email, `setAccountSuspended` needs the next boolean, most of the others need
 * nothing beyond what the row already closed over. `onSuccess` is for whatever a particular
 * row still has to do beyond showing "done": `router.refresh()` so the summary strip agrees
 * with what was just written, or `router.push` for the one row that navigates away instead.
 *
 * `done` is returned unconditionally; a row with nothing to say on success (a redirect, or a
 * follow-up `router.refresh()` that changes the row's own props instead) simply never reads
 * it, the same way `SuspendAccountRow` and `DeleteAccountRow` never rendered one before this.
 */
export function useAdminAction<Reason extends string, Args extends unknown[]>(
  action: (...args: Args) => Promise<ActionResult<Reason>>,
  messages: Record<Reason, string> & { failed: string },
  onSuccess?: () => void,
) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const run = async (...args: Args) => {
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const result = await action(...args)
      if (result.ok) {
        setDone(true)
        onSuccess?.()
      } else {
        setError(messages[result.reason])
      }
    } catch {
      setError(messages.failed)
    } finally {
      setBusy(false)
    }
  }

  /** For a row with a reveal step of its own (`DeleteAccountRow`'s confirm) to dismiss. */
  const clearError = () => setError(null)

  return { busy, error, done, run, clearError }
}
