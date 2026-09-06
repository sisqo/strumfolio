'use client'

import { IconIosShare } from '@/components/icons'
import type { InstallMode } from '@/lib/install/offer'

/**
 * How to put this app on the home screen when the browser will not do it for us — the
 * second screen behind the menu's "Add to home screen" row.
 *
 * Only ever rendered for the three modes that need words. `'prompt'` never reaches here:
 * where Chromium offers a real install dialog the row calls it straight from the tap, and
 * a screen explaining what is about to happen would be a step in front of a step.
 *
 * The one thing the copy deliberately does not promise is that the reader arrives signed
 * in. On Android the installed app shares the browser's cookies and they do; on iOS a
 * home-screen web app gets its own storage container, so they may not — and neither the
 * session nor the offline copy can be spoken for from here. What is true of both is what
 * is claimed: an icon, and the song with nothing around it.
 */
export function InstallPanel({ mode }: { mode: Exclude<InstallMode, 'prompt'> }) {
  return (
    <div className="px-1.5 pb-1 pt-1">
      <p className="mb-3 text-sm text-muted">
        Strumfolio gets its own icon on the home screen and opens full screen — no address
        bar, no browser buttons around the song.
      </p>

      <div className="sing-steps">
        {mode === 'ios-safari' && (
          <>
            <Step n={1}>
              Tap <b>Share</b> <IconIosShare size={15} className="inline align-[-0.15em]" /> — the
              middle of the bar at the bottom of Safari, or the top right on an iPad.
            </Step>
            <Step n={2}>
              Scroll the list down and tap <b>Add to Home Screen</b>.
            </Step>
            <Step n={3}>
              Tap <b>Add</b>. You may have to sign in once the first time you open it from
              there.
            </Step>
          </>
        )}

        {mode === 'ios-other' && (
          <>
            {/*
              * The first step is the whole point of telling this mode apart: iOS has no
              * install API for any browser to use, and adding to the Home Screen is a
              * feature each one implements itself or does not — Safari is the only one it
              * can be promised of. Hedged rather than declared exclusive, because Chrome
              * on iOS does offer it and saying otherwise would send that reader away for
              * nothing.
              */}
            <Step n={1}>
              Open <b>strumfolio.com</b> in <b>Safari</b>. Other browsers on iOS may not offer
              this at all.
            </Step>
            <Step n={2}>
              Tap <b>Share</b> <IconIosShare size={15} className="inline align-[-0.15em]" />, then{' '}
              <b>Add to Home Screen</b>. You may have to sign in once the first time you open it
              from there.
            </Step>
          </>
        )}

        {mode === 'android-manual' && (
          <>
            {/*
              * Reached by a browser that fires no install event (Firefox) and by Chromium
              * once its own dialog has been dismissed — see `installOffer`. Both labels are
              * named because both are in the wild for the same menu entry, and a reader
              * hunting for the wrong one concludes their phone cannot do it.
              */}
            <Step n={1}>
              Open your browser&apos;s own menu — the <b>⋮</b> at the edge of the address bar.
            </Step>
            <Step n={2}>
              Tap <b>Install app</b>, or <b>Add to Home screen</b> in the browsers that call it
              that.
            </Step>
          </>
        )}
      </div>
    </div>
  )
}

/** One numbered step, same badge-beside-the-text arrangement as Strum Together's. */
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="sing-step">
      <span className="sing-step-num" aria-hidden>
        {n}
      </span>
      <div className="sing-step-body">
        <p className="text-sm text-muted">{children}</p>
      </div>
    </div>
  )
}
