'use client'

import { useCallback, useEffect, useState } from 'react'

import { installOffer, installPlatform } from '@/lib/install/offer'
import type { InstallMode } from '@/lib/install/offer'
import { INSTALL_EVENT, INSTALL_PROMPT_KEY } from '@/lib/install/prompt'
import type { BeforeInstallPromptEvent } from '@/lib/install/prompt'

/**
 * What the menu should offer about installing, and the one action that needs the browser.
 *
 * Every fact is read after mount and never during render, the same discipline
 * `DeviceLaunchCheck` states at length: `navigator`, `window.matchMedia` and the stash all
 * exist only on the client, and a mode guessed for the first paint would be a row that
 * appears or disappears a frame later. `null` until then, which is also the answer for
 * every browser that can do nothing — see `installOffer`.
 *
 * Three things can change the answer while the page is open, so all three are listened for:
 * the prompt arriving (`INSTALL_EVENT`, since the document may have caught it before this
 * mounted), the install finishing (`appinstalled`, fired in the tab the reader installed
 * from — nothing else would tell that tab its row is now pointless), and the reader
 * answering the dialog, which is `install()`'s own business below.
 */
export function useInstallOffer(): { mode: InstallMode | null; install: () => Promise<void> } {
  const [mode, setMode] = useState<InstallMode | null>(null)

  const read = useCallback(() => {
    setMode(
      installOffer({
        platform: installPlatform({
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          maxTouchPoints: navigator.maxTouchPoints,
        }),
        hasPrompt: stashedPrompt() !== null,
        installed: isInstalled(),
      }),
    )
  }, [])

  useEffect(() => {
    read()

    const onInstalled = () => setMode(null)
    window.addEventListener(INSTALL_EVENT, read)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener(INSTALL_EVENT, read)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [read])

  const install = useCallback(async () => {
    const event = stashedPrompt()
    /* Unreachable while `mode` is `'prompt'`, and cheap insurance if it ever is not. */
    if (event === null) return

    /*
     * Spent the moment it is shown, whatever the reader answers: Chromium will not accept
     * the same event twice and will not fire a new one in this page load. Cleared *before*
     * the await so a second tap on a stale row cannot call `prompt()` again — which throws
     * rather than doing nothing.
     */
    delete (window as unknown as Record<string, unknown>)[INSTALL_PROMPT_KEY]

    try {
      await event.prompt()
      const { outcome } = await event.userChoice
      /*
       * On acceptance the row goes at once rather than waiting for `appinstalled`, which
       * follows a beat later and is one more thing that could not arrive. On a dismissal
       * the offer is recomputed with no prompt left in the stash, which is what turns the
       * row into instructions instead of leaving it there doing nothing.
       */
      if (outcome === 'accepted') setMode(null)
      else read()
    } catch {
      /* A refused or already-spent prompt is not worth a message: the row falls back to the
         same instructions a browser that never offered one would have shown. */
      read()
    }
  }, [read])

  return { mode, install }
}

function stashedPrompt(): BeforeInstallPromptEvent | null {
  const stashed = (window as unknown as Record<string, unknown>)[INSTALL_PROMPT_KEY]
  return stashed == null ? null : (stashed as BeforeInstallPromptEvent)
}

/**
 * Whether this page *is* the installed app.
 *
 * Both questions asked, because neither answers it everywhere: `display-mode: standalone`
 * is the standard one and what Android reports, while iOS answered it with the
 * non-standard `navigator.standalone` years before it supported the media query, and still
 * does. Either being true is enough.
 */
function isInstalled(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}
