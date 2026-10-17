'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { listOfflineRoutes } from '@/lib/offline/sync'
import { clearPageCaches, currentScope, settleScope } from '@/lib/storage/scope'
import { useOnline } from '@/lib/useOnline'

/**
 * Warms this device's offline cache with the reader's own repertoire, in the background.
 *
 * Fetches nothing itself in the sense of storing anything — a plain `fetch()` for each
 * route is already enough, because it passes through the active service worker exactly
 * like a real visit would, and `sw.ts`'s own runtime caching (`NetworkFirst`) stores the
 * response the same way it would if the reader had opened that page themselves. This is
 * only what makes that happen *before* a connection is needed, rather than only after.
 *
 * Sequential, not `Promise.all`: a repertoire can be a few hundred songs, and a burst of
 * that many parallel requests is a worse use of a phone's radio and a rehearsal room's
 * upload-starved wifi than the extra seconds sequential fetches cost.
 */
/** How long a finished walk stands before the page coming back into view walks it again. */
const REWALK_AFTER_MS = 6 * 60 * 60 * 1000

export function OfflineSync() {
  const online = useOnline()
  /*
   * The root layout survives a sign-in and a sign-out — both are server-action redirects that
   * Next patches in place rather than reloading — so this component outlives the session it
   * started under. The pathname is what changes on either, and the scope cookie is what says
   * whose session it now is; together they are the trigger this used to lack.
   */
  const pathname = usePathname()
  /*
   * Bumped to look again. A password sign-in is a server action whose redirect is rendered in
   * the same response, and Next drops the `Set-Cookie` of that inner render — so on the pathname
   * change that follows a sign-in the scope cookie does not exist yet; it arrives on the next
   * request a moment later. With nothing to re-run the effect, the walk waited for the reader's
   * next navigation, which on a phone locked straight after signing in is never. So a missing
   * scope is looked for again a few times, and whenever the page comes back into view.
   */
  const [look, setLook] = useState(0)
  const lookedOn = useRef({ path: '', count: 0 })
  const run = useRef<{
    scope: string
    done: Set<string>
    state: 'running' | 'stopped' | 'complete'
    inFlight: Promise<unknown> | null
    cancel: () => void
    /** When the walk last finished, for `REWALK_AFTER_MS`. */
    completedAt: number
  } | null>(null)
  /*
   * A new service worker took over: a deploy. The pages stored under the old one name the old
   * build's scripts, which the new worker's activation deleted from the precache and which no
   * other cache ever held — so offline they opened as bare HTML, with no transposing, no scroll,
   * no edits. Walking again stores the new build's pages, whose scripts are precached.
   */
  const workerChanged = useRef(false)

  useEffect(() => {
    const again = () => {
      if (document.visibilityState === 'visible') setLook((n) => n + 1)
    }
    document.addEventListener('visibilitychange', again)
    const container = 'serviceWorker' in navigator ? navigator.serviceWorker : null
    const takenOver = () => {
      workerChanged.current = true
      setLook((n) => n + 1)
    }
    container?.addEventListener('controllerchange', takenOver)
    return () => {
      document.removeEventListener('visibilitychange', again)
      container?.removeEventListener('controllerchange', takenOver)
    }
  }, [])

  useEffect(() => {
    const scope = currentScope()

    /*
     * **A different reader, or none, stops the walk that was running.** Until 2026-09-22 a
     * `started` flag latched on the first mount and was never reset: opened on /login, the
     * walk ran with no session, found nothing, and never ran again for the life of the page —
     * so a reader who signed in with a password went on stage with nothing warmed. After a
     * sign-out the old walk went on firing hundreds of requests that each redirected to /login.
     *
     * **And the one request still in flight is waited for, then the page caches emptied again.**
     * It left with the old session, so it comes back as that reader's page; if it lands after
     * `StorageCleanup` has cleared the caches on /login, the worker writes it back into
     * `repertoire` — which never expires, so it would stay on a shared device until another
     * account happened to sign in.
     */
    if (run.current !== null && run.current.scope !== scope) {
      const previous = run.current
      previous.cancel()
      run.current = null
      if (scope === null && previous.inFlight !== null) {
        void previous.inFlight.finally(() => {
          void clearPageCaches()
        })
      }
    }
    if (scope === null) {
      /* Look again shortly: see `look` above. Bounded per page, so a signed-out page does not
         poll — and counted from the last navigation, or ten seconds spent on /login before
         signing in would have spent the looks the sign-in needs. */
      if (lookedOn.current.path !== pathname) lookedOn.current = { path: pathname, count: 0 }
      lookedOn.current.count += 1
      if (lookedOn.current.count <= 5) {
        const timer = window.setTimeout(() => setLook((n) => n + 1), 2000)
        return () => window.clearTimeout(timer)
      }
      return
    }
    if (!online) {
      run.current?.cancel()
      return
    }

    /*
     * **No worker yet, no walk** (2026-10-16). A fetch made before a worker controls the page
     * bypasses it and stores nothing, yet each one used to count as done — so on a new device,
     * while the first install was still downloading, the whole walk could end «complete» with
     * nothing kept. The worker's `controllerchange` looks again. Production only: in development
     * there is no worker at all (`next.config.ts`).
     */
    if (
      process.env.NODE_ENV === 'production' &&
      'serviceWorker' in navigator &&
      navigator.serviceWorker.controller === null
    ) {
      return
    }

    /*
     * **A finished walk is walked again** after a deploy (`workerChanged`) and when the page comes
     * back after `REWALK_AFTER_MS`: an installed app stays alive for days, and songs added on
     * another device, or rewritten by an AI, never got an offline copy before.
     */
    if (
      run.current !== null &&
      run.current.state === 'complete' &&
      (workerChanged.current || Date.now() - run.current.completedAt > REWALK_AFTER_MS)
    ) {
      workerChanged.current = false
      run.current = null
    }

    /* Already walking, or already walked, for this reader: a navigation changes nothing. */
    if (run.current !== null && run.current.state !== 'stopped') return

    /* The same reader, back online after a blip: carry on from where the walk stopped, and
       skip what it already fetched rather than walking the repertoire again from the top. */
    const done = run.current?.done ?? new Set<string>()
    const current = {
      scope,
      done,
      state: 'running' as 'running' | 'stopped' | 'complete',
      inFlight: null as Promise<unknown> | null,
      cancel: () => {
        if (current.state === 'running') current.state = 'stopped'
      },
      completedAt: 0,
    }
    run.current = current

    void (async () => {
      /* Purge a previous account's caches *before* warming, never after — see `settleScope`. */
      await settleScope()

      let routes: string[] | null
      try {
        routes = await listOfflineRoutes()
      } catch {
        current.state = 'stopped'
        return
      }

      /* No session behind the cookie after all: stop, so the next navigation asks again. An
         empty repertoire is not this — it is simply a walk with nothing in it. */
      if (routes === null) {
        current.state = 'stopped'
        return
      }

      for (const route of routes) {
        if (current.state !== 'running') return
        if (done.has(route)) continue
        try {
          current.inFlight = fetch(route)
          await current.inFlight
          done.add(route)
        } catch {
          // Offline mid-sync, or a transient failure: the next run picks up whatever is
          // still missing. Nothing here is worth interrupting the rest for.
        } finally {
          current.inFlight = null
        }
      }
      if (current.state === 'running') {
        current.state = routes.every((route) => done.has(route)) ? 'complete' : 'stopped'
        if (current.state === 'complete') current.completedAt = Date.now()
      }
    })()
  }, [online, pathname, look])

  /* The walk belongs to the page, not to one render of it. */
  useEffect(() => () => run.current?.cancel(), [])

  return null
}
