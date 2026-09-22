# The booklet prints for a room, except when the reader asks otherwise

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the two Neon databases — stay in the root `CLAUDE.md`.

`/booklet` typesets each song in its **written** key by default, because a booklet is meant to
be printed and handed to other people, where somebody else's capo means nothing. «Written»
includes what the file itself declares: a `{capo}` or `{transpose}` in the song is applied with
the checkbox off too (`resolvedCapo`/`resolvedSemitones` in `document.tsx`, the root `CLAUDE.md`'s
«print follows screen»), because it is the song's, not the reader's. A reader can
override with their own key and capo, and the rules are narrow on purpose:

- **Asked at every download and never persisted** — a checkbox above "Download PDF", not a
  modal on click and not a second button.
- **Every song printed that way says so on its own page**, same text and logic as
  `TransposeNote` on screen, and only when capo or semitones ≠ 0.
- **Preferences are read for the email actually signed in, never `accountOwnerEmail`** — the
  two differ precisely while a global owner is viewing as somebody else.
- The public FAQ on `/` (`app/(home)/Landing.tsx`, «Printing a booklet») states this behaviour
  in full. Change one and the other is wrong.
