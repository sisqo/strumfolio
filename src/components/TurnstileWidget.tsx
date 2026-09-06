'use client'

import Script from 'next/script'

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

declare global {
  interface Window {
    turnstile?: { reset: (widget?: string | HTMLElement) => void }
  }
}

/**
 * Cloudflare Turnstile, dropped into a form with no JavaScript of this app's own
 * (v3.2). The `cf-turnstile` div is Turnstile's own implicit
 * rendering: the script that owns that class finds it, draws the challenge, and —
 * via `data-response-field-name` — writes the solved token straight into a hidden
 * input named `captchaToken`, the same field name the registration and
 * password-recovery form actions read from `FormData` like every other field on
 * those forms (see `login/page.tsx` for the form-action style). No `onload`
 * callback, no ref, no state: the widget is the only client code this needs.
 *
 * Renders nothing when the site key is not set — the same permissive default as
 * `verifyTurnstile` (`lib/captcha.ts`) with no secret key, so local development is
 * never blocked on a Cloudflare account nobody has set up yet. The site key is
 * `NEXT_PUBLIC_` because it ships to the browser by design; the secret key never
 * does.
 *
 * Must be rendered inside the `<form>` it belongs to: the hidden input lands as a
 * sibling inside the `cf-turnstile` div itself, so `FormData` only picks it up if
 * that div is a descendant of the form being submitted.
 */
export function TurnstileWidget() {
  if (!SITE_KEY) return null

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
      <div className="cf-turnstile" data-sitekey={SITE_KEY} data-response-field-name="captchaToken" />
    </>
  )
}

/**
 * Turnstile tokens are single-use — call this after a failed submit, before the person
 * retries, or the retry silently resends the already-spent token and `verifyTurnstile`
 * gets Cloudflare's `timeout-or-duplicate` back, even though the widget still shows its
 * checkmark from the first solve. Never call this on a *successful* submit: `RegisterForm`
 * relies on the token staying spent across its phase switch (see the comment there).
 * Resets every widget on the page — safe here since no page renders more than one.
 */
export function resetTurnstile() {
  if (typeof window !== 'undefined') window.turnstile?.reset()
}
