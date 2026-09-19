/**
 * Cuts a paste into one text per song.
 *
 * Only on marks that a human put there on purpose. The tempting heuristic —
 * "a blank line, then a line that looks like a title" — is exactly wrong for this
 * material: songs are full of blank lines between verses, and a verse's first line
 * looks like a title as often as not. Getting that wrong tears one song into five,
 * and the person pasting cannot see it happen until five wrong songs are saved.
 *
 * So the marks are explicit, and each of the three is something that already
 * appears in real sources:
 *
 * - `{new_song}`, or `{ns}` — ChordPro's own separator for a multi-song file, so
 *   an export from any tool that speaks it can be pasted whole.
 * - A rule: a line of nothing but `---`, `===`, `***` or `___`. What people type
 *   themselves when they paste two songs into one box.
 * - A second `{title:}` directive. A file cannot hold two titles for one song, so
 *   a later one is the next song starting — and unlike the rules, this mark is
 *   part of the song it opens, so it stays with it.
 *
 * A form feed counts as a rule: text extracted from a PDF songbook carries one at
 * every page break, and those pages are songs.
 *
 * None of the three marks are read inside a `{start_of_tab}` … `{end_of_tab}` block.
 * A silent string across a whole bar is a run of dashes with nothing else on the
 * line — indistinguishable from the rule someone types between two pasted songs —
 * and a tab is exactly the material `RULE` was never meant to fire on. `document.ts`
 * and `chordpro.ts` already treat a tab's rows as verbatim for the same reason.
 *
 * Anything else is one song, which is the safe way to be wrong: the screen shows
 * what it found before saving, and one song too few is a re-paste, while one song
 * too many is a mess to clean up afterwards.
 */

/** `{ns}` or `{new_song}`, with or without an argument. */
const NEW_SONG = /^\{\s*(?:ns|new_song)\s*(?::[^}]*)?\}$/i

/** `{t: …}` or `{title: …}`, which opens the song rather than separating it. */
const TITLE = /^\{\s*(?:t|title)\s*:[^}]*\}$/i

/** Three or more of one rule character, and nothing else. */
const RULE = /^(?:-{3,}|={3,}|\*{3,}|_{3,})$/

/** A line that is nothing but a directive — part of a song's header, never of its words. */
const DIRECTIVE_ONLY = /^\{[^}]*\}$/

/** `{start_of_tab}` or `{sot}` — same aliases `document.ts` reads. */
const START_OF_TAB = /^\{\s*(?:sot|start_of_tab)\s*\}$/i

/** `{end_of_tab}` or `{eot}`. */
const END_OF_TAB = /^\{\s*(?:eot|end_of_tab)\s*\}$/i

export function splitSongs(text: string): string[] {
  // A form feed is a page break, and a page break in a songbook is a new song.
  const lines = text.replace(/\r\n?/g, '\n').replace(/\f/g, '\n---\n').split('\n')

  const songs: string[][] = []
  let current: string[] = []
  let inTab = false
  /**
   * Whether a *song* is underway — which means words, not merely a header.
   *
   * The rule below cuts at a `{title:}` only when one is, precisely so a paste that opens
   * with a title — every ChordPro export does — does not begin with an empty song in front
   * of it. That guard used to ask only «is any line non-blank», and a real file rarely opens
   * with its title on line one: it opens with a `#` note about where the file came from, or
   * with `{pagetype}` and `{titles center}`, and either made the answer yes. Six of twelve
   * real files then came apart into a phantom song plus the real one, and in two the comment
   * went on to become the phantom's title.
   *
   * So a header does not count: blank lines, `#` comments and directive-only lines are all
   * things a song has *before* it starts. Erring this way is the documented safe direction —
   * one song too few is a re-paste, one too many is a mess to clean up.
   */
  const hasContent = () =>
    current.some(
      (line) =>
        line.trim() !== '' && !line.startsWith('#') && !DIRECTIVE_ONLY.test(line.trim()),
    )

  const cut = () => {
    if (hasContent()) songs.push(current)
    current = []
  }

  for (const line of lines) {
    const trimmed = line.trim()

    // Verbatim while a tab is open: none of the three marks mean here what they
    // mean anywhere else, a silent-string rule of dashes least of all.
    if (inTab) {
      if (END_OF_TAB.test(trimmed)) inTab = false
      current.push(line)
      continue
    }

    if (START_OF_TAB.test(trimmed)) {
      inTab = true
      current.push(line)
      continue
    }

    if (RULE.test(trimmed) || NEW_SONG.test(trimmed)) {
      // The mark is not part of either song.
      cut()
      continue
    }

    /*
     * A title only starts a song when there is already one underway. Otherwise a
     * paste that opens with `{title:}` — every ChordPro export does — would begin
     * with an empty song before it.
     */
    if (TITLE.test(trimmed) && hasContent()) {
      cut()
    }

    current.push(line)
  }

  cut()

  // Blank lines around the cuts belong to no song.
  return songs.map((song) => song.join('\n').replace(/^(?:[ \t]*\n)+/, '').trimEnd())
}
