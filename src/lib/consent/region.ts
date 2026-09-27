import type { Region } from './types'

/**
 * Where a consent is required before Google's tag may run: the EU27, the rest of the EEA
 * (Iceland, Liechtenstein, Norway), the United Kingdom and Switzerland. Everywhere else the tag
 * runs until the reader says no, and «Cookie settings» in the footer is how they say it.
 */
const CONSENT_COUNTRIES: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO',
  'GB', 'CH',
])

/**
 * Whether a visitor from this country has to be asked first.
 *
 * **An unknown country answers `true`.** A missing header — a local `npm run dev`, a preview, a
 * proxy that dropped it — must fail on the side where nothing reaches Google, because the other
 * side is tracking an Italian reader without consent.
 */
export function requiresConsent(country: string | null | undefined): boolean {
  if (!country) return true
  const code = country.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return true
  return CONSENT_COUNTRIES.has(code)
}

export function regionOf(country: string | null | undefined): Region {
  return requiresConsent(country) ? 'eea' : 'other'
}

/** A stored region, read defensively: anything but `other` is `eea`, for `requiresConsent`'s reason. */
export function parseRegion(raw: string | null | undefined): Region {
  return raw === 'other' ? 'other' : 'eea'
}
