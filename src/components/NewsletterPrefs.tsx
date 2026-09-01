'use client'

import { useCallback, useEffect, useState } from 'react'

import { loadNewsletterPrefs, updateNewsletterPrefs } from '@/lib/newsletter/actions'
import { NEWSLETTER_MESSAGE } from '@/lib/newsletter/types'
import type { NewsletterFrequency, NewsletterPrefs as Prefs } from '@/lib/newsletter/types'
import { useOnline } from '@/lib/useOnline'

const FREQUENCIES: NewsletterFrequency[] = ['weekly', 'monthly']
const FREQUENCY_LABEL: Record<NewsletterFrequency, string> = { weekly: 'Weekly', monthly: 'Monthly' }

/**
 * Subscribe/unsubscribe and cadence, in the Settings view next to theme and notation
 * (`PLAN-newsletter.md`, decided in interview) — a preference "answered once for the
 * whole account", the same group ThemePicker/NotationPicker already belong to.
 *
 * Loaded on mount rather than baked into `RoleProvider`: unlike email/plan, this is
 * not read anywhere else in the app, so it does not belong on every page's context —
 * same reasoning `ProfileScreen`/`loadOwnName` already follow for the name.
 *
 * A real Toggle (`.toggle-switch`, `AppSettingsForm`'s own note on why), not a bare
 * checkbox: this is saved per account and has a consequence beyond the screen.
 */
export function NewsletterPrefs() {
  const online = useOnline()

  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [asked, setAsked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setPrefs(await loadNewsletterPrefs())
    } catch {
      setPrefs(null)
    } finally {
      setAsked(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const save = async (subscribed: boolean, frequency: NewsletterFrequency) => {
    setBusy(true)
    setError(null)
    // Optimistic: a settings toggle that waits on the network before moving feels
    // broken, and `refresh()` below corrects it if the write actually failed.
    setPrefs({ subscribed, frequency })
    try {
      const result = await updateNewsletterPrefs(subscribed, frequency)
      if (!result.ok) {
        setError(NEWSLETTER_MESSAGE[result.reason])
        await refresh()
      }
    } catch {
      setError(NEWSLETTER_MESSAGE.failed)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  // Not shown at all until the first read resolves, and silently absent on failure
  // (offline, no session) rather than an error banner in a menu this small — the
  // reader can always try again next time the menu opens.
  if (!asked || prefs === null) return null

  return (
    <div className="px-1.5 pb-1 pt-2">
      <p className="group-label mb-2">Newsletter</p>

      {error !== null && (
        <p className="notice notice-error mb-2" role="alert">
          {error}
        </p>
      )}

      <label className="row cursor-pointer items-center">
        <input
          type="checkbox"
          role="switch"
          className="toggle-switch"
          checked={prefs.subscribed}
          disabled={!online || busy}
          onChange={() => void save(!prefs.subscribed, prefs.frequency)}
        />
        <span className="text-[0.9375rem] text-ink">Subscribe to the newsletter</span>
      </label>

      {prefs.subscribed && (
        <span className="segment mt-2 w-full" role="group" aria-label="Newsletter frequency">
          {FREQUENCIES.map((entry) => (
            <button
              key={entry}
              type="button"
              className={entry === prefs.frequency ? 'segment-button is-on flex-1' : 'segment-button flex-1'}
              aria-pressed={entry === prefs.frequency}
              disabled={!online || busy}
              onClick={() => void save(true, entry)}
            >
              {FREQUENCY_LABEL[entry]}
            </button>
          ))}
        </span>
      )}
    </div>
  )
}
