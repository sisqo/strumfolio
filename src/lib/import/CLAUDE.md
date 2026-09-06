# Import (`/songbooks/[slug]/add`)

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the two Neon databases — stay in the root `CLAUDE.md`.

- **Thirteen extensions**, all listed in `ACCEPTED` (`src/components/AddSongScreen.tsx`) —
  plain text, the ChordPro dialects, OnSong, MusicXML, ZIP and a SongbookPro backup. Parsing
  happens **in the browser**, one `await import()` per format, so an unused format costs
  nothing. No AI anywhere. **PDF and Word were designed and never built** — don't read the
  `.zip`/`.xml` support as covering them.
- **Archives flatten: folders become sections, never new songbooks.**
- **The plan cap is checked before anything is written**, and import itself is free.
- **`estimateKey` (`src/lib/music/key.ts`) always wins** over an imported key column, which is
  archival only.
- **`sniffDialect` (`src/lib/import/dialect.ts`) reads the content, not the extension**, and
  genuinely ambiguous files are skipped rather than guessed.
