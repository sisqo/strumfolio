/**
 * What an AI assistant is told about this app's ChordPro before it writes any — the
 * `strumfolio://guide/chordpro` resource and the server's `instructions`.
 *
 * Its own text rather than a render of `components/ChordProGuide.tsx`, which is a page for
 * people and is JSX. **The two must agree**: a construct documented or retired there is added
 * or removed here in the same commit (root `CLAUDE.md`, the parsers' fan-out list).
 */

export const SERVER_INSTRUCTIONS = `Strumfolio holds one musician's songbooks: songbooks contain sections, sections contain songs, and every song is a ChordPro text.

Before writing a song, read the resource strumfolio://guide/chordpro once.

Edit by reading with get_song, then sending the whole new text to update_song with the version you read. If the song changed in the meantime, update_song refuses: read it again and redo the edit on the new text. Never try to delete anything: this server cannot, by design. Every AI edit keeps the previous text, and the owner can restore it from the app.

Keep the owner's text as it is except where asked to change it: same line breaks, same directives, same spelling of chords. Title and artist are fields of their own, passed as arguments.`

export const CHORDPRO_GUIDE = `# ChordPro as Strumfolio reads it

A song is plain text. Chords sit in square brackets right before the syllable they fall on:

    [G]Amazing [G7]grace, how [C]sweet the [G]sound

## Fields that are NOT in the text

\`title\`, \`artist\`, the songbook and the section are the song's own fields. Pass title and artist as arguments to create_song / update_song, and do not write {title:}, {t:}, {artist:}, {songbook:} or {division:} lines into the text: the app reads those from the fields, and such a line is treated as a leftover.

## Sections

    {start_of_verse: Verse 1}      … {end_of_verse}      (short: {sov} {eov})
    {start_of_chorus}              … {end_of_chorus}     (short: {soc} {eoc})
    {start_of_bridge: Bridge}      … {end_of_bridge}
    {start_of_tab}                 … {end_of_tab}        (monospaced, chords not parsed)
    {start_of_grid}                … {end_of_grid}
    {chorus}                       repeats the last chorus; {chorus: Final} repeats it under that label

A label may also be written label="Verse 1".

## Comments

    {comment: Capo on the 2nd fret}    ({c:})
    {comment_italic: softly}           ({ci:})
    {comment_box: Palm mute}           ({cb:} with words)
    {highlight: Key change}

## Song data, kept in the text

    {key: G}  {capo: 2}  {tempo: 96}  {time: 3/4}  {transpose: 2}
    {tag: christmas}  (one per tag, repeatable)
    {album:} {composer:} {lyricist:} {arranger:} {year:} {copyright:} {ccli:} {duration: 268}

- {capo} and a {transpose} before the first line of words set the reader's starting controls; the reader can override them.
- A {transpose: 2} written later in the song is a modulation from that point on (values add up; an empty {transpose} returns to the previous value).
- {key} is what the song declares. It never transposes anything: to move a song to another key, rewrite the chords.
- {define: Am base-fret 1 frets x 0 2 2 1 0} gives this song its own fingering for a chord.

## Other things the app keeps as they are

Typesetting directives ({columns}, {new_page}, {textfont}…) are kept and ignored. A line ending with \\ continues on the next line. Conditional directives such as {comment-guitar: …} apply to one instrument; {comment-!guitar: …} to every other one.

## Transposing by hand

Rewrite every chord, including slash basses ([D/F#] → [E/G#]), and keep the owner's choice of sharps or flats unless asked otherwise. Update {key} if the song declares one, and leave {capo} alone unless asked.`
