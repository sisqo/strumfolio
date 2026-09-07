'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useWakeLock } from '../useWakeLock'
import { type Beat, type BeatPhase, beatSeconds, beatsDue } from './tempo'

/**
 * How often the scheduler wakes up, and how far ahead of itself it works.
 *
 * The horizon has to outlast the tick by a comfortable margin — a timer is allowed to be
 * late, and a beat that was never scheduled because the tick that would have scheduled it
 * ran 40 ms behind is a beat that never sounds. 25 against 120 ms leaves the scheduler four
 * chances to place every beat before it is due, which is what makes a dropped click take a
 * stall of over a tenth of a second rather than a hiccup.
 */
const TICK_MS = 25
const HORIZON_SECONDS = 0.12

/** The click itself: a short sine burst, higher and louder on the first beat of the bar. */
const BEAT_HZ = 1000
const ACCENT_HZ = 1600
const BEAT_GAIN = 0.32
const ACCENT_GAIN = 0.55
const CLICK_SECONDS = 0.045

/**
 * Safari's own prefix, and the one iOS property that decides whether any of this is
 * audible at all. Neither is in the bundled DOM types.
 */
interface AudioWindow {
  webkitAudioContext?: typeof AudioContext
}

interface AudioSessionNavigator {
  audioSession?: { type: string }
}

export interface Metronome {
  running: boolean
  /**
   * The last beat that has sounded, counted from the start — `-1` before the first. It is
   * the visual pulse's own value: a number that changes on every beat is what lets a
   * component restart an animation with `key`, the same way `ControlBar` already restarts
   * the broadcast rings.
   */
  beat: number
  /** Whether that beat was the first of its bar. */
  accent: boolean
  toggle: () => void
  stop: () => void
}

/**
 * A metronome that beats at `bpm`, accenting one beat in `beatsPerBar`.
 *
 * **The timer decides what to schedule, never when a click sounds.** A `setInterval` that
 * plays a click on each firing drifts audibly inside a minute — timers are late by
 * whatever the main thread was busy with, and the lateness accumulates. So every beat is
 * handed to the audio clock ahead of time, at a moment `beatsDue` worked out from the
 * phase, and lands there whatever the timer was doing. See `tempo.ts`, where all of that
 * arithmetic lives and is tested.
 *
 * **The `AudioContext` is created inside the gesture that starts the metronome**, never at
 * mount. Every browser that autoplay rules apply to — which is all of them on a phone —
 * starts a context created outside a user gesture in `suspended`, and a suspended context's
 * `currentTime` does not advance: the scheduler would run, place beats, and produce
 * silence. It is created and resumed on the first press and then kept, because a reader who
 * stops and starts between verses must not pay for a new context each time.
 *
 * **iOS mutes Web Audio when the ringer switch is on silent, which is how a gigging phone
 * is carried.** `navigator.audioSession.type = 'playback'` (Safari 16.4 and up) is what
 * says this is playback rather than an interface noise, and it is the difference between a
 * metronome that works on stage and one that does not. It cannot be verified from a desktop
 * browser; the visual pulse below is deliberately not conditional on the sound, so the beat
 * is still visible on a phone where this fails or is too old to apply.
 */
