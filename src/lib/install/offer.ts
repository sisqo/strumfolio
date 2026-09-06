/**
 * Whether the hamburger menu offers to put this app on the home screen, and how.
 *
 * A pure module for the reason `testCard.ts` is one: every branch here is a claim about
 * a browser that cannot be checked from this machine — no iPhone, no Android, and a
 * `beforeinstallprompt` that will not fire against `next dev` — so the truth table is
 * the only place the behaviour can actually be verified. `useInstallOffer` does nothing
 * but read three facts off `navigator` and hand them here.
 *
 * The shape of the problem is that there is no one way to install a web app:
 *
 * - Chromium on Android (and on the desktop) fires `beforeinstallprompt`, which is a real
 *   one-tap install and the only mode that needs no words at all.
 * - **iOS has no API whatsoever**, in Safari or anywhere else, so the only honest thing to
 *   offer is the Share → Add to Home Screen route, spelled out.
 * - Firefox on Android installs from its own menu and fires no event either, so it lands
 *   in the same "say where the button is" bucket as iOS rather than being told nothing.
 *
 * Anything else — a desktop browser with no prompt to offer, an iOS in-app web view that
 * cannot add anything anywhere — gets **no row**. That is Admin's precedent inside the
 * same panel: an entry that is either there or absent beats one that is there and then
 * explains it can do nothing for you.
 */

/** What the row does when it is tapped. `null` is the fourth answer: no row. */
export type InstallMode = 'prompt' | 'ios-safari' | 'ios-other' | 'android-manual'

export type InstallPlatform = 'ios-safari' | 'ios-other' | 'android' | 'other'

/**
 * The three things read off `navigator`, together because `userAgent` alone cannot answer
 * it: an iPad on iPadOS 13+ reports itself as a Mac by default, and the only thing that
 * tells it apart from a real one is that it has a touch screen.
 */
export interface BrowserFacts {
  userAgent: string
  /** `navigator.platform` — deprecated, still the only signal for the iPad-as-Mac case. */
  platform: string
  maxTouchPoints: number
}

/** Browsers on iOS that are not Safari, each of which brands its own engine in the UA. */
const IOS_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|OPR\//

export function installPlatform({ userAgent, platform, maxTouchPoints }: BrowserFacts): InstallPlatform {
  const iPadAsMac = platform === 'MacIntel' && maxTouchPoints > 1
  if (/iPhone|iPad|iPod/.test(userAgent) || iPadAsMac) {
    if (IOS_BROWSERS.test(userAgent)) return 'ios-other'
    /*
     * An in-app web view — the browser inside a messaging or social app, which is where a
     * shared link is most often opened — is Safari's engine without Safari's share sheet,
     * so nothing can be added to the home screen from inside it. It is told apart by the
     * `Version/` token that real Safari always carries and a `WKWebView` never does, and
     * it gets the same "open it in Safari" instructions as a third-party browser, which is
     * the one thing that is true of both.
     */
    return /Version\//.test(userAgent) ? 'ios-safari' : 'ios-other'
  }

  if (/Android/.test(userAgent)) return 'android'

  return 'other'
}

export function installOffer({
  platform,
  hasPrompt,
  installed,
}: {
  platform: InstallPlatform
  /** Whether a `beforeinstallprompt` event is stashed and still unused. */
  hasPrompt: boolean
  installed: boolean
}): InstallMode | null {
  /*
   * First, and before the prompt: an install button inside the installed app is at best
   * dead weight and at worst reads as "this did not work". Chromium keeps firing
   * `beforeinstallprompt` in the *browser tab* of an app that is already installed
   * elsewhere on the device, so this test has to come first or that tab would keep
   * offering it.
   */
  if (installed) return null

  if (hasPrompt) return 'prompt'

  switch (platform) {
    case 'ios-safari':
      return 'ios-safari'
    case 'ios-other':
      return 'ios-other'
    /*
     * Reached in two ways, and the second is the one worth naming: a browser that never
     * fires the event (Firefox), and Chromium *after* the reader dismissed its dialog —
     * the event is single-use and does not fire again in the same page load, so without
     * this fallback the row the reader just tapped would either vanish or do nothing.
     */
    case 'android':
      return 'android-manual'
    case 'other':
      return null
  }
}
