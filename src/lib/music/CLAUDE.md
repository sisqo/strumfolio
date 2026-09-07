# Reading a song: chips, chord shapes and notation

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the two Neon databases — stay in the root `CLAUDE.md`.

- **The song owns key/capo/accidentals/chord-display** — chips on the song itself, not controls
  in the reading panel. A reader's own transposition is separate, in
  `user_song_prefs.semitones`/`.capo`.
- **`shapeFor` picks the default, not the only shape.** Every chord has an alternate-forms
  picker inside the existing `ChordPopup`, guitar *and* ukulele. Three things a change must not
  get wrong: `user_song_prefs.chord_shapes` is `jsonb` keyed
  `${instrument}:${root}:${family}` and valued with the **chosen shape's fingering text**
  (`'320003'`) rather than an index into the candidate list, so reordering the shape search can
  never silently repoint somebody's saved choice; **a missing key means "default"**, never an
  explicit value for "first candidate"; and the form binds to the chord **as it currently
  appears** — root and family after any shift — not to the token in the source.
- **For chord shapes a Strum Together guest follows the capo rule, not the key rule**: their
  own choice stands, where the key is forced by the leader.
- **Two public pages publish this whole table at once** — `/tools/guitar-chords` and
  `/tools/ukulele-chords`, from `chordLibrary.ts`. Three consequences for anything changed
  here. The chart draws `shapeFor`'s answer and nothing else, so retuning the search or the
  ordering changes two hundred boxes on a page a search engine has indexed. `chordLibrary`'s
  test asserts its published family list is **exactly** `FAMILIES`' keys, so a family added
  here fails the suite until it is given a name in words there. And the pages are server
  components on purpose: a full ukulele library is 216 searches of ~13k fingerings, free at
  build time and a fifth of a second of blocked main thread in a browser.
- **German and Nashville notation are output-only** and belong to the reader, not the song.
  German `[B]` is the international `Bb`, so letting it into parsing would make one token mean
  two different chords with nothing in the file to disambiguate — `readRoots` stays on Italian
  and international deliberately.
