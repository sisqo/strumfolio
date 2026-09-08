/**
 * Whether this page *is* the installed app, asked of the browser.
 *
 * Both questions asked, because neither answers it everywhere: `display-mode: standalone` is
 * the standard one and what Android reports, while iOS answered it with the non-standard
 * `navigator.standalone` years before it supported the media query, and still does. Either
 * being true is enough.
 *
 * A module of its own rather than a private function inside `useInstallOffer.ts`, where it
 * lived alone until the landing page needed the same answer. Two readers now, for two
 * unrelated reasons, and the failure of keeping a second copy is not a wrong pixel but a wrong
 * *branch*: one of them would go on trusting the media query alone and be wrong on precisely
 * the platform where the app is most often opened from a Home Screen icon.
 *
 * - `useInstallOffer` — an install row inside the installed app has nothing to offer, so the
 *   whole offer is `null` there (see `installOffer`).
 * - `StandaloneRedirect` on `/` — the landing page is for visitors, and somebody who opened
 *   the app from its own icon is not one. See that component for the case it exists for.
 *
 * **Reads `window` and `navigator`, so it may only be called after mount** — never during
 * render and never on the server, the discipline `DeviceLaunchCheck` states at length. There
 * is deliberately no server-side guess to pair with it: nothing in a request says whether the
 * browser is running the page as an installed app.
 */
export function isInstalled(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}
