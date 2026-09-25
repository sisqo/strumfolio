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
 * None of the three marks are read inside a `{start_of_tab}` … `{end_of_tab}` block, nor any
 * other verbatim block (grid, grille, the delegated environments), labelled or not.
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

/** `{t: …}` or `{title: …}`, which opens the song rather than separating it. Greedy to the last
    brace, since a title may hold one of its own: `{title: Song {Live}}`. The space form too —
    `{title Song}`, `{t Song}` — which the reader and `METADATA_DIRECTIVE` accept: without it two
    songs so titled were imported as one, and the second title was stripped with nothing left. */
const TITLE = /^\{\s*(?:t|title)(?:\s*:.*|\s+\S.*)\}$/i

/** Three or more of one rule character, and nothing else. */
const RULE = /^(?:-{3,}|={3,}|\*{3,}|_{3,})$/

/** A line that is nothing but a directive — part of a song's header, never of its words. */
const DIRECTIVE_ONLY = /^\{[^}]*\}$/

/**
 * The opening of any block whose rows are verbatim — a tab, a grid, a delegated environment —
 * with the label or selector the format allows on it: `{start_of_tab: Intro}`, `{sot-guitar}`.
 * These used to match only bare, so a labelled tab's silent-string row of dashes read as a rule
 * and cut the song in two.
 *
 * **The tail is three alternatives, each linear**, where it was `\s*(?:[:\s].*)?\}` — a `\s*`
 * and a `[:\s]` that could share one run of spaces, so `{sot` followed by thirty thousand
 * spaces and no brace took half a second to refuse. The three say the same thing: nothing but
 * spaces before the brace, a colon after optional spaces, or one space and then anything.
 * Spelt out rather than shortened to `[:\s].*`, because `\s` takes a line separator and `.`
 * does not; `split.test.ts` checks it against the old expression.
 */
export const START_OF_VERBATIM =
  /^\{\s*(sot|sog|start_of_(?:tab|grid|grille|abc|ly|svg|textblock|strum))(?:-!?[\w-]*)?(?:\s*\}|\s*:.*\}|\s.*\})$/i

/** The matching close, with the selector the opening carried. */
const END_OF_VERBATIM = /^\{\s*(eot|eog|end_of_(?:tab|grid|grille|abc|ly|svg|textblock|strum))(?:-!?[\w-]*)?\s*\}$/i

/** `sot`/`eot` and `sog`/`eog` as the environment they name, so a block closes only on its own end. */
function environmentOf(name: string): string {
  const lower = name.toLowerCase()
  if (lower === 'sot' || lower === 'eot') return 'tab'
  if (lower === 'sog' || lower === 'eog') return 'grid'
  return lower.replace(/^(?:start|end)_of_/, '')
}

export function splitSongs(text: string): string[] {
  // A form feed is a page break, and a page break in a songbook is a new song.
  const lines = text.replace(/\r\n?/g, '\n').replace(/\f/g, '\n---\n').split('\n')

  const songs: string[][] = []
  let current: string[] = []
  /** The verbatim environment that is open, or null. */
  let inBlock: string | null = null

  /*
   * **A rule is a separator only in text that has no ChordPro song marks of its own.** It exists
   * for what people type between two pasted songs; a ChordPro file already says where each song
   * starts, with `{title}` or `{new_song}`, and a line of `---` inside one is part of that song.
   * This app's own export is such a file and is its restore path, so reading `---` as a cut there
   * split a restored song in two, the second half with a title guessed from its words.
   */
  const marked = lines.some((line) => TITLE.test(line.trim()) || NEW_SONG.test(line.trim()))
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

  /* A chunk with a title is a song even with no words — a song whose body is empty, or only
     directives, exported and restored, used to vanish here. */
  const cut = () => {
    if (hasContent() || current.some((line) => TITLE.test(line.trim()))) songs.push(current)
    current = []
  }

  for (const line of lines) {
    const trimmed = line.trim()

    // Verbatim while a tab is open: none of the three marks mean here what they
    // mean anywhere else, a silent-string rule of dashes least of all.
    if (inBlock !== null) {
      const end = END_OF_VERBATIM.exec(trimmed)
      if (end !== null && environmentOf(end[1]!) === inBlock) inBlock = null
      current.push(line)
      continue
    }

    const start = START_OF_VERBATIM.exec(trimmed)
    if (start !== null) {
      inBlock = environmentOf(start[1]!)
      current.push(line)
      continue
    }

    if ((RULE.test(trimmed) && !marked) || NEW_SONG.test(trimmed)) {
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
