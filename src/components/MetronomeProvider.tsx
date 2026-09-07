'use client'

import { type ReactNode, createContext, useContext, useEffect, useMemo } from 'react'

import { usePrefs } from '@/components/PrefsProvider'
import { DEFAULT_BEATS_PER_BAR, DEFAULT_BPM } from '@/lib/metronome/tempo'
import { useMetronome } from '@/lib/metronome/useMetronome'

interface MetronomeContextValue {
  /** The tempo it is actually beating at, whoever decided it. */
  bpm: number
  /** How many beats before the accent comes round again. */
  beatsPerBar: number
  /**
   * True when the reader set this tempo themselves rather than taking the song's or the
   * default. It is what the chip's badge lights on and what decides whether the menu has a
   * way back to offer — the same distinction the Key chip draws between the written key and
   * a transposed one.
   */
  chosen: boolean
  /** The same, for the bar: whether the accent's count is the reader's own answer. */
  barChosen: boolean
  /** What the song's own `{tempo: …}` says, or null. Named in the menu's way back. */
  songTempo: number | null
  running: boolean
  /** The beat that has just sounded, counted from the start. Drives the pulse. */
  beat: number
  accent: boolean
  toggle: () => void
  setBpm: (bpm: number | null) => void
  setBeatsPerBar: (beats: number | null) => void
}

const MetronomeContext = createContext<MetronomeContextValue | null>(null)

/**
 * The metronome for one song, shared by the two controls that make it up.
 *
 * A provider rather than props, because those two controls are far apart in the tree and
 * mounted by two different screens: the chip that *sets* the tempo lives on the song's own
 * header (`SongControls`), and the button that *starts* it lives in the floating bar
 * (`ControlBar`) — the same split this app already draws between a value worth reading and
 * a control a hand reaches for mid-song. Threading state through both would mean two props
 * on two components that `SongReader` and `FollowSession` each mount separately.
 *
 * **Three sources answer «what tempo», in this order:** what this reader saved for this
 * song, then the song's own `{tempo: 96}` directive, then 120. Null in the preference is
 * not «no answer yet» but «I take the song's», which is why it is stored as a null rather
 * than as a number — see `SongPrefs.bpm`.
 */
export function MetronomeProvider({
  songSlug,
  songTempo,
  songBeatsPerBar,
  children,
}: {
  /** Only to stop the metronome when the song changes — see the effect below. */
  songSlug: string
  /** `{tempo: …}` as the song was written, or null. */
  songTempo: number | null
  /** The beats in a bar from `{time: …}`, or null. */
  songBeatsPerBar: number | null
  children: ReactNode
}) {
  const { song, setBpm, setBeatsPerBar } = usePrefs()

  const bpm = song.bpm ?? songTempo ?? DEFAULT_BPM
  const beatsPerBar = song.beatsPerBar ?? songBeatsPerBar ?? DEFAULT_BEATS_PER_BAR
  const { running, beat, accent, toggle, stop } = useMetronome(bpm, beatsPerBar)

  /**
   * A new song is a new tempo, so the click stops rather than carrying the last song's
   * across.
   *
   * It reads as belt and braces on the reader's own page, where `SongProvider` is keyed by
   * slug and this whole subtree is rebuilt anyway. It is the only thing that stops it on
   * the *follower's* screen: `FollowedSong` deliberately never unmounts between songs, so
   * without this a broadcast moving to the next song would leave a metronome beating the
   * previous one's tempo, with the chip beside it showing the new one.
   */
  useEffect(() => {
    stop()
  }, [songSlug, stop])

  const value = useMemo<MetronomeContextValue>(
    () => ({
      bpm,
      beatsPerBar,
      chosen: song.bpm !== null,
      barChosen: song.beatsPerBar !== null,
      songTempo,
      running,
      beat,
      accent,
      toggle,
      setBpm,
      setBeatsPerBar,
    }),
    [
      bpm,
      beatsPerBar,
      song.bpm,
      song.beatsPerBar,
      songTempo,
      running,
      beat,
      accent,
      toggle,
      setBpm,
      setBeatsPerBar,
    ],
  )

  return <MetronomeContext.Provider value={value}>{children}</MetronomeContext.Provider>
}

export function useMetronomeControls(): MetronomeContextValue {
  const context = useContext(MetronomeContext)
  if (context === null) {
    throw new Error('useMetronomeControls must be used inside a MetronomeProvider')
  }
  return context
}
