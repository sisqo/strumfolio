'use client'

import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react'

import {
  type BroadcastState,
  broadcastAudience,
  getMyBroadcast,
  startBroadcast,
  stopBroadcast,
} from '@/lib/singAlong/session'

type StartResult = Awaited<ReturnType<typeof startBroadcast>>
type StopResult = Awaited<ReturnType<typeof stopBroadcast>>

interface SingAlongContextValue {
  /** `undefined` until the first read comes back, `null` once it has and nothing is
   *  running, and the row itself once there is — see this provider's own comment,
   *  extracted from `NavMenu`'s original `checkBroadcast`, for why the three states
   *  cannot collapse into two. */
  broadcast: BroadcastState | null | undefined
  /** True only when `broadcast` could not be asked about at all — offline, or a
   *  request that failed in transit — never when it came back and answered "nothing
   *  running". See `start`'s own restart-not-refuse behaviour for why that distinction
   *  has to survive: offering Start on a failed check risks rotating a token that is
   *  still live and already handed out. */
  askFailed: boolean
  audience: { following: number; devices: number } | null
  /** True while a start or a stop is in flight — shared so two controls for the same
   *  broadcast (the menu's screen, the reading bar's icon) can never both fire at once. */
  busy: boolean
  checkBroadcast: () => void
  start: () => Promise<StartResult>
  stop: () => Promise<StopResult>
}

const SingAlongContext = createContext<SingAlongContextValue | null>(null)

/**
 * How often the follower count is re-read while a broadcast is actually live.
 *
 * Used to be gated on the menu's own Sing Together view being open, which was right
 * while that screen was the only place the count showed. It no longer is: the reading
 * bar's follower pill needs the same number for as long as the broadcast runs,
 * not only while a panel happens to be open on top of it. Ten seconds is still chosen
 * for "a leader occasionally glancing at a live number", not a background watcher —
 * the read stops entirely the moment nothing is broadcasting.
 */
const AUDIENCE_MS = 10_000

/**
 * The one broadcast a signed-in reader may be leading, shared by every control that
 * shows or changes it.
 *
 * Extracted out of `NavMenu` once the reading bar grew its own Sing Together
 * icon and follower pill: two components independently polling `getMyBroadcast` and
 * holding their own copy of "is one running" would agree at first paint and then drift
 * the moment either one started or stopped it from under the other. One provider, one
 * poll, one `start`/`stop` pair — every consumer reacts to the same state instead of
 * asking the server again.
 *
 * Mounted at the root layout, next to `RoleProvider`, because its two consumers —
 * `NavMenu` (inside `TopBar`) and the reading bar (a sibling of `TopBar`, not a
 * descendant) — share no closer common ancestor. That puts it on every screen,
 * `/login` and a guest's `/follow/[token]` included; `getMyBroadcast` already answers
 * `null` for a session-less caller without touching the database beyond the session
 * check, the same way `RoleProvider`'s own `loadIdentity` already does on every page.
 *
 * What this does *not* own: the QR code, the "Copied" flash, and any error text — all
 * three live in `SingTogetherPanel` instead, drawn only while that panel is actually
 * open (from the menu or from the bar, whichever the reader tapped), never on every
 * page load for a code nobody is looking at.
 */
export function SingAlongProvider({ children }: { children: ReactNode }) {
  const [broadcast, setBroadcast] = useState<BroadcastState | null | undefined>(undefined)
  const [askFailed, setAskFailed] = useState(false)
  const [audience, setAudience] = useState<{ following: number; devices: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const checkBroadcast = useCallback(() => {
    setAskFailed(false)
    void getMyBroadcast()
      .then(setBroadcast)
      .catch(() => {
        setAskFailed(true)
        setBroadcast(null)
      })
  }, [])

  useEffect(() => {
    checkBroadcast()
  }, [checkBroadcast])

  const token = broadcast?.token

  useEffect(() => {
    if (token === undefined) {
      setAudience(null)
      return
    }

    let cancelled = false
    const read = () => {
      void broadcastAudience()
        .then((answer) => {
          if (!cancelled) setAudience(answer)
        })
        .catch(() => {
          if (!cancelled) setAudience(null)
        })
    }
    read()
    const timer = setInterval(read, AUDIENCE_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [token])

  const start = useCallback(async (): Promise<StartResult> => {
    setBusy(true)
    try {
      const result = await startBroadcast()
      if (result.ok) setBroadcast({ token: result.token, songSlug: null, semitones: 0 })
      return result
    } catch {
      return { ok: false, reason: 'failed' }
    } finally {
      setBusy(false)
    }
  }, [])

  const stop = useCallback(async (): Promise<StopResult> => {
    setBusy(true)
    try {
      const result = await stopBroadcast()
      if (result.ok) setBroadcast(null)
      return result
    } catch {
      return { ok: false }
    } finally {
      setBusy(false)
    }
  }, [])

  const value: SingAlongContextValue = {
    broadcast,
    askFailed,
    audience,
    busy,
    checkBroadcast,
    start,
    stop,
  }

  return <SingAlongContext.Provider value={value}>{children}</SingAlongContext.Provider>
}

export function useSingAlong(): SingAlongContextValue {
  const context = useContext(SingAlongContext)
  if (context === null) {
    throw new Error('useSingAlong must be used inside a SingAlongProvider')
  }
  return context
}
