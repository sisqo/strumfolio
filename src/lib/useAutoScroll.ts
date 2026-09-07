'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { SCROLL_SPEEDS } from './prefs/types'
import { atScrollEnd } from './scrollEnd'
import { useWakeLock } from './useWakeLock'

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
  const settleRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    speedRef.current = speedStep
  }, [speedStep])

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
    /* The same `atScrollEnd` the loop stops on, so the position that ends a song and the
       position that rewinds one can never disagree — a song stopped at a bottom this did
       not recognise would leave play dead exactly as before. */
    if (atScrollEnd(window.scrollY, page.scrollHeight, page.clientHeight)) {
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
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
   *
   * `useWakeLock` is where the API itself is handled, and it is shared with the metronome:
   * either can be running on its own, so neither owns the screen — see that hook.
   */
  useWakeLock(running)

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
        window.scrollBy(0, whole)

        /*
         * Whether the song has ended is a question about *where the page is*, and this
         * used to ask whether the last nudge had moved it — which is a different
         * question with the same answer only at 100% zoom. `atScrollEnd` carries both
         * cases that proved it wrong, a song too short to scroll and a browser zoomed
         * past 100%; the wake lock is why a page with no end keeps playing rather than
         * stopping. Read every frame that asked for a pixel, and cheap: two layout
         * properties already computed for the scroll itself.
         */
        const page = document.documentElement
        if (atScrollEnd(window.scrollY, page.scrollHeight, page.clientHeight)) {
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

  return { running, start, stop, toggle }
}
