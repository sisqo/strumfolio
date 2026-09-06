/**
 * The two names the inline capture script and `useInstallOffer` have to agree on, and the
 * script itself.
 *
 * It is inline and in the document for one reason: **`beforeinstallprompt` fires once, and
 * it can fire before React has hydrated.** Chromium dispatches it as soon as the manifest
 * has been parsed and the install criteria are met, which on a warm service-worker cache
 * happens well before the bundle runs — a listener added in an effect would simply never
 * hear it, and the menu row would be missing on exactly the fastest loads. So the event is
 * caught by the document and stashed, and React reads the stash on mount.
 *
 * `preventDefault()` is not optional: without it Chromium shows its own install infobar
 * over the page, which is a second, unstyled version of the row this feature adds.
 *
 * Twin of `themeScript` in `app/layout.tsx` — same rendering path, same reason (a thing
 * that has to happen before the bundle can), and the same discipline of importing the
 * strings it shares with the code that reads them rather than writing them twice.
 */
export const INSTALL_PROMPT_KEY = '__strumfolioInstallPrompt'

/** Fired at `window` when the stash is written, so a menu already mounted can react. */
export const INSTALL_EVENT = 'strumfolio:installable'

export const installCaptureScript = `try{window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window['${INSTALL_PROMPT_KEY}']=e;window.dispatchEvent(new Event('${INSTALL_EVENT}'))})}catch(e){}`

/**
 * The event Chromium hands over, which is in no TypeScript lib: it is a plain `Event` with
 * a `prompt()` that may only be called from a user gesture, and a `userChoice` that settles
 * once the reader has answered.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
