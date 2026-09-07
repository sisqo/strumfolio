# Reading a song: chips, chord shapes and notation

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the two Neon databases — stay in the root `CLAUDE.md`.

- **The song owns key/capo/accidentals/chord-display** — chips on the song itself, not controls
  in the reading panel. A reader's own transposition is separate, in
  `user_song_prefs.semitones`/`.capo`.
- **`shapeFor` picks the default, not the only shape.** Every chord has an alternate-forms
  picker — `ShapeCarousel`, guitar *and* ukulele — reached from `ChordPopup` in a song and
  from a box on either public chart. Only the song half remembers anything: on the chart there
  is no account and nothing is saved, which is the difference the pages' prose sells. Three
  things a change must not get wrong: `user_song_prefs.chord_shapes` is `jsonb` keyed
  `${instrument}:${root}:${family}` and valued with the **chosen shape's fingering text**
  (`'320003'`) rather than an index into the candidate list, so reordering the shape search can
  never silently repoint somebody's saved choice; **a missing key means "default"**, never an
  explicit value for "first candidate"; and the form binds to the chord **as it currently
  appears** — root and family after any shift — not to the token in the source.
- **For chord shapes a Strum Together guest follows the capo rule, not the key rule**: their
  own choice stands, where the key is forced by the leader.
- **Two public pages publish this whole table at once** — `/tools/guitar-chords` and
  `/tools/ukulele-chords`, from `chordLibrary.ts`. Four consequences for anything changed
  here. The chart draws `shapesFor`'s whole list — the first entry in the grid, the rest
  behind the box — so retuning the search or the ordering changes two hundred boxes on a page
  a search engine has indexed *and* the count each card states about itself. Both pages also
  state their total in prose, from `shapeCount()` rather than a written-down number, for the
  same reason. `chordLibrary`'s test asserts its published family list is **exactly**
  `FAMILIES`' keys, so a family added here fails the suite until it is given a name in words
  there. And the pages are server components on purpose: a full ukulele library is 216
  searches of ~13k fingerings, free at build time and a fifth of a second of blocked main
  thread in a browser — which is also why `ShapeCarousel` keys its slides by index and not by
  `fingeringText`, since importing that one function would ship the whole of `shapes.ts` to
  two static documents that never call it.
- **German and Nashville notation are output-only** and belong to the reader, not the song.
  German `[B]` is the international `Bb`, so letting it into parsing would make one token mean
  two different chords with nothing in the file to disambiguate — `readRoots` stays on Italian
  and international deliberately.
