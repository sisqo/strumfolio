'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { SCROLL_SPEEDS } from './prefs/types'

/** Minimal shape of the Wake Lock API, which is not in the bundled DOM types. */
interface WakeLockSentinel {
  released: boolean
  release(): Promise<void>
}

interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> }
}

/**
 * How long the page has to be still before auto-scroll takes the wheel back.
 *
 * Long enough to outlast a phone's momentum glide, which keeps scrolling for a second or
 * more after the finger has gone: every scroll event the glide fires re-arms this, so what
 * is really being waited for is stillness rather than a fixed delay. Short enough that a
 * reader who nudged one line does not have to wonder whether they stopped the song.
 */
const SETTLE_MS = 400

/**
 * Auto-scroll at a constant speed.
 *
 * Three details matter more than the loop itself:
 *
 * - Fractional pixels are accumulated instead of passed to scrollBy, which
 *   truncates them. Without this the slowest speeds would round to zero and the
 *   page would not move at all.
 * - The screen is kept awake while scrolling. Without a wake lock the display
 *   sleeps halfway through the song, which makes the whole feature useless on
 *   stage. Where the API is missing it degrades silently.
 * - **Scrolling by hand does not stop the song.** It used to: a wheel, a swipe or an
 *   arrow key called `setRunning(false)`, so nudging back a line to re-read it meant
 *   reaching for play again with a guitar in your hands. What a gesture does now is
 *   *suspend* the motion until the page is still again — `running` never changes, so the
 *   button stays lit, the wake lock stays held, and the scroll picks up from wherever the
 *   reader left it.
 */
