'use client'

import Script from 'next/script'
import { useCallback, useEffect, useRef, useState } from 'react'

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

/**
 * `render=explicit` turns off Cloudflare's implicit rendering, which is the whole point of
 * this file's rewrite — see the component below. Without the parameter the script would also
 * scan for `.cf-turnstile` nodes at load, and this widget would be drawn twice on a fresh page
 * load and once on every other, which is a worse bug than the one being fixed.
 */
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string | undefined
  remove: (widgetId: string) => void
  reset: (widgetId?: string | HTMLElement) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

/**
 * The widget currently drawn on this page, or `null`.
 *
 * Module-level rather than a ref, because `resetTurnstile` below is called from three form
 * components that hold no reference to this one and must not have to — it is the failure path
 * of a submit handler, not a parent/child relationship. Safe as a singleton for the same
 * reason the old comment gave: no page in this app renders more than one widget.
 */
let widgetId: string | null = null

function removeWidget() {
  if (widgetId === null) return

  try {
    window.turnstile?.remove(widgetId)
  } catch {
    /* Same reasoning as `resetTurnstile`: a widget that cannot be removed — because the script
       never loaded, or because Cloudflare has already dropped it — leaves nothing to clean up
       and nothing worth throwing over. */
  }

  widgetId = null
}

/**
 * Cloudflare Turnstile, rendered explicitly, once per mount (v3.2 for the widget itself, this
 * shape since 2026-09-11).
 *
 * **It used to use Cloudflare's implicit rendering — a `.cf-turnstile` div the script finds by
 * itself — and that is a real bug, reproduced, not a style preference.** The script scans the
 * DOM exactly once, at load. `next/script` will not re-execute a script it has already loaded,
 * and every page carrying this widget is reachable by client-side navigation from a page that
 * carries one too (`/register` ⇄ `/login` ⇄ `/forgot-password`, and `/verify`'s resend button).
 * So the *second* time a browser arrives at one of these forms without a full page load, the
 * freshly mounted div is never scanned: no widget is drawn, and — the half that breaks the
 * form — the hidden `captchaToken` input is never created either. `register` then receives no
 * token, `verifyTurnstile` refuses it, and the reader cannot get past a check they were never
 * shown. Measured on 2026-09-11 with a real browser: after `/register` → `/login` → `/register`
 * the container held zero children and `input[name="captchaToken"]` did not exist, while
 * `window.turnstile` was present and the script tag was still in the DOM.
 *
 * Explicit rendering fixes it at the source: this component draws its own widget on mount and
 * removes it on unmount, so its lifetime is the component's rather than the page load's.
 *
 * **Two doors, and handling one of them reproduces the bug in the other direction.** On a fresh
 * load the script is not there yet when the effect runs, so `Script`'s `onLoad` is what draws
 * the widget. On a client-side arrival the script is already loaded and `onLoad` cannot be
 * relied on to fire again, so the mount-time call is what draws it. Both call `render`, which
 * is idempotent — it refuses to draw into a container that already holds a widget.
 *
 * `response-field-name` keeps the contract every caller actually depends on: Turnstile writes
 * the solved token into a hidden input of that name inside this container, and the three form
 * actions read `captchaToken` off `FormData` like any other field. **Must therefore still be
 * rendered inside the `<form>` it belongs to** — `FormData` only sees an input that is a
 * descendant of the form being submitted.
 *
 * Renders nothing when the site key is not set — the same permissive default as
 * `verifyTurnstile` (`lib/captcha.ts`) with no secret key, so local development is never
 * blocked on a Cloudflare account nobody has set up yet. The site key is `NEXT_PUBLIC_` because
 * it ships to the browser by design; the secret key never does.
 */
export function TurnstileWidget() {
  const container = useRef<HTMLDivElement | null>(null)
  const [failed, setFailed] = useState(false)

  const render = useCallback(() => {
    const api = window.turnstile
    const node = container.current
    /* Already drawn — the two doors above both fired, which is expected rather than
       exceptional, and drawing a second widget into the same container would give the form two
       hidden inputs of the same name. */
    if (api === undefined || node === null || node.childElementCount > 0) return

    setFailed(false)
    widgetId =
      api.render(node, {
        sitekey: SITE_KEY,
        'response-field-name': 'captchaToken',
        /* Cloudflare retries by itself before it calls this, so reaching it means something
           that will not fix itself: the script blocked by an extension, a hostname missing
           from the widget's allowlist, no network. Saying so is the point — see the notice. */
        'error-callback': () => setFailed(true),
        'callback': () => setFailed(false),
      }) ?? null
  }, [])

  useEffect(() => {
    render()
    return removeWidget
  }, [render])

  /**
   * The reader's way out, for the one failure this component can see.
   *
   * Re-rendering is the right move when the script is present and the challenge itself failed.
   * When the script never arrived at all there is nothing to re-render and no way to ask
   * `next/script` for it again, so the honest fallback is a reload — which costs whatever was
   * typed into the form, and is therefore the branch that must not be taken when the cheaper
   * one is available.
   */
  const retry = useCallback(() => {
    setFailed(false)

    if (window.turnstile === undefined) {
      window.location.reload()
      return
    }

    removeWidget()
    render()
  }, [render])

  if (!SITE_KEY) return null

  return (
    <>
      <Script src={SCRIPT_SRC} strategy="afterInteractive" onLoad={render} onError={() => setFailed(true)} />
      <div ref={container} />

      {/*
        * Without this the broken case is invisible: the form looks complete, the button looks
        * enabled, and the only evidence that the security check never loaded arrives after a
        * submit that cannot succeed. That silence is what made the original bug a support
        * question rather than something a reader could act on.
        */}
      {failed && (
        <p className="notice notice-error" role="alert">
          <span>
            The security check could not load, so this form cannot be sent.{' '}
            <button type="button" onClick={retry} className="underline">
              Try again
            </button>
            .
          </span>
        </p>
      )}
    </>
  )
}

/**
 * Clear the solved token so the next submit gets a fresh one.
 *
 * Turnstile tokens are single-use: call this after a *failed* submit, before the person
 * retries, or the retry silently resends the already-spent token and `verifyTurnstile` gets
 * Cloudflare's `timeout-or-duplicate` back, even though the widget still shows its checkmark
 * from the first solve. Never call it on a *successful* submit: `RegisterForm` relies on the
 * token staying spent across its phase switch (see the comment there).
 *
 * **It cannot throw, and that guard is load-bearing rather than defensive.** `window.turnstile.reset()`
 * throws outright when there is no widget to reset — «Nothing to reset found for provided
 * container», observed 2026-09-11 — which is exactly the state the implicit-rendering bug above
 * left every one of these forms in. All three callers ran this on the failure path *immediately
 * before* `setError`, so the throw killed the error message the reader was about to be shown,
 * and the `catch` that should have rescued it called this again and threw again. The result was
 * a form that answered a press with nothing at all: no message, no navigation, no sign that the
 * server had refused. A reset that cannot happen is not a failure worth propagating — there is
 * no spent token to clear.
 */
export function resetTurnstile() {
  if (typeof window === 'undefined' || widgetId === null) return

  try {
    window.turnstile?.reset(widgetId)
  } catch {
    /* See above: nothing to reset is not an error, and throwing here costs the reader the
       message their caller was about to render. */
  }
}
