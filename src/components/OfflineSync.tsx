'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { listOfflineRoutes } from '@/lib/offline/sync'
import { currentScope } from '@/lib/storage/scope'
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
export function OfflineSync() {
  const online = useOnline()
  /*
   * The root layout survives a sign-in and a sign-out — both are server-action redirects that
   * Next patches in place rather than reloading — so this component outlives the session it
   * started under. The pathname is what changes on either, and the scope cookie is what says
   * whose session it now is; together they are the trigger this used to lack.
   */
  const pathname = usePathname()
  const run = useRef<{ scope: string; done: Set<string>; state: 'running' | 'stopped' | 'complete'; cancel: () => void } | null>(null)

  useEffect(() => {
    const scope = currentScope()

    /*
     * **A different reader, or none, stops the walk that was running.** Until 2026-09-22 a
     * `started` flag latched on the first mount and was never reset: opened on /login, the
     * walk ran with no session, found nothing, and never ran again for the life of the page —
     * so a reader who signed in with a password went on stage with nothing warmed. After a
     * sign-out the old walk went on firing hundreds of requests that each redirected to /login.
     */
    if (run.current !== null && run.current.scope !== scope) {
      run.current.cancel()
      run.current = null
    }
    if (scope === null) return
    if (!online) {
      run.current?.cancel()
      return
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
      cancel: () => {
        if (current.state === 'running') current.state = 'stopped'
      },
    }
    run.current = current

    void (async () => {
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
          await fetch(route)
          done.add(route)
        } catch {
          // Offline mid-sync, or a transient failure: the next run picks up whatever is
          // still missing. Nothing here is worth interrupting the rest for.
        }
      }
      if (current.state === 'running') current.state = done.size >= routes.length ? 'complete' : 'stopped'
    })()
  }, [online, pathname])

  /* The walk belongs to the page, not to one render of it. */
  useEffect(() => () => run.current?.cancel(), [])

  return null
}
