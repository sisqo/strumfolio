'use client'

import { useRouter } from 'next/navigation'
import { type ReactNode, useState } from 'react'

import { useRole } from '@/components/RoleProvider'
import { switchAccount } from '@/lib/accounts/actions'
import { useOnline } from '@/lib/useOnline'

/**
 * Switches which account is on screen, in either direction — entering another account
 * (`EnterAccountForm`'s replacement on `/accounts/[email]`) and exiting back to one's own
 * (`ViewingAsPill`) are the same three steps with a different `targetEmail`: write the
 * cookie, refresh `RoleProvider`'s identity, then go home.
 *
 * Deliberately not a `<form action={switchAccount.bind(null, targetEmail)}>` the way this
 * used to be written, even though `switchAccount` itself still runs on the server: a form
 * action's own redirect (which is where this used to send `/` from) leaves no point for
 * this component to run anything once it settles, refreshing identity included — the same
 * reason `switchAccount`'s own comment gives for not calling `redirect()` itself any more.
 * Calling it as a plain awaited function and doing the navigation here instead is what
 * makes `refresh()` (below) reachable at all.
 *
 * `router.refresh()` **before** `router.push('/')`, not after and not either alone:
 * `refresh()` is what invalidates the Router Cache so the navigation that follows
 * actually re-fetches rather than serving whatever `/` last rendered — doing it first is
 * what makes the already-on-`/` case work (where `push` alone is a no-op, same URL) for
 * the right reason instead of by luck of `/` not having been cached yet.
 */
export function SwitchAccountButton({
  targetEmail,
  className,
  title,
  ariaLabel,
  confirmMessage,
  children,
}: {
  targetEmail: string
  className?: string
  title?: string
  ariaLabel?: string
  /** Asked via `window.confirm()` before switching, when set. Omit for no confirmation. */
  confirmMessage?: string
  children: ReactNode
}) {
  const router = useRouter()
  const online = useOnline()
  const { refresh } = useRole()
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (confirmMessage !== undefined && !window.confirm(confirmMessage)) return

    setBusy(true)
    try {
      await switchAccount(targetEmail)
      await refresh()
      router.refresh()
      router.push('/')
      // No `finally` resetting `busy`: every success path above ends in a navigation
      // away from whatever this button sits on, so there is nothing left to restore —
      // only a failed request needs the button clickable again.
    } catch {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={className}
      disabled={!online || busy}
      title={title}
      aria-label={ariaLabel}
      onClick={() => void run()}
    >
      {children}
    </button>
  )
}
