'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { setLifetimeOnSale } from '@/lib/settings/actions'
import { useOnline } from '@/lib/useOnline'

const FAILURE_MESSAGE: Record<string, string> = {
  'no-session': 'Your session expired — sign in again.',
  'not-owner': 'Only a global owner can change this.',
  'no-database': 'No database is configured for this deployment.',
  failed: 'Could not save. If migration 0037 has not been applied yet, this is why.',
}

/**
 * The one switch on `/app-settings` that decides what a visitor can buy.
 *
 * Its own component rather than a sixth entry in `AppSettingsForm`, and not because the markup
 * differs — it barely does. `AppSettingsForm` is a set of switches over one enum, keyed by
 * `NotifyEvent`, and it is that shape all the way down: `busy` is a `NotifyEvent | null`,
 * `settings` a `Record<NotifyEvent, boolean>`. Threading a single unrelated boolean through
 * that would have meant widening every one of those types to carry a member that is not a
 * notification at all, in a file whose whole subject is which messages get sent.
 *
 * Same optimistic behaviour, for `AppSettingsForm`'s own reason: a switch that waits for a
 * round trip before it moves reads as a switch that did not register the tap. Rolled back if
 * the write is refused, and `router.refresh()` on success is what brings the server-rendered
 * "last changed" line underneath into line with what was just written — and, more visibly than
 * on the notification switches, what makes `/pricing` agree on the next load.
 */
export function LifetimeOnSaleForm({ initial }: { initial: boolean }) {
  const router = useRouter()
  const online = useOnline()
  const [onSale, setOnSale] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = async () => {
    const next = !onSale
    setOnSale(next)
    setBusy(true)
    setError(null)

    try {
      const result = await setLifetimeOnSale(next)
      if (result.ok) {
        router.refresh()
      } else {
        // Put it back: the switch must never sit in a position the server did not accept.
        setOnSale(!next)
        setError(FAILURE_MESSAGE[result.reason] ?? 'Could not save.')
      }
    } catch {
      setOnSale(!next)
      setError('Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {error !== null && (
        <p className="notice notice-error mb-3" role="alert">
          {error}
        </p>
      )}

      <label className="row cursor-pointer items-center">
        <input
          type="checkbox"
          role="switch"
          className="toggle-switch"
          checked={onSale}
          disabled={!online || busy}
          onChange={() => void toggle()}
        />
        <span className="min-w-0">
          <span className="block text-[0.9375rem] text-ink">Lifetime in the catalogue</span>
          <span className="mt-0.5 block text-[0.8125rem] leading-[1.45] text-muted">
            {/* Says what switching it off does *not* do, because that is the half somebody
                would otherwise have to guess at before daring to touch it. Withdrawing a plan
                from sale and taking it away from the people who bought it are two very
                different acts, and only one of them is behind this switch. */}
            Whether the Lifetime block and its buy button appear on the pricing page. Switching it off withdraws it
            from sale and changes nothing for anybody who already owns it.
          </span>
        </span>
      </label>
    </div>
  )
}
