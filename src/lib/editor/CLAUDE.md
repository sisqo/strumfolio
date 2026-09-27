# ChordPro: the two parsers, the song-data form, and conformance

Loaded when working under `src/lib/editor/`. The root `CLAUDE.md` keeps the five rules that
apply wherever ChordPro is touched — two parsers, one commit, the fan-out, the corpus invariant
and `KEPT_IN_BODY` — and this file holds everything else. **Read it before changing
`src/lib/chordpro.ts`, `src/lib/directiveLine.ts`, `src/lib/import/deduce.ts` or
`components/editor/SongDataForm.tsx`**, none of which lives in this directory.

`src/lib/chordpro.ts` is the **reader** — it throws away what the screen does not need.
`src/lib/editor/document.ts` is the **editor's**, one block per source line, holding
`toSource(fromSource(x)) === x` byte for byte so saving never rewrites somebody's file.
A construct taught to one and not the other does not fail: the editor turns it into an
opaque chip, or worse reads it as lyrics and offers its `[` as a chord. **Teach both, in
the same commit**, and note the fan-out — `SongSheet.tsx` (screen), `booklet/layout.ts`
plus `booklet/document.tsx` (PDF), `import/deduce.ts`'s `METADATA_DIRECTIVE` (what is
stripped), `import/export.ts` (what is written), `editor/songData.ts` (which fields the
song-data form owns), and `components/ChordProGuide.tsx`, which is the page that documents
all of it.

**`toSource(fromSource(x)) === x` includes the separator, since 2026-09-20.** A `comment`,
a `boundary` and a tab's opening line each carry `raw` — the line as the file wrote it —
and hand it back until somebody edits that line, at which point `setLineText` drops `raw`
and the canonical `{name: value}` is written instead. Keep what was written, normalise what
was typed. Before that the three were always re-emitted canonically, so `{c:forte}` and
`{comment Repeat ad lib}` — both legal, neither ours — were rewritten the moment anybody
opened the song and pressed Save. One file in the corpus (`content/` plus the reference files) did it, on three lines,
and no fixture had caught it: **run the invariant over `content/` and the reference files,
not over a hand-written string.**

