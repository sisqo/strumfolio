'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { setNotifySetting } from '@/lib/settings/actions'
import { NOTIFY_EVENTS, NOTIFY_LABEL, NOTIFY_NOTE } from '@/lib/settings/types'
import type { NotifyEvent, NotifySettings } from '@/lib/settings/types'
import { useOnline } from '@/lib/useOnline'

const FAILURE_MESSAGE: Record<string, string> = {
  'no-session': 'Your session expired — sign in again.',
  'not-owner': 'Only a global owner can change this.',
  'no-database': 'No database is configured for this deployment.',
  'invalid-event': 'That setting does not exist.',
  failed: 'Could not save. If migration 0028 has not been applied yet, this is why.',
}

/**
 * The notification switches, one per `NOTIFY_EVENTS`.
 *
 * Only `@/lib/settings/types` is value-imported here, never `read.ts` or `actions.ts`'s
 * neighbours that touch the database — that module is kept free of any `@/lib/db` import for
 * exactly this reason, which `PricingPlans.tsx`'s own header spells out: a client component
 * that value-imports a database-touching module ships the whole of it to the browser.
 *
 * Optimistic, and it has to be: a checkbox that waits for a round trip before it moves reads
 * as a checkbox that did not register the tap. The state is rolled back if the write is
 * refused, and `router.refresh()` on success is what brings the server-rendered "last changed
 * by" line underneath into line with what was just written.
 */
export function AppSettingsForm({ initial, available }: { initial: NotifySettings; available: boolean }) {
  const router = useRouter()
  const online = useOnline()
  const [settings, setSettings] = useState(initial)
  const [busy, setBusy] = useState<NotifyEvent | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggle = async (event: NotifyEvent) => {
    const next = !settings[event]
    setSettings((current) => ({ ...current, [event]: next }))
    setBusy(event)
    setError(null)

    try {
      const result = await setNotifySetting(event, next)
      if (result.ok) {
        router.refresh()
      } else {
        // Put it back: the switch must never sit in a position the server did not accept.
        setSettings((current) => ({ ...current, [event]: !next }))
        setError(FAILURE_MESSAGE[result.reason] ?? 'Could not save.')
      }
    } catch {
      setSettings((current) => ({ ...current, [event]: !next }))
      setError('Could not save.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      {!available && (
        <p className="notice notice-error mb-3" role="status">
          These switches are showing their defaults, not stored values — <strong>migration 0028 has not been
          applied</strong> to this database yet, so nothing saved here would stick. Every notification is on until
          it is.
        </p>
      )}

      {error !== null && (
        <p className="notice notice-error mb-3" role="alert">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-1">
        {NOTIFY_EVENTS.map((event) => (
          <li key={event}>
            {/* `.row` carries the flex, gap, padding and radius. A real Toggle (DESIGN.md
                §5), not the bare checkbox a page-local filter like the one on `/accounts`
                stays with: this one is saved per account and decides whether a Telegram
                message actually reaches somebody, which is exactly the kind of
                consequence-beyond-the-screen the Toggle is for. Centered rather than
                `items-start`, now that the control has real height of its own to center
                against the two-line label instead of hugging its first line. */}
            <label className="row cursor-pointer items-center">
              <input
                type="checkbox"
                role="switch"
                className="toggle-switch"
                checked={settings[event]}
                disabled={!online || busy !== null}
                onChange={() => void toggle(event)}
              />
              <span className="min-w-0">
                <span className="block text-[0.9375rem] text-ink">{NOTIFY_LABEL[event]}</span>
                <span className="mt-0.5 block text-[0.8125rem] leading-[1.45] text-muted">{NOTIFY_NOTE[event]}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
