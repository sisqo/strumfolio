# Import (`/songbooks/[slug]/add`)

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the two Neon databases — stay in the root `CLAUDE.md`.

- **Fifteen extensions in the picker**, listed in `ACCEPTED` (`src/components/AddSongScreen.tsx`)
  — plain text, the ChordPro dialects, OnSong, MusicXML, ZIP, a SongbookPro backup, and — since
  2026-09-07 — **PDF and Word**. `detectSource` opens a few more that the picker does not offer
  (`.docm`, `.text`, `.lyrics`, `.opensong`, `.openlyrics`): aliases that work when dropped, and
  would only lengthen a list whose job is to grey out the wrong files. Parsing happens **in the browser**, one `await import()` per
  format, so an unused format costs nothing. No AI anywhere. Inside a `.zip` those two are
  still counted as skipped rather than read: `readArchive` is synchronous and only takes text.
- **A PDF's songs divide by title if it has titles, and by page if it does not**
  (`layoutPages`, `formats/pdf.ts`). A page that opens with a line set larger than the body
  text starts a song — so a song running over two pages stays whole, because its second page
  opens in body text. A file with no such line anywhere falls back to one song per page, which
  is the form-feed rule `split.ts` already reads. Both halves are guesses and the preview is
  what makes them affordable. A scan is refused in words rather than shown as an empty song.
- **The PDF engine runs on the main thread, and is deliberately not precached.** `pdfjs-dist`
  is imported *with* its worker module rather than spawning a `Worker` — `globalThis.pdfjsWorker`
  is pdfjs' own supported path — which costs 68–129 ms of blocked UI on an 80-page book (5–24 ms
  on ordinary charts) and buys a build with no `new Worker(new URL(…))` in it. `next.config.ts`
  then keeps its chunks out of the precache manifest by matching their **content**: 1.67 MB of
  the 4.81 MB a fresh install downloads. A `splitChunks` cacheGroup with a name of our own was
  tried first — it registers and changes nothing, so don't re-derive that.
- **In Word, a paragraph is a line and spaces are never trimmed** — the leading spaces *are*
  the chord alignment, and `xml:space="preserve"` is a hint, never a condition. An explicit page
  break cuts a song; `<w:lastRenderedPageBreak/>` must not, since it lands mid-sentence. A
  `<w:tab/>` comes across as a tab and lands on `convert.ts`' four-space stops, so a
  tab-aligned chart arrives roughly, not exactly, aligned. Word's older `.doc` is refused with
  advice, like OnSong's backup: it is the file somebody with songs «in Word» is likeliest to hold.
- **Archives flatten: folders become sections, never new songbooks.**
- **The plan cap is checked before anything is written**, and import itself is free.
- **`estimateKey` (`src/lib/music/key.ts`) always wins** over an imported key column, which is
  archival only.
- **`sniffDialect` (`src/lib/import/dialect.ts`) reads the content, not the extension**, and
  genuinely ambiguous files are skipped rather than guessed.