export function useMetronome(bpm: number, beatsPerBar: number): Metronome {
  const [running, setRunning] = useState(false)
  const [beat, setBeat] = useState(-1)
  const [accent, setAccent] = useState(false)

  const contextRef = useRef<AudioContext | null>(null)
  const phaseRef = useRef<BeatPhase>({ time: 0, index: 0 })
  const tickRef = useRef<number | undefined>(undefined)
  const frameRef = useRef<number | null>(null)
  /** Beats already handed to the audio clock and not yet shown on screen. */
  const pendingRef = useRef<Beat[]>([])

  const bpmRef = useRef(bpm)
  const barRef = useRef(beatsPerBar)
  useEffect(() => {
    bpmRef.current = bpm
  }, [bpm])
  useEffect(() => {
    barRef.current = beatsPerBar
  }, [beatsPerBar])

  /* A metronome beating through a verse nobody is scrolling is exactly the case where the
     screen would otherwise go dark mid-song. Held on `running` alone, and shared with
     auto-scroll — see `useWakeLock`. */
  useWakeLock(running)

  /**
   * The audio clock, or the wall clock where there is no audio at all.
   *
   * The fallback is what keeps the visual pulse honest on a browser with no Web Audio: the
   * beat is still counted and still drawn, and only the sound is missing. Both clocks are
   * monotonic and in seconds, which is all `beatsDue` asks of them.
   */
  const now = useCallback(
    () => contextRef.current?.currentTime ?? performance.now() / 1000,
    [],
  )

  const click = useCallback((time: number, isAccent: boolean) => {
    const context = contextRef.current
    if (context === null) return

    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = isAccent ? ACCENT_HZ : BEAT_HZ

    /*
     * An envelope rather than a bare start/stop: a square-edged burst clicks twice, once
     * for the sound and once for the discontinuity at each end. Exponential ramps cannot
     * reach zero, hence the near-silent floor either side.
     */
    const peak = isAccent ? ACCENT_GAIN : BEAT_GAIN
    gain.gain.setValueAtTime(0.0001, time)
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + CLICK_SECONDS)

    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(time)
    oscillator.stop(time + CLICK_SECONDS + 0.01)
  }, [])

  const stop = useCallback(() => {
    setRunning(false)
  }, [])

  const toggle = useCallback(() => {
    if (running) {
      setRunning(false)
      return
    }

    /*
     * Inside the press, and this is the whole reason `toggle` is not just `setRunning`:
     * both the construction and the `resume` have to happen in a user gesture, or the
     * context stays suspended and every beat below is scheduled into a clock that is not
     * running.
     */
    if (contextRef.current === null) {
      const Ctor = window.AudioContext ?? (window as Window & AudioWindow).webkitAudioContext
      if (Ctor !== undefined) {
        try {
          contextRef.current = new Ctor()
        } catch {
          // No audio here. The pulse below still counts the beat.
        }
      }
    }

    const session = (navigator as Navigator & AudioSessionNavigator).audioSession
    if (session !== undefined) {
      /* «This is playback», which is what makes it audible on an iPhone carried on silent
         — the way a phone on stage is carried. Ignored where it is not understood. */
      try {
        session.type = 'playback'
      } catch {
        // Read-only in this browser: nothing to do, and nothing lost that was there before.
      }
    }

    void contextRef.current?.resume().catch(() => {})

    /* From the top of a bar, so the first click a reader hears after pressing is the
       downbeat. A beat ahead of `now`, never on it: a beat scheduled at the exact instant
       the context is read has no time left to be scheduled in. */
    phaseRef.current = { time: now() + 0.08, index: 0 }
    pendingRef.current = []
    setBeat(-1)
    setRunning(true)
  }, [running, now])

  /** The scheduler. Everything it decides comes from `beatsDue`; it only plays the answer. */
  useEffect(() => {
    if (!running) return

    const schedule = () => {
      const result = beatsDue(phaseRef.current, {
        now: now(),
        horizon: HORIZON_SECONDS,
        seconds: beatSeconds(bpmRef.current),
        beatsPerBar: barRef.current,
      })
      phaseRef.current = result.phase

      for (const due of result.beats) {
        click(due.time, due.accent)
        pendingRef.current.push(due)
      }
    }

    schedule()
    tickRef.current = window.setInterval(schedule, TICK_MS)
    return () => window.clearInterval(tickRef.current)
  }, [running, now, click])

  /**
   * The visual pulse: state catches up with the audio clock, rather than driving it.
   *
   * On a frame rather than on a timer per beat, and the difference shows on the one screen
   * this is for — a frame is already synchronised with the paint, so the flash lands with
   * the click instead of a frame either side of it. Beats that came due while the page was
   * hidden are dropped in the same pass: `requestAnimationFrame` does not run in a hidden
   * tab, so coming back to a queue of them must not replay the flash for each.
   */
  useEffect(() => {
    if (!running) {
      pendingRef.current = []
      return
    }

    const paint = () => {
      const current = now()
      let latest: Beat | null = null
      while (pendingRef.current.length > 0 && pendingRef.current[0].time <= current) {
        latest = pendingRef.current.shift() ?? null
      }

      if (latest !== null) {
        setBeat(latest.index)
        setAccent(latest.accent)
      }

      frameRef.current = requestAnimationFrame(paint)
    }

    frameRef.current = requestAnimationFrame(paint)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [running, now])

  /**
   * iOS suspends the context when the app goes to the background and does not always resume
   * it on return. Without this the metronome comes back visually running and silent — the
   * scheduler places beats into a clock that has stopped, so `beatsDue` sees no time pass
   * and nothing sounds.
   */
  useEffect(() => {
    if (!running) return

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      void contextRef.current?.resume().catch(() => {})
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [running])

  /* Closed on unmount and not on every stop: a context is a real resource and a browser
     allows only a few dozen of them per page, but building one costs a gesture's worth of
     latency, which is exactly what a reader stopping between two verses must not pay. */
  useEffect(() => {
    return () => {
      void contextRef.current?.close().catch(() => {})
      contextRef.current = null
    }
  }, [])

  return { running, beat, accent, toggle, stop }
}
