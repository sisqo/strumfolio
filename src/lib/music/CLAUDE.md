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
- **German and Nashville notation are output-only** and belong to the reader, not the song.
  German `[B]` is the international `Bb`, so letting it into parsing would make one token mean
  two different chords with nothing in the file to disambiguate — `readRoots` stays on Italian
  and international deliberately.
