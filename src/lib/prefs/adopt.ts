/**
 * Whether a stored row that has just come back may still be applied, and how much of it.
 *
 * `PrefsProvider` reads the local cache before paint and asks the server a moment later,
 * and the server's answer is meant to win — the database is the single source of truth.
 * But a reader is not idle in the meantime: they open a song and immediately tap the star,
 * move the capo, take the key down a tone. An answer to a question asked *before* they did
 * that is not more authoritative than what they just chose; it is simply older.
 *
 * Two different things can make it older, and each is invisible to the other's test:
 *
 * - **`writePending`** — a change is queued and has not reached the server, so any answer
 *   in hand necessarily predates it. This catches a read *issued after* the change:
 *   stepping to another song and back while the first write is still waiting.
 * - **the edit counter** — the reader has changed this scope since this particular read
 *   was issued. This catches the opposite order: the queue empties the moment a write
 *   lands, so a read that resolves after that finds nothing pending and would happily
 *   apply the value from before the reader acted — a star quietly going out, or a capo
 *   springing back, seconds after being set.
 *
 * **The counter is what holds this now, not a backstop.** Measured on 2026-09-05: while the
 * read and the writes were Server Actions, Next.js ran them strictly one at a time, so a write
 * enqueued after a read in flight could not land before the read answered, and `writePending`
 * alone was enough. Since 2026-10-17 both go by plain `fetch` (`lib/reader/route.ts`, so that a
 * pending one overtaken by Next cannot reload the song on dead wifi), and a write can now land
 * while an older read is still out — exactly the order the counter catches.
 *
 * (What the separate columns fix is a *different* race, and that one is real and was
 * reproduced — see `saveFavorite`.)
 *
 * A counter rather than a flag because `PrefsProvider` is not remounted between songs
 * (only `SongProvider` is keyed): a sticky "the reader has touched this" would refuse the
 * server's answer for every song opened afterwards. Comparing the count at the read
 * against the count now asks the exact question — *since this read*, not *ever*.
 */

import type { SongPrefs } from './types'

export interface ReadGuard {
  /** The scope's edit count at the moment this read was issued. */
  editsAtRead: number
  /** The scope's edit count now, as the read comes back. */
  editsNow: number
  /** Whether a write for this scope is still waiting to reach the server. */
  writePending: boolean
  /**
   * Whether one was already waiting when this read went out. Since the read and the writes run
   * in parallel (2026-10-17), such a read can be answered from before that write and come back
   * after it has landed — when `writePending` is false and the counter has not moved. Optional
   * only so a guard that cannot know says nothing; `PrefsProvider` always sets it.
   */
  pendingAtRead?: boolean
}

export function readStillStands(guard: ReadGuard): boolean {
  return guard.editsAtRead === guard.editsNow && !guard.writePending && guard.pendingAtRead !== true
}

/**
 * The song preferences to apply, or `null` when nothing of this read still stands.
 *
 * Field by field rather than all or nothing, and the granularity is the point: the star,
 * the tab-expanded flag, and the rest of the row are each queued separately (see
 * `saveFavorite` and `saveTabsExpanded`), so a reader who tapped the star or opened a tab
 * said nothing at all about their capo — and the server's capo is still the freshest
 * answer there is for it. Refusing the whole row over one tapped star or tab would throw
 * away a transposition saved last night.
 */
export function adoptStoredSong({
  stored,
  local,
  row,
  star,
  tabs,
}: {
  /** What the server has just said. */
  stored: SongPrefs
  /** What this browser is showing, which may be newer. */
  local: SongPrefs
  /** The key, the speed, the capo, the tempo and the chosen shapes — everything
   *  `saveSongPrefs` writes. */
  row: ReadGuard
  /** The star, which travels on its own. */
  star: ReadGuard
  /** Whether the tab blocks show open, which also travels on its own — see `saveTabsExpanded`. */
  tabs: ReadGuard
}): SongPrefs | null {
  const takeRow = readStillStands(row)
  const takeStar = readStillStands(star)
  const takeTabs = readStillStands(tabs)
  if (!takeRow && !takeStar && !takeTabs) return null

  return {
    semitones: takeRow ? stored.semitones : local.semitones,
    scrollSpeed: takeRow ? stored.scrollSpeed : local.scrollSpeed,
    capo: takeRow ? stored.capo : local.capo,
    bpm: takeRow ? stored.bpm : local.bpm,
    beatsPerBar: takeRow ? stored.beatsPerBar : local.beatsPerBar,
    chordShapes: takeRow ? stored.chordShapes : local.chordShapes,
    favorite: takeStar ? stored.favorite : local.favorite,
    tabsExpanded: takeTabs ? stored.tabsExpanded : local.tabsExpanded,
  }
}
