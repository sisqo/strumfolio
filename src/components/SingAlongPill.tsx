'use client'

import { useSingAlong } from '@/components/SingAlongProvider'

/**
 * "Live · N", shown in `TopBar` on every screen while this reader has a Sing Together
 * broadcast running — not only on the reading page it started from, since a broadcast
 * keeps running while its leader checks a songbook or steps away to another song.
 *
 * `'use client'`, reading `useSingAlong()` the same way `ViewingAsPill` reads
 * `useRole()` — deliberately not something `TopBar` itself resolves server-side; see
 * that component's own comment on why.
 *
 * Renders nothing for a guest following someone else's broadcast, and nothing before
 * the first read comes back: `broadcast` is `null` or `undefined` in both cases, and
 * neither is "Live".
 */
export function SingAlongPill() {
  const { broadcast, audience } = useSingAlong()
  if (broadcast === null || broadcast === undefined) return null

  return (
    <span className="live-pill" title="Sing Together — live">
      <span className="live-dot" aria-hidden />
      Live
      {audience !== null && (
        <>
          <span className="live-pill-dot" aria-hidden>
            ·
          </span>
          <span className="live-pill-count">{audience.following}</span>
        </>
      )}
    </span>
  )
}
