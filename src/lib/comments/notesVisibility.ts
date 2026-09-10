/**
 * Whether this reader has the notes hidden, for as long as the app is open.
 *
 * **The only `sessionStorage` in this app, and the choice is the point.** Fourteen other
 * places reach for `localStorage`, which is the right store for something a reader decides
 * once — the theme, the zoom, which songbooks are folded. Hiding the notes is not that: it
 * is what somebody does to get a clean page for one set, and having it still be hidden a
 * week later, on a different night, is how a reader loses writing they do not remember
 * hiding. `sessionStorage` is exactly the lifetime asked for — it survives moving between
 * songs and a reload, and it is gone when the app is closed.
 *
 * **Why storage at all, rather than lifting the state.** `CommentsProvider` mounts inside
 * `<SongProvider key={song.slug}>` in `SongReader`, and that key exists to throw away the
 * previous song's state — without it React keeps the old words under the new title. So the
 * mode was being reset by the remount on every song, which is the behaviour this fixes;
 * hoisting the state above the key would fix the same thing, but only until a reload, and
 * on stage the app is reloaded by every stumble back into it.
 *
 * **A boolean, not a `CommentsMode`.** The mode has three states and only two of them are
 * a choice: `adding` arms every word on the page as a target, and restoring a reader into
 * it — page armed, waiting for a tap they made yesterday — is never what they meant. It
 * collapses to `visible` here by never being written.
 */

const KEY = 'songs:notes-hidden'

/** Read at mount. `false` whenever there is nothing stored, or no storage to read. */
export function readNotesHidden(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(KEY) === '1'
  } catch {
    // Private-mode browsers and disabled storage both throw on access, not just on write.
    return false
  }
}

export function writeNotesHidden(hidden: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (hidden) window.sessionStorage.setItem(KEY, '1')
    else window.sessionStorage.removeItem(KEY)
  } catch {
    // Losing the choice is survivable; throwing inside a click handler is not.
  }
}
