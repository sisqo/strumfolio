'use client'

import { useEffect } from 'react'

import { isInstalled } from '@/lib/install/installed'

/**
 * Sends the installed app to `/login` when it opens the landing page.
 *
 * The case it exists for: `manifest.ts` has `start_url: '/'`, so tapping the Home Screen icon
 * opens `/`. With a valid session that is the reader's own repertoire, which is right. With a
 * session that has lapsed — a ninety-day JWT, so it does lapse — `(home)/layout.tsx` renders
 * the marketing page instead, and a musician who installed this app months ago would open
 * their icon onto a page arguing that they should try it. Whoever taps that icon is a user,
 * not a visitor, and the sign-in card is the only useful thing to hand them.
 *
 * **Client-side, because there is no server-side answer.** Nothing in a request says whether
 * the browser is running the page as an installed app — `Sec-Fetch-*` does not, and no header
 * carries the display mode. The alternative that *would* be server-side is a `start_url` of
 * `/?app=1` with a branch in the middleware, and it is deliberately not taken. Its sharpest
 * objection has since gone: that parameter used to land on the one URL the service worker
 * precached, so it also needed a line in `ignoreURLParametersMatching`, and getting that
 * wrong meant the installed app missed its precache and opened to nothing offline. `/` is not
 * precached since 2026-09-09 — it has its own rule in `sw.ts` whose `cacheKeyWillBeUsed`
 * normalises *any* query on `/` to the one entry, so a new parameter would cost nothing
 * there. What is left still decides it: a branch in the middleware for a cosmetic redirect,
 * against one `useEffect` whose worst failure is a flash of the wrong page. It also covers
 * something the manifest could not: iOS freezes the manifest at install time, so every iPhone
 * already carrying this icon would keep `start_url: '/'` whatever a new deploy says.
 *
 * `location.replace` rather than `push`: this navigation is a correction, and leaving it in
 * the history would make Back bounce between the two pages.
 *
 * Renders nothing, and runs nothing during render — `isInstalled` reads `window` and
 * `navigator`. On the overwhelming majority of visits it is one media-query check and done.
 */
export function StandaloneRedirect() {
  useEffect(() => {
    if (isInstalled()) window.location.replace('/login')
  }, [])

  return null
}