The format reference is the [cheat
sheet](https://www.chordpro.org/chordpro/chordpro-cheat_sheet/), and compliance was
brought up to it on 2026-09-19.

**The rule that governs the import path: understood must never mean deleted.**
`isDroppedDialectDirective` removes any directive it recognises, on the assumption that a
column is taking the value. For `key`, `copyright`, `ccli`, `duration`, `capo` and
`subtitle` no column takes it, so that line was the only copy anybody had and the importer
deleted it — a songbook app deleting a copyright line being the case that makes the shape
obvious. `KEPT_IN_BODY` (`import/deduce.ts`) is now the whole answer to «what does the
importer keep»: **a `Field` with no column belongs in it**, and nothing but that list
connects the two facts.

**Dropping a column is therefore a change to that list, and forgetting it is silent.**
`0050` dropped `songs.tags` and left `tags` out of `KEPT_IN_BODY` for a day: `{keywords: …}`
and `{topic: …}` map to that field in the dialects that mean tags by them, so what had been
a correct strip — read the line, fill the column, drop the line — became a deletion with
nothing catching the value. `{tag:}` itself was never at risk, since no dialect claims that
name, which is exactly why testing the field this app writes would have missed it. Measured
and fixed on 2026-09-20; zero stored songs carried either directive, so nothing was lost.
The general rule: **`db:migrate` dropping a column and `KEPT_IN_BODY` gaining its field are
one change**, and the second half has no compiler behind it.

**OnSong's `Name: Value` block is the same rule from a third door** (2026-09-22). `deduce`
removes the block whole, so until then only the four fields a column takes survived it — `Key`,
`Capo`, `Tempo`, `Time`, `Copyright`, `CCLI`, `Keywords` and the rest were read and deleted with it. They
are written back at the top of the body as directives (`METATAG_DIRECTIVE`, one `{tag}` per
keyword); OnSong's own mechanics (`Number`, `Flow`, `MIDI`…) have no spelling here and still go.

**Where each field lives**, since «handled» means four different things here:

**All of it is edited in one form since 2026-09-20** — `SongDataForm`, in the editor's «Song
data» drawer, from the `Edit Song v2.dc.html` handoff. The head used to be drawn line by line
above the words, so a well-described file put a dozen chips between a musician and the first
verse. Five things about that form are load-bearing and none is obvious from looking at it:

- **It is a view over the blocks, never a second copy.** Each row carries the index of the
  block it came from and editing it is `setLineText` on that block. Nothing rebuilds or
  reorders the head, which is what keeps an untouched file byte-identical and a reader's
  notes on the lines they were left on. `songData.test.ts` asserts it directly — **one field,
  one line** — because a round-trip test passes just as well against a form that re-emits the
  whole head in its own order.
- **A field is found wherever it sits and is not moved there.** A `{capo: 2}` written below
  the words shows in the form and edits that line where it stands. What decides «head» is
  position and not name (`headEnd`: everything before the first block that draws something),
  and that only decides two things — where a *new* field is written, and which unrecognised
  directives are metadata rather than layout. A `{column_break}` mid-song is positional, so it
  keeps its row in the editor; an unknown directive in the head is metadata, so it lands in
  «Anything else» under its own name.
- **`tag` and `define` are repeat groups**, with N rows and their own add and remove. Both
  directives are singular and repeatable and a single input would have kept the first and
  destroyed the rest — the bug the reader had until `{tag:}` was fixed the same week.
- **A field is drawn because its line exists, not because it has a value** (2026-09-21). The
  form used to draw every field it knows, which put nineteen inputs on an ordinary song with
  fifteen of them empty; now the empty ones live behind «Add a field» in the foot, and an
  ordinary song shows five or six. The test is the *line* and never the value, and that is
  the whole of it: a field whose value is empty but whose line exists stays on screen, or
  clearing a value to retype it would take the field away under the caret — and with
  `DraftInput` holding the typed draft the rule would have had to become «has a value, or
  has the focus», an «or» in the one sentence that has to be simple. A group with no rows is
  not drawn at all, heading included. Consequences worth knowing:
  - **`addSongField` is the only door in**, and `setSongField` no longer creates anything:
    every row has a block because every row is a line.
  - **Adding focuses what it added.** The block index is the row's id and the row exists
    only after the next render, so the focus waits on the source coming back through the
    props. Forget it and the menu writes a field somebody then has to scroll to find — the
    same gap the toolbar's own menu had the day before.
  - **Songbook, section, title and artist are exempt and are not in the menu** (`SongDataForm`;
    its `COLUMNS` holds title and artist). They are columns rather than directives and the first three always hold
    a value, so offering to add one would be offering something already there.
  - **The menu takes a name nobody here knows**, which is what makes «a field this app has no
    name for keeps its own» true: until then a private directive could only arrive by
    importing a file. `isFieldName` refuses a conditional and anything that is not a name
    rather than correcting it — `{album-guitar}` is a legal directive and an impossible
    *field*, since the form draws one row for the whole song. **The shape is not enough, and
    `typedField` is the whole answer** (2026-09-22): a column (`title`, `t`, `songbook`…) or
    anything with a place in the song (`comment`, `start_of_chorus`, the toolbar's own list)
    is refused, because it would be written, drawn nowhere and — for a column — stripped at
    save; a name the song already carries goes to its line instead of writing a second one.
  - **A single field written twice is one row, the first** — the line the reader takes. The
    refactor that made rows depend on lines drew every occurrence for a day, so a file with
    two `{key}` lines showed two Key inputs, one of them editing a line nobody reads.
- **The toolbar's own «Field» menu keeps only structure and printing** (2026-09-21). Those
  directives have a *place* in the song, which is why they are dropped where the caret is; a
  `{key: …}` between two verses is the same field the form shows at the top, so offering it
  in both was offering one act in two places, one of which wrote it where nobody would look.
  `FIELD_GROUPS` divided exactly on that line already, so the menu shortened without being
  reorganised.

One trap that cost a round trip to find: **a value round-trips through `{name: value}` and the
parse trims**, so a controlled input fed from the document loses a trailing space and «Disco di
prova» arrives as «Discodiprova». `DraftInput` holds what was typed while the field has focus,
and only while the two still agree once trimmed, so Undo and the Source tab still win. It is
used by the form *and* by the editor's directive rows, which had the same bug.

| Kind | Fields | Where |
|---|---|---|
| Column, stripped from the body, rewritten on export | `title` `artist` `songbook` `division` | `songs.*` |
| Body, reread every time the song opens | `tempo` `time` `capo` `transpose` `key` `tag` `define` | no column, by decision |
| Body, shown and never acted on | `album` `composer` `lyricist` `arranger` `year` `copyright` `duration` `ccli` `sorttitle` `sortartist` `subtitle` | `ParsedSong.metadata`, printed by the info panel |
| Body, kept and never shown to a reader | the ~30 typesetting directives | editor only, graphic and raw |

- **`{key}` beats `estimateKey`**, reversing what `import/CLAUDE.md` calls «archival only».
  The estimate is a guess and is weakest exactly where a file bothers to declare one. A key
  this app cannot read (`{key: H}`, German) falls back to the estimate and never to zero.
- **`{subtitle}`/`{st}` is decided by `sniffDialect`**, not by the reader: the artist in an
  OnSong file and consumed into that column, a subtitle everywhere else. Measured first — of
  223 stored songs 37 carry a `{subtitle:}` and **all 37 hold what their artist column
  holds**, which is why `songInfoRows` refuses to print a subtitle that only repeats the
  artist.
- **Everything a drawn line does that the source does not say is decided at render, never at
  parse**, and there are now three of them: `%{…}` substitution, a `{chorus}` repeat, and a
  conditional's selector. `parseChordPro` stays a pure function of the text, which is what
  lets one file mean one thing while two readers see two — and what keeps the notes
  resolvable, since they are found by the identity of the lines that remain.
- **Notes are anchored by line identity, not by counting.** `buildAnchorMap` returns a
  `Map<Line, …>` and takes **the caller's own sections**, because an identity-keyed map is
  useless to a caller holding different objects — parsing a second time inside made every
  lookup miss, silently, and the test that walks `content/` is what caught it. Each lyrics
  line records the source lines it was built from (`sourceLines`), which is how a joined line
  resolves into two blocks and a repeated stanza resolves into none. **This is what made
  `{chorus}` repeat and `\` continue possible at all**; before it, either one shifted every
  note below itself onto the wrong row.
- **`{define}`/`{chord}` win over the built-in library for that song**, and lose to a shape
  the reader chose by hand. The file's fingering goes to the *front* of the candidate list
  rather than replacing it, so it is the default and still sits beside the table's voicings in
  the alternates picker. Matched on the chord as currently **shown**: a file's C fingering is
  not a D, so transposing correctly stops using it. And on the **instrument, by string count**
  (2026-09-24): a `{define}` names none, so six frets is a guitar's and four a ukulele's —
  before that a ukulele reader's default was a six-string diagram.
- **The editor's «add field» menu offers only what lives in the body.** A `{title:}` typed
  into the body is stripped at the next save, so offering it would be offering something that
  quietly disappears; `fields.test.ts` checks every entry against `METADATA_DIRECTIVE`.
- **`%{…}` is resolved at render and never at parse**, both forms. A placeholder swapped for
  a value of a different length at parse time would slide every comment anchored below it,
  and the file has to keep what its writer typed for the export to hand it back.
  `parseLyricLine` therefore keeps a placeholder *whole* through word splitting — the
  conditional form contains a space, and a split one could never be put together again.
- **A conditional's `!` lives in the directive-name matcher, which used to exist twice.** The
  negated form (`{comment-!guitar}`, «everybody except») was unreachable until 2026-09-20:
  `selectorMatches` had implemented and tested negation from the start, but neither parser's
  name charset admitted `!`, so the line matched no directive and was drawn as **lyrics** —
  the `{comment Repeat ad lib}` failure again, from the other end. Both halves were correct
  in isolation, which is why no unit test found it and why the check that did was parsing a
  file that used every construct the guide documents. `!` is admitted only *after* a dash, so
  a bare `{!foo}` is still words. **There is one copy since 2026-09-24** —
  `matchDirective` (`lib/directiveLine.ts`), read by both parsers — because a name only one
  accepts is a line the reader draws as a directive and the editor offers as lyrics with its
  `[` live. It is a scan and not a regular expression: the old one had four whitespace
  quantifiers over the same spaces, so a line opening `{` with a long run of spaces and no
  closing brace took 5 s at 400 spaces and 83 s at 800, hanging the server's home screen
  (which parses every song) and freezing reader, editor and import preview.
  `directiveLine.test.ts` checks it against the old expression on short random lines. The editor keeps a conditional whole as
  an opaque `directive` block rather than as `comment`/`boundary`, which is deliberate — it
  never takes the selector apart, so it cannot lose it.
- **The four comment spellings are four values in the parse and three looks on screen.**
  `plain` and `italic` coincide because this app's comment style *is* muted italic; `box` and
  `highlight` asked for a frame and now get one. Every comment this app generates — a section
  label, `{chorus}`, a tab's name — is `plain`.

**Conformance was checked against the reference implementation on 2026-09-23**, not against
the website alone: the ChordPro repository (`lib/ChordPro/Song.pm`'s directive and abbreviation
tables, `res/config/chordpro.json`'s metadata keys and delegates, `docs/content/*.md`) was read
and every directive and syntax form in it probed through the reader, the editor round trip, the
importer and this guide. The documentation contradicts itself in places and the code decides.
What that changed, each held by a test in `chordpro.test.ts` («ChordPro conformance»):

- **`cb` is `comment_box` when it has words, and a column break when bare.** `Song.pm` maps
  `cb` → `comment_box` and `colb` → `column_break`; `Directives-column_break.md` also claims
  `cb`. This app had taken the column-break reading, so `{cb: Palm mute}` vanished from the
  screen. Both parsers make the same cut (`COMMENT_STYLE`, `COMMENT_NAMES`).
- **Labels take the attribute spelling** the spec recommends — `{start_of_verse:
  label="Verse 1"}`, `{chorus: label="Final"}` — and `\n` inside one breaks the line
  (`readLabel`). The attribute form used to be printed as it stood.
- **`{chorus: Final}` repeats the last chorus under that label** (`Directives-chorus.md`). A
  label naming a chorus this app has seen still picks that one; one that names none used to
  print the word and repeat nothing.
- **`arranger` is standard metadata** (in the reference's `metadata.keys`), and `composer`,
  `lyricist`, `arranger` keep every value, joined with `; ` as the reference does
  (`MULTI_VALUED`); the song-data form draws each line (`MULTI_FIELDS`). **Every other
  single-valued item takes the first occurrence**, `key`/`time`/`tempo`/`capo` included — the
  spec says each «applies from where it was specified», so the song's own is the one it opens
  with. **`{transpose}` has its own rule**, below.
- **`{transpose}` modulates from where it appears** — decided with the owner on 2026-09-23 after
  the conformance pass, question by question, and every answer is a decision, not a default:
  - **values add up and an empty one restores the one before**, the reference's stack
    (`Song.pm`'s `dir_transpose`);
  - **the total in force at the first line of words is the starting transposition**
    (`song.transpose`), the value a reader's own choice *replaces* (`resolvedSemitones`,
    unchanged); a song whose `{transpose}` only comes later has none;
  - **every later change is a modulation, carried on the lines below it** (`Line.shift`), and
    **the reader's choice never removes one** — a last chorus a tone up stays a tone up in
    whatever key it is read;
  - **the sheet announces it** with a line the parser writes (`keyChange` on a comment),
    naming the arrival key when `{key}` is declared, on screen and in the booklet;
  - **a `{chorus}` after it repeats at the pitch in force where it stands** (`repeated`), and a
    modulation written *inside* the chorus repeats with it, relative to that pitch
    (`repeatedLines`, 2026-09-23 — the «Key change» line was repeated and the chords after it
    were not), and the return to the pitch in force when the repeat ends is announced too
    (2026-09-24 — otherwise the next verse dropped a tone without warning);
  - **a starting total past an octave is folded, not clamped** (+15 is +3): clamping it while
    later modulations were measured from 15 bent each of them; and a bare `{transpose}` with
    nothing to restore says nothing (`null`, not 0);
  - **the song's key shown at the top is the opening one**; Nashville numbers follow the
    modulation (the line's tonic moves by `shift` too), so a stepped-up chorus reads 1-4-5;
  - **`chordTokens` lists the chords played** past a modulation, shifted; `chordTokens(song,
    false)` gives the written ones, which is what estimating the opening key uses;
  - **`2s`/`2f` are read for the number and the letter is dropped**: sharps or flats stay the
    reader's own preference (`GlobalPrefs.accidentals`, v4.1), the owner's answer;
  - **the song-data form owns only a starting `{transpose}`** (`HEAD_ONLY`) — «starting» by
    the reader's rule, up to the first line of words, and not `headEnd`'s, which stops at a
    comment or a `{soc}` — and draws every one, since they add up; the toolbar's Structure menu
    offers «Key change» at the caret.
  Strum Together needs nothing of its own: it broadcasts the starting transposition and renders
  through `SongSheet`. Measured before deciding: one production song of 225 uses `{transpose}`,
  never twice.
- **The delegated environments** (`abc`, `ly`, `svg`, `textblock`, `strum`) are verbatim
  blocks closed only by their own `{end_of_…}` — `variant: 'delegate'` in both parsers — folded
  on screen under the language's name, and left out of the printed booklet except `textblock`
  (`printsVerbatim`). `{start_of_grille}` is a grid.
- **Markup is drawn, never printed as tags** (`lib/markup.ts`): the part's `text` is plain
  and its style rides in `runs`, so width, search, the booklet and the anchors see no tags; the
  anchor walker skips tags and counts `\uXXXX` as one drawn character. Only the tags the format
  defines are markup — `a < b` stays text.
- **`\uXXXX`** is the character it names, in lyrics and directive values.
- **`{duration: 268}` is shown as `4:28`** (`readableDuration`), as the spec requires.
- **The song-data form reads `{meta: composer X}` as the Composer field** and keeps a meta line
  a meta line when edited (`fieldParts`). **`meta` carries metadata and never structure** (`META_NAMES`, 2026-09-25):
  `{meta: soc x}` or `{meta: start_of_tab x}` opened a block in the reader only, since the editor
  keeps any meta line as one directive; a comment, a section or a block through `meta` is ignored.
  `transpose` and `define` still pass, because the form reads them through `meta` too.

What is deliberately **not** followed, each argued where it lives rather than here:

- **`{st}`/`{subtitle}` is the artist**, which is OnSong's convention and not the
  specification's — `import/dialect.ts` has the argument. Moving it would change how every
  already-importable file imports.
- **`{songbook}`, `{division}` and `{link1..3}` are written unprefixed**, where a strict
  reading spells a private directive `{x_…}`. The `{x_}` forms are *read* since the same
  date, so a file from a stricter tool is understood; what the export writes is unchanged,
  because the export is also this repo's restore path.
- **The typesetting directives are ignored** — `{textfont}`, `{columns}`, `{new_page}`,
  `{image}` and the rest — but **not `{define}`**, which was on this list until 2026-09-20 and
  now feeds the shapes. This app lays a song out for a phone on a stand and has no page to
  break. Ignored is not lost: the editor keeps them verbatim.
- **`{chorus}` replays the stanza, and the repeated lines carry no `sourceLines`.** That is
  what made it safe: a line with no source resolves to no anchors, so a reader's note stays on
  the stanza they put it on instead of being duplicated onto the repeat. It reads the last
  chorus seen, or a named one (`{start_of_chorus: Final}` … `{chorus: Final}`), repeats the last
  one under the label when the name matches none, and falls back to printing the word where a
  file references a chorus it never opened. Until 2026-09-19 it
  printed the reference, and the reason was exactly this anchoring problem.
- **Line continuation and `{chorus}` both work now**, and neither could before the anchor map
  stopped counting — see the identity bullet above. **A line opening with `{` never continues**
  (2026-09-25): the editor never joins, so `{c: a \` + `b}` would be a comment to the reader and
  two lines of words to the editor; its `\` stays a character. `chordpro.test.ts`'s «the reader and the editor agree» is still the cheapest check that a new
  construct is safe — compared line by line since 2026-09-23: it used to compare a count taken
  from `buildAnchorMap`, which has one entry per reader line whatever the editor did, so it could
  not fail.

- **`{capo}` and `{transpose}` seed the controls, and the reader overrides them** (for
  `{transpose}`, only the starting one since 2026-09-23 — a later one is a modulation the reader
  never overrides; see the `{transpose}` rule above) — settled by
  `0048`, which made `user_song_prefs.capo` and `.semitones` nullable so `null` can mean «I take
  the song's», exactly as `SongPrefs.bpm` already worked. That distinction is the whole
  mechanism and the reason a migration was unavoidable: under `NOT NULL DEFAULT 0` the column
  spelled «no capo» and «never chose» with one value, so applying the file's fret wherever it
  read 0 would have put a capo back on somebody who had taken it off. `resolve.ts` holds the
  answer (`resolvedCapo`, `resolvedSemitones`) in one pure module because the reading screen,
  the booklet and Strum Together must not each arrive at their own. `canTakeSongValue`, meant to
  decide whether a «back to the song's own» control has anywhere to go, is defined there and
  **not wired to anything yet**. Applied to all three databases on 2026-09-20. Measured before
  deciding: of 223 stored songs **zero** declare `{capo:}` and zero declare `{key:}`, so both
  directives only ever arrive on an imported file.
- **`{key}` seeds nothing, and that is not a gap.** `estimateKey` derives the key from the
  chords, which are present and say it; a reader's `semitones` is a shift *relative to what
  is written*, which is exactly what `{key}` declares, so seeding from it would transpose the
  song away from itself. The importer keeps it in the body (`KEPT_IN_BODY`) and the info panel
  shows it; it is only never used to set `semitones`.

That leaves nothing on the cheat sheet unanswered. The last open question — whether
`{define}`/`{chord}` diagrams should feed the chord library — was decided on 2026-09-20 and is
the `{define}` bullet above: the file's fingering goes to the front of the candidate list, and
`readDefinition` requires the `frets` keyword, so a bare list of numbers is not a definition.
