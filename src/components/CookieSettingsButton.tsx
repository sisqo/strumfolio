'use client'

import { adsConfig } from '@/lib/consent/state'
import { CONSENT_OPEN_EVENT } from '@/lib/consent/types'

/**
 * Reopens the consent banner wherever the reader is — the footer's link, for everybody, readers
 * outside the EEA included (their way to say no); it is the only place this is rendered. Absent
 * when Ads is not configured, because there is then nothing to consent to.
 */
export function CookieSettingsButton({ className }: { className?: string }) {
  if (!adsConfig()) return null

  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}>
      Cookie settings
    </button>
  )
}