export function useAutoScroll(speedStep: number) {
  const [running, setRunning] = useState(false)
  /**
   * The reader is scrolling, so the loop holds off — a state of the *motion*, never of the
   * song: `running` is what the play button reads and what the wake lock hangs on, and
   * neither may flicker because somebody moved the page an inch.
   */
  const [suspended, setSuspended] = useState(false)
  const speedRef = useRef(speedStep)
  const frameRef = useRef<number | null>(null)
  const lastTimeRef = useRef(0)
  const remainderRef = useRef(0)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const settleRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    speedRef.current = speedStep
  }, [speedStep])

  const releaseWakeLock = useCallback(() => {
    const sentinel = wakeLockRef.current
    wakeLockRef.current = null
    if (sentinel && !sentinel.released) void sentinel.release().catch(() => {})
  }, [])

  const requestWakeLock = useCallback(async () => {
    const wakeLock = (navigator as Navigator & WakeLockNavigator).wakeLock
    if (!wakeLock) return
    try {
      wakeLockRef.current = await wakeLock.request('screen')
    } catch {
      // Denied, or unsupported in this context. Scrolling still works.
    }
  }, [])

  /** Waits `SETTLE_MS` from the last sign of movement, and re-arms on every new one. */
  const settle = useCallback(() => {
    window.clearTimeout(settleRef.current)
    settleRef.current = window.setTimeout(() => setSuspended(false), SETTLE_MS)
  }, [])

  const suspend = useCallback(() => {
    setSuspended(true)
    settle()
  }, [settle])

  const stop = useCallback(() => {
    setRunning(false)
  }, [])

  /**
   * Starting a song that is already sitting at its end begins it again from the top.
   *
   * Without this, play is a **dead button** for the rest of the song's life: the loop
   * stops at the bottom, which is right, and every press after that lights the button for
   * one frame, finds nothing to scroll, and puts it out again. Nothing on the screen says
   * why, and the only way back is to scroll the whole song up by hand — with an
   * instrument in your hands, on the one screen where that is hardest. It is also the
   * shape a reader is most likely to meet, because they arrive at the bottom by having
   * played the song through: the first press works, and every press afterwards looks
   * broken.
   *
   * So «play» on a finished song means what it means on every other player — begin it
   * again — rather than nothing at all. `room > 0` keeps this away from the case the loop
   * itself now handles: a song that fits the screen has no end to be at, and nothing to
   * rewind.
   *
   * `instant` rather than a smooth glide, like the two other programmatic scrolls in this
   * app (`useRowDrag`, `ArrangeSongbook`): a smooth scroll would still be animating while
   * the loop starts scrolling underneath it, and the two would fight.
   */
  const rewindIfEnded = useCallback(() => {
    const page = document.documentElement
    const room = page.scrollHeight - page.clientHeight
    /* A pixel of slack: `scrollY` is fractional under a zoom or a scaled display, so it
       can rest a hair short of `room` at a bottom the browser considers reached. */
    if (room > 0 && window.scrollY >= room - 1) window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  const start = useCallback(() => {
    rewindIfEnded()
    setRunning(true)
  }, [rewindIfEnded])

  const toggle = useCallback(() => {
    if (running) {
      setRunning(false)
      return
    }

    rewindIfEnded()
    setRunning(true)
  }, [running, rewindIfEnded])

  /**
   * The wake lock, on `running` alone and no longer inside the loop's own effect.
   *
   * The split is what keeps a nudge cheap: the loop below now stops and starts every time
   * the reader touches the page, and a wake lock that came and went with it would be
   * requested and released on every swipe — churn against a permission-shaped API, for a
   * screen that must stay awake the whole time either way. The song is still playing while
   * a finger is on it.
   */
  useEffect(() => {
    if (!running) {
      releaseWakeLock()
      return
    }

    void requestWakeLock()
    return releaseWakeLock
  }, [running, releaseWakeLock, requestWakeLock])

  useEffect(() => {
    if (!running || suspended) return

    lastTimeRef.current = performance.now()
    remainderRef.current = 0

    const step = (now: number) => {
      const elapsed = (now - lastTimeRef.current) / 1000
      lastTimeRef.current = now

      const wanted = SCROLL_SPEEDS[speedRef.current] * elapsed + remainderRef.current
      const whole = Math.floor(wanted)
      remainderRef.current = wanted - whole

      if (whole > 0) {
        const before = window.scrollY
        window.scrollBy(0, whole)

        /*
         * Nothing moved, which used to be read as one thing and is really two: the
         * song has ended, or the song never had anywhere to go. Only the first is a
         * reason to stop.
         *
         * The reading page makes the difference easy to miss, because a song that
         * fits leaves the document *exactly* the height of the viewport rather than a
         * pixel over — `.song-card` carries `min-height: calc(100dvh - 4.375rem)` under
         * a 4rem header, so the page it adds up to is one screen and not scrollable at
         * all. Treating that as the bottom meant pressing play un-pressed itself on the
         * first frame that wanted a whole pixel, which reads as the song stopping the
         * instant it starts. It reached a real reader when tab blocks became collapsed
         * by default and took ~170px out of the songs that have them, dropping a page
         * that used to clear the window to exactly its height.
         *
         * So a page with nowhere to scroll keeps playing instead: `running` stays true
         * and the wake lock stays held, which is the half that matters on stage — a
         * short song is still a song you are looking at, and the screen going to sleep
         * halfway through it is the thing the lock exists to prevent. Nothing moves,
         * because there is nothing to move; if the page does grow later — a tab opened,
         * the zoom stepped up — the loop is still there and simply starts scrolling.
         *
         * The geometry is read only on a frame that already failed to move, and
         * `scrollHeight`/`clientHeight` are the pair that answers this: both exclude the
         * scrollbars, so their difference is the room the page actually has.
         */
        const page = document.documentElement
        if (window.scrollY === before && page.scrollHeight > page.clientHeight) {
          setRunning(false)
          return
        }
      }

      frameRef.current = requestAnimationFrame(step)
    }

    frameRef.current = requestAnimationFrame(step)

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [running, suspended])

  /**
   * Hands off while the reader is scrolling, and back on once the page is still.
   *
   * The gesture used to *stop* the song, so that correcting position by hand never fought
   * the animation. Half of that reasoning still holds — a `scrollBy` every frame against a
   * finger that is dragging the other way is a page that feels stuck — and the other half
   * was too expensive: the reader who nudged back one line had lost their auto-scroll and
   * had to find the play button again mid-song. Suspending buys the first without paying
   * the second.
   *
   * Touches on the app's own fixed controls are not such a gesture. A tap fires
   * `touchstart` on window wherever it lands, so without this exclusion pressing the speed
   * buttons would suspend the scroll instead of speeding it up, which is the one thing
   * those buttons exist to do while a song is playing.
   *
   * `wheel` is deliberately not excluded: a wheel anywhere, the control bar included,
   * really does scroll the page.
   *
   * `touchmove` and `touchend` are listened to alongside `touchstart` so a drag that
   * outlasts `SETTLE_MS` keeps the loop off for as long as the finger is down, rather than
   * having the page start pulling out from under it.
   */
  useEffect(() => {
    if (!running) {
      setSuspended(false)
      return
    }

    const fromControls = (target: EventTarget | null) =>
      target instanceof Element && target.closest('.control-bar, .top-bar') !== null

    const onWheel = () => suspend()

    const onTouch = (event: TouchEvent) => {
      if (fromControls(event.target)) return
      suspend()
    }

    const onKey = (event: KeyboardEvent) => {
      /*
       * A key pressed on one of our own controls is working that control, not scrolling
       * the page: space presses a button, and the arrows move the speed slider — the one
       * control on the bar meant to be touched mid-song.
       */
      if (fromControls(event.target)) return

      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
        suspend()
      }
    }

    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouch, { passive: true })
    window.addEventListener('touchmove', onTouch, { passive: true })
    window.addEventListener('touchend', onTouch, { passive: true })
    window.addEventListener('keydown', onKey)

    return () => {
      window.clearTimeout(settleRef.current)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouch)
      window.removeEventListener('touchmove', onTouch)
      window.removeEventListener('touchend', onTouch)
      window.removeEventListener('keydown', onKey)
    }
  }, [running, suspend])

  /**
   * What actually decides when to resume: the page being still, not a fixed delay.
   *
   * A phone's momentum glide goes on scrolling for a second or more after the finger has
   * lifted, and taking over mid-glide is the fight all over again. Every scroll event
   * re-arms the timer, so the loop comes back `SETTLE_MS` after the *page* stopped moving.
   *
   * Listening to `scroll` is safe here in a way it would not be in general — the warning
   * the old code carried, that `scroll` catches our own scrolling, is exactly right. This
   * listener exists only while `suspended` is true, which is only while the loop is not
   * running: it cannot hear itself, and it is gone again before the loop starts.
   */
  useEffect(() => {
    if (!running || !suspended) return

    const onScroll = () => settle()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [running, suspended, settle])

  /** Wake locks are dropped when the page is hidden, so take it back on return. */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && running && wakeLockRef.current === null) {
        void requestWakeLock()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [running, requestWakeLock])

  return { running, start, stop, toggle }
}
