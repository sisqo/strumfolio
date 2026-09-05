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
 * **The counter guards a state that is currently unreachable, and it is here so that the
 * code does not depend on why.** Measured on 2026-09-05 against a deliberately slowed
 * `loadPrefs`: Next.js runs one client's server actions strictly one at a time, so a write
 * enqueued after a read in flight cannot complete until that read has answered — the read
 * therefore always lands while `writePending` is still true, and `writePending` alone is
 * enough today. That is an undocumented property of the framework, not of this app: it
 * would stop holding if `prefsQueue.flush` ever stopped awaiting each write in turn, or if
 * a future Next version dispatched actions in parallel. The counter costs one integer and
 * makes the rule stand on its own either way.
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
}

export function readStillStands(guard: ReadGuard): boolean {
  return guard.editsAtRead === guard.editsNow && !guard.writePending
}

/**
 * The song preferences to apply, or `null` when nothing of this read still stands.
 *
 * Field by field rather than all or nothing, and the granularity is the point: the star and
 * the rest of the row are queued separately (see `saveFavorite`), so a reader who tapped the
 * star said nothing at all about their capo — and the server's capo is still the freshest
 * answer there is for it. Refusing the whole row over one tapped star would throw away a
 * transposition saved last night.
 */
export function adoptStoredSong({
  stored,
  local,
  row,
  star,
}: {
  /** What the server has just said. */
  stored: SongPrefs
  /** What this browser is showing, which may be newer. */
  local: SongPrefs
  /** The key, the speed, the capo and the chosen shapes — everything `saveSongPrefs` writes. */
  row: ReadGuard
  /** The star, which travels on its own. */
  star: ReadGuard
}): SongPrefs | null {
  const takeRow = readStillStands(row)
  const takeStar = readStillStands(star)
  if (!takeRow && !takeStar) return null

  return {
    semitones: takeRow ? stored.semitones : local.semitones,
    scrollSpeed: takeRow ? stored.scrollSpeed : local.scrollSpeed,
    capo: takeRow ? stored.capo : local.capo,
    chordShapes: takeRow ? stored.chordShapes : local.chordShapes,
    favorite: takeStar ? stored.favorite : local.favorite,
  }
}
