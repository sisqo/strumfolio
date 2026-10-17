# Import (`/songbooks/[slug]/add`)

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the three Neon databases — stay in the root `CLAUDE.md`.

- **Fifteen extensions in the picker**, listed in `ACCEPTED` (`src/components/AddSongScreen.tsx`)
  — plain text, the ChordPro dialects, OnSong, OpenSong and OpenLyrics (`.xml`, told apart by
  `xmlFlavour` in `detect.ts`; MusicXML is not read and comes back «unknown»), ZIP, a SongbookPro
  backup, and **PDF and Word** (since 2026-09-07). `detectSource` opens a few more that the picker does not offer
  (`.docm`, `.text`, `.lyrics`, `.opensong`, `.openlyrics`): aliases that work when dropped, and
  would only lengthen a list whose job is to grey out the wrong files. Parsing happens **in the browser**, one `await import()` per
  format, so an unused format costs nothing. No AI anywhere. Inside a `.zip` only text and XML
  entries are read: PDF, Word and SongbookPro are counted as skipped, since `readArchive` is
  synchronous and only takes text.
- **Text is decoded by `decodeSongBytes`** (`decode.ts`, 2026-10-16), not `file.text()`: a BOM
  decides, then UTF-8 if the bytes are valid, then Windows-1252, and NUL is dropped. Plain
  files and the text inside a `.zip` go through it; Word and SongbookPro are UTF-8 by format.
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
  `<w:tab/>` comes across as a tab, which `convert.ts` replaces with exactly four spaces (no
  stops), so a tab-aligned chart arrives roughly, not exactly, aligned. A paragraph's tab-stop
  *definitions* (`<w:tabs>`) are not tabs and are ignored (2026-10-17): counting them pushed each
  line four columns per defined stop. Word's older `.doc` is refused with
  advice, like OnSong's backup: it is the file somebody with songs «in Word» is likeliest to hold.
- **Archives flatten: folders become sections, never new songbooks.**
- **The plan cap is checked before anything is written**, and import itself is free.
- **A declared `{key}` wins, and `estimateKey` (`src/lib/music/key.ts`) is the fallback**
  (`tonicOf`, 2026-09-19) — for a song that declares none, and for a key this app cannot read
  (`{key: H}`), which falls back to the estimate and never to C.
- **`sniffDialect` (`src/lib/import/dialect.ts`) reads the content, not the extension**, and
  genuinely ambiguous files are skipped rather than guessed.
- **A rule (`---`, `===`…) cuts songs only in text with no ChordPro song marks** (2026-09-24).
  It is what people type between two pasted songs; a file with `{title}` or `{new_song}` already
  says where each song starts, and this app's export — the restore path — is such a file, so a
  `---` in a body must not split a restored song in two. A chunk with a title is a song even with
  no words, verbatim blocks are skipped labelled or not (`{start_of_tab: Intro}`, `{sot-guitar}`,
  grids, delegated environments), and `METADATA_DIRECTIVE`/`TITLE` match a value holding a brace.
