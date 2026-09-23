'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'

import { IconCheck, IconCopy } from '@/components/icons'

/**
 * The full ChordPro dialect this app reads and writes, in one page.
 *
 * Written for two readers at once: someone converting their own collection by hand,
 * and an AI they hand this page to instead — "paste this whole page, plus your
 * lyrics and chords, and convert them" is the actual use case the copy button
 * exists for. That's also why every rule here is stated as a rule, not just shown
 * in a worked example: an example alone is something a model pattern-matches
 * loosely, a stated rule is something it can follow exactly.
 *
 * `innerText` off the article itself, not a separate plain-text copy of the
 * content: two sources of truth for the same page would drift the moment one of
 * them is edited without the other.
 */
export function ChordProGuide() {
  const articleRef = useRef<HTMLElement>(null)
  const [copied, setCopied] = useState(false)

  const copyGuide = async () => {
    const text = articleRef.current?.innerText
    if (text === undefined) return

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* Clipboard access can be refused; the page is still there to select and copy by hand. */
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Converting your own collection? Copy this whole page and hand it to an AI along with your
          lyrics and chords, and ask it to convert them following these rules.
        </p>
        <button type="button" className="btn btn-sm flex-none" onClick={() => void copyGuide()}>
          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          {copied ? 'Copied' : 'Copy this page'}
        </button>
      </div>

      <article className="legal-content" ref={articleRef}>
        <h1>ChordPro format</h1>
        <p className="legal-updated">
          Every directive Strumfolio reads and writes, and the two edge cases worth knowing about.
        </p>
        <p>
          ChordPro is not ours — it is a plain-text format from 1992 that a great many programs
          read, which is the reason a repertoire kept in it outlives the app it was typed into.
          The format itself is specified at{' '}
          <a href="https://www.chordpro.org/chordpro/chordpro-cheat_sheet/" target="_blank" rel="noopener noreferrer">
            www.chordpro.org/chordpro/chordpro-cheat_sheet/
          </a>{' '}
          — a cheat sheet that is one page and covers the lot. (The address is written out
          because this page is meant to be copied: a link that becomes bare text still has to
          say where it went.) This page is the same ground from
          Strumfolio&apos;s side: what it does with each directive, and the handful of places
          where an app has to decide something the format leaves open.{' '}
          <Link href="/blog/chordpro-explained">Where the format came from</Link> is a separate
          read.
        </p>

        <h2>The shape of a song</h2>
        <p>A chord sits in square brackets immediately before the syllable it belongs to. Everything else is lyrics, read exactly as typed.</p>
        <pre className="code-block">{`{title: Amazing Grace}
{artist: Traditional (John Newton, 1779)}
{tag: hymn}
{tag: gospel}

[G]Amazing [G7]grace, how [C]sweet the [G]sound,
That [G]saved a [Em]wretch like [D]me.

{start_of_chorus}
[G]I once was [G7]lost, but [C]now am [G]found,
Was [Em]blind, but [D]now I [G]see.
{end_of_chorus}`}</pre>

        <h2>Metadata, at the top</h2>
        <p>Directives go first, one per line, in any order:</p>
        <ul>
          <li>
            <strong><code>{'{title: ...}'}</code></strong> — the song&apos;s title. Without one, the
            leading plain lines are read as a heading instead: one line is just the title, two lines
            are title then artist — a directive is always the safer bet.
          </li>
          <li>
            <strong><code>{'{artist: ...}'}</code></strong> — optional.
          </li>
          <li>
            <strong><code>{'{subtitle: ...}'}</code></strong> (or <code>{'{st: ...}'}</code>) — a
            second line under the title, which is what the format says it is. One app in this
            corner, OnSong, redefined it to mean the artist, and files written by that app are
            read its way — Strumfolio works out which program wrote a file before trusting this
            one directive. Write <code>{'{artist: ...}'}</code> when you mean the artist and
            there is nothing to work out.
          </li>
          <li>
            <strong><code>{'{tag: rock}'}</code></strong> — one tag, and the line repeats for
            more of them: <code>{'{tag: rock}'}</code> then <code>{'{tag: live}'}</code>. That is
            the format&apos;s own shape — the directive is singular and says one thing each time.
            A comma-separated <code>{'{tags: rock, live}'}</code> is read too, since plenty of
            files carry it, but the repeated line is what to write. Tags make a song findable:
            searching your songbooks looks at them alongside the title and the artist.
          </li>
          <li>
            <strong><code>{'{songbook: ...}'}</code></strong> and{' '}
            <strong><code>{'{division: ...}'}</code></strong> — where the song is filed on first
            import. Only read once: after the song exists, moving it is done from the app, and
            re-importing the same file won&apos;t move it back. Leave them out and the song lands
            wherever you&apos;re importing into.
          </li>
          <li>
            <strong><code>{'{tempo: 96}'}</code></strong> and{' '}
            <strong><code>{'{time: 3/4}'}</code></strong> — what the metronome starts at when
            somebody opens the song, and how often it accents. <code>{'{bpm: 96}'}</code> means
            the same as the first. Whoever&apos;s reading can set their own tempo from the
            metronome in the reading bar, or from the Tempo chip under the title — it&apos;s
            remembered for them and doesn&apos;t change the song; these two are the song&apos;s
            own answer, used until somebody says otherwise. A tempo written in
            words — <code>{'{tempo: allegro}'}</code> — isn&apos;t read, since there&apos;s no
            number in it to beat.
          </li>
        </ul>
        <p>
          <strong>Not <code>{'{section: ...}'}</code></strong> for the songbook division, even
          though it reads naturally — some ChordPro tools use <code>{'{section: chorus}'}</code> to
          mark a block of the song, and Strumfolio would read it exactly that way: as an attempt to
          file the song into a section literally named &quot;chorus&quot;. Use{' '}
          <code>{'{division: ...}'}</code> instead.
        </p>
        <p>
          <strong><code>{'{meta name value}'}</code></strong> works too, for any of the above:{' '}
          <code>{'{meta artist Traditional}'}</code> is <code>{'{artist: Traditional}'}</code>.
          So does the strict spelling for the two directives that are Strumfolio&apos;s own
          rather than the format&apos;s — <code>{'{x_songbook: ...}'}</code> and{' '}
          <code>{'{x_division: ...}'}</code> — which is what a tool fussy about private
          directives will have written. Strumfolio reads both and writes the short ones. They
          are the only two: everything else on this page is the format&apos;s, so a song that
          leaves here is a song any other ChordPro program can read.
        </p>
        <p>
          <strong>Everything else the format defines is kept and shown</strong> in the
          &quot;About this song&quot; panel, behind a tap beside the artist:{' '}
          <code>{'{album}'}</code>, <code>{'{composer}'}</code>, <code>{'{lyricist}'}</code>,{' '}
          <code>{'{arranger}'}</code>, <code>{'{year}'}</code>, <code>{'{copyright}'}</code>,{' '}
          <code>{'{duration}'}</code>, <code>{'{ccli}'}</code>, <code>{'{subtitle}'}</code> and
          the two sorting keys <code>{'{sorttitle}'}</code> and <code>{'{sortartist}'}</code>.
          Behind a tap because none of them is wanted mid-song, and the words need the room. A
          duration in seconds is shown as minutes — <code>{'{duration: 268}'}</code> reads 4:28.
        </p>
        <p>
          <strong>Composers, lyricists and arrangers may repeat</strong>, one per line, and every
          one is kept: <code>{'{composer: John Lennon}'}</code> then{' '}
          <code>{'{composer: Paul McCartney}'}</code>. Everything else is one value per song, and
          where a file says one twice the first is the song&apos;s — a second{' '}
          <code>{'{key}'}</code>, <code>{'{time}'}</code> or <code>{'{tempo}'}</code> is a change
          partway through, and the song is labelled with the one it opens with. A{' '}
          <code>{'{meta: name value}'}</code> with a name nobody here knows is kept in the file,
          and when it sits in the song&apos;s opening lines the song-data form shows it under its
          own name, in &quot;Anything else&quot;.
        </p>
        <p>
          <strong><code>{'{key: ...}'}</code></strong> is the one that also does something: it
          names the note the Nashville numbers count from. Without it Strumfolio works the key
          out from the chords, which is a good guess and only a guess — so when the song says,
          the song wins. A key written in a notation we don&apos;t read (German{' '}
          <code>H</code>, for instance) falls back to the guess rather than to C.
        </p>
        <p>
          <strong><code>{'{capo: 3}'}</code></strong> and{' '}
          <strong><code>{'{transpose: -2}'}</code></strong> set where the reading starts: the
          capo goes on that fret and the chords move by that many semitones the first time
          somebody opens the song. Both are a starting point and not a verdict — move the capo
          or transpose from the reading bar and your answer is kept for you, on your device,
          without touching the file. The song&apos;s own value is still there to go back to, and
          the control says so.
        </p>
        <p>
          <strong>A <code>{'{transpose}'}</code> after the first words is a key change</strong>,
          from that line down, as the format says — the usual last chorus a tone up is{' '}
          <code>{'{transpose: 2}'}</code> just before it. The sheet prints a line where it
          happens, naming the new key when the song declares one, and a{' '}
          <code>{'{chorus}'}</code> after it repeats the chorus at the new pitch. Values add up
          (<code>{'{transpose: 2}'}</code> then <code>{'{transpose: 1}'}</code> is three), and an
          empty <code>{'{transpose}'}</code> undoes the last one. Your own transposition replaces
          only where the song starts: the key changes inside it stay, so the song keeps its
          shape in whatever key you read it. Nashville numbers follow the change, so a chorus
          stepped up still reads 1-4-5, and the song&apos;s chord list includes the chords
          after it. A trailing <code>s</code> or <code>f</code> (<code>{'{transpose: 2f}'}</code>)
          is read for its number; whether chords are spelt with sharps or flats is your own
          setting. In the editor, the song-data form&apos;s Transpose is the starting one, and{' '}
          <strong>Key change</strong> in the toolbar&apos;s field menu drops one at the caret.
        </p>
        <p>
          <strong><code>{'{define: ...}'}</code></strong> (or{' '}
          <code>{'{chord: ...}'}</code>) draws a fingering, and Strumfolio uses it: a shape the
          file defines becomes the one shown for that chord in this song, ahead of the built-in
          library, and the library&apos;s other voicings stay available beside it. Written the
          format&apos;s way — <code>{'{define: Bm7 base-fret 2 frets 1 3 1 2 1 1}'}</code>, with{' '}
          <code>x</code> for a string you don&apos;t play. <code>base-fret</code> is optional and
          the numbers are read as actual frets without it; the <code>frets</code> keyword is not,
          so a bare list of numbers isn&apos;t read. The fingering is matched on the chord as it
          is currently <em>shown</em>, so transposing a song correctly stops using a shape that
          was drawn for the chord it used to be.
        </p>
        <p>
          Everything that is left is the typesetting a printed songbook needs. Strumfolio lays a
          song out for a phone on a stand and has no page to break, so it reads these and draws
          nothing. <strong>Ignored is not lost</strong>: the editor keeps every one of them
          verbatim, so a file that arrives carrying them leaves carrying them. The whole list:
        </p>
        <ul>
          <li>
            Fonts, sizes and colours, for text, chords, the chorus, the title, tabs, grids,
            labels, the footer and the table of contents —{' '}
            <code>{'{textfont}'}</code> (<code>{'{tf}'}</code>), <code>{'{textsize}'}</code>{' '}
            (<code>{'{ts}'}</code>), <code>{'{textcolour}'}</code>, <code>{'{chordfont}'}</code>{' '}
            (<code>{'{cf}'}</code>), <code>{'{chordsize}'}</code> (<code>{'{cs}'}</code>),{' '}
            <code>{'{chordcolour}'}</code>, and the same three for <code>chorus</code>,{' '}
            <code>title</code>, <code>tab</code>, <code>grid</code>, <code>label</code>,{' '}
            <code>footer</code> and <code>toc</code> (<code>{'{titlefont}'}</code>,{' '}
            <code>{'{tabsize}'}</code>, <code>{'{toccolour}'}</code>…), in either spelling of
            colour.
          </li>
          <li>
            Pages and columns — <code>{'{new_page}'}</code> (<code>{'{np}'}</code>),{' '}
            <code>{'{new_physical_page}'}</code> (<code>{'{npp}'}</code>),{' '}
            <code>{'{column_break}'}</code> (<code>{'{colb}'}</code>, and a bare{' '}
            <code>{'{cb}'}</code>), <code>{'{columns}'}</code> (<code>{'{col}'}</code>) and{' '}
            <code>{'{pagetype}'}</code>.
          </li>
          <li>
            Diagrams and titles — <code>{'{diagrams}'}</code>, <code>{'{grid}'}</code>{' '}
            (<code>{'{g}'}</code>), <code>{'{no_grid}'}</code> (<code>{'{ng}'}</code>) and{' '}
            <code>{'{titles}'}</code>.
          </li>
          <li>
            <code>{'{image: src=...}'}</code> — there is nowhere here for the picture to come
            from, so the line is kept and nothing is drawn.
          </li>
          <li>
            <code>{'{x_...}'}</code> — any directive starting <code>x_</code> belongs to some
            program&apos;s own extensions, which the format asks everybody else to leave alone.
          </li>
        </ul>
        <p>
          And <code>{'{new_song}'}</code> (<code>{'{ns}'}</code>) is what separates songs in a
          file that holds several — see the end of this page.
        </p>

        <h2>Chords</h2>
        <p>
          Both notations work, mixed freely, chord by chord: <code>[C]</code> and <code>[Do]</code>,{' '}
          <code>[Bb]</code> and <code>[Sib]</code>, <code>[F#m7]</code> and <code>[Fa#-7]</code>.
          Whoever reads the song sees it in the notation they&apos;ve chosen, regardless of which one
          you typed. Standard symbols are recognized — <code>m</code>, <code>7</code>,{' '}
          <code>maj7</code>, <code>sus4</code>, <code>add9</code>, <code>dim</code>, <code>aug</code>,
          slash chords like <code>C/E</code> — including their common alternate spellings
          (<code>min7</code>, <code>-7</code>, and <code>mi7</code> are all the same chord, and{' '}
          <code>do7+</code> is the major seventh, the same chord as <code>Cmaj7</code>).
        </p>
        <p>Two edge cases worth knowing:</p>
        <ul>
          <li>
            <code>Do</code> is always read as the note C, never as a diminished chord spelled with a
            trailing <code>o</code> — write <code>dim</code> or <code>°</code> when you mean
            diminished (<code>sol°</code> or <code>soldim</code>).
          </li>
          <li>
            Italian words that start with a note name and end in <code>o</code> —{' '}
            <code>solo</code>, <code>mio</code> — are never read as chords, so they stay in the
            lyrics rather than disappearing into a bogus chord.
          </li>
        </ul>

        <h2>Structure</h2>
        <ul>
          <li>
            <code>{'{comment: ...}'}</code> (or <code>{'{c: ...}'}</code>) — a spoken aside, shown
            between the lines. Good for &quot;intro&quot;, &quot;x2&quot;, stage directions.{' '}
            <code>{'{comment_italic}'}</code> and <code>{'{ci}'}</code> read the same way, since
            an aside here is already set in italics. <code>{'{comment_box}'}</code> draws a box
            around it and <code>{'{highlight}'}</code> picks it out in colour.{' '}
            <code>{'{cb: ...}'}</code> is the short form of <code>{'{comment_box}'}</code>; a bare{' '}
            <code>{'{cb}'}</code>, with nothing to say, is read as a column break, since the
            format&apos;s own documentation gives the abbreviation to both.
          </li>
          <li>
            <code>{'{start_of_chorus}'}</code> … <code>{'{end_of_chorus}'}</code> (or{' '}
            <code>{'{soc}'}</code> … <code>{'{eoc}'}</code>) — marks a chorus, set apart when read.
          </li>
          <li>
            <code>{'{start_of_bridge}'}</code> … <code>{'{end_of_bridge}'}</code> (or{' '}
            <code>{'{sob}'}</code> … <code>{'{eob}'}</code>) — same treatment, in italics.
          </li>
          <li>
            <code>{'{start_of_verse}'}</code> … <code>{'{end_of_verse}'}</code> (or{' '}
            <code>{'{sov}'}</code> … <code>{'{eov}'}</code>) — a verse marked by hand. Worth it only
            when a verse has a blank line inside it: otherwise a blank line already ends one.
          </li>
          <li>
            <code>{'{chorus}'}</code> — &quot;the chorus goes here&quot;, without writing it out
            again. Strumfolio prints the stanza itself, set as a chorus: on a stand, a verse you
            don&apos;t know by heart is worth more than the word &quot;Chorus&quot;. Name one to
            repeat a particular chorus — <code>{'{start_of_chorus: Final}'}</code> further up,
            then <code>{'{chorus: Final}'}</code> — and with no name it repeats the last chorus
            seen. Give it a label — <code>{'{chorus: Last time}'}</code>, or{' '}
            <code>{'{chorus: label="Last time"}'}</code> — and the last chorus is repeated under
            that label, as the format says. A <code>{'{chorus}'}</code> in a file that never
            opened one prints the word, since that is all there is to say.
          </li>
          <li>
            Any other <code>{'{start_of_...}'}</code> … <code>{'{end_of_...}'}</code> pair —{' '}
            <code>{'{start_of_solo}'}</code>, <code>{'{start_of_intro}'}</code> — is kept, and the
            block prints its own name above it. It reads as a verse, since those three are the only
            kinds Strumfolio draws differently. Naming one — <code>{'{start_of_chorus: Chorus 2}'}</code>,
            or the spelling the format recommends, <code>{'{start_of_chorus: label="Chorus 2"}'}</code>{' '}
            — prints that name instead, and a <code>\n</code> inside a label breaks it onto a
            second line.
          </li>
          <li>
            <code>{'{start_of_tab}'}</code> … <code>{'{end_of_tab}'}</code> (or <code>{'{sot}'}</code>{' '}
            … <code>{'{eot}'}</code>) — a block of tablature, kept exactly as typed: never read for
            chords, never wrapped or reflowed.
          </li>
          <li>
            <code>{'{start_of_grid}'}</code> … <code>{'{end_of_grid}'}</code> (or{' '}
            <code>{'{sog}'}</code> … <code>{'{eog}'}</code>) — a chord grid,{' '}
            <code>| Am . . . | F . . . |</code>. Treated exactly like a tab, because what both need
            is the same: every column left where it was put. <code>{'{start_of_grille}'}</code>,
            an older name for the same thing, is read as one.
          </li>
          <li>
            <code>{'{start_of_abc}'}</code>, <code>{'{start_of_ly}'}</code>,{' '}
            <code>{'{start_of_svg}'}</code>, <code>{'{start_of_textblock}'}</code> and{' '}
            <code>{'{start_of_strum}'}</code>, each closed by its own <code>{'{end_of_...}'}</code>{' '}
            — blocks the format hands to another program: ABC notation, LilyPond, an SVG drawing,
            a block of text, a strumming pattern. Strumfolio doesn&apos;t render those languages,
            so it keeps the source verbatim, folded like a tab under the name of what it is, and
            never reads it for chords. The printed booklet leaves the code out and prints only a
            text block.
          </li>
        </ul>

        <h2>A line for one instrument only</h2>
        <p>
          A dash and an instrument after the directive&apos;s name makes that line conditional:{' '}
          <code>{'{comment-guitar: capo 3 here}'}</code> is shown to somebody reading the guitar
          shapes and to nobody else, and <code>{'{comment-!guitar: ...}'}</code> is shown to
          everybody <em>but</em> them. Whole blocks take one too —{' '}
          <code>{'{start_of_chorus-ukulele}'}</code> … <code>{'{end_of_chorus}'}</code>.
        </p>
        <p>
          Strumfolio knows two instruments, <code>guitar</code> and <code>ukulele</code>, and
          decides per reader rather than per file: the same song shows different lines to two
          people reading it at once, and the file is one file. A selector naming an instrument
          this app doesn&apos;t have — <code>piano</code>, <code>bass</code> — hides the line,
          which is the honest reading of a file that took the trouble to say &quot;piano&quot;.
          Only things that are drawn can be conditional: a comment and a section, not{' '}
          <code>{'{title-guitar}'}</code>.
        </p>

        <h2>Notes to yourself, and characters that mean something</h2>
        <ul>
          <li>
            A line starting with <code>#</code> in the first column is a comment on the{' '}
            <em>file</em> — Strumfolio reads it and never shows it. A <code>#</code> anywhere else
            in a line is an ordinary character. To print one at the start of a line, write{' '}
            <code>\#</code>.
          </li>
          <li>
            <code>[*text]</code> is an annotation: it sits where a chord would, and is not one.{' '}
            <code>[*let ring]</code>, <code>[*capo 3]</code> — never transposed, never respelled,
            never offered as a fingering, and never in the song&apos;s chord list. That last part
            is why the star is needed at all: <code>[*C]</code> is the word C, <code>[C]</code> is
            the chord.
          </li>
          <li>
            A backslash makes the next character literal, for the five that mean something:{' '}
            <code>\[</code>, <code>\]</code>, <code>\{'{'}</code>, <code>\{'}'}</code>,{' '}
            <code>\#</code> and <code>\\</code> itself. A backslash in front of anything else
            stays a backslash. <code>\u00e9</code> — a backslash, a <code>u</code> and four hex
            digits — is the character it names, for one a keyboard can&apos;t type.
          </li>
          <li>
            The format&apos;s markup works in the words, in chords and in comments:{' '}
            <code>{'<b>'}</code> bold, <code>{'<i>'}</code> italic, <code>{'<u>'}</code>{' '}
            underlined, <code>{'<s>'}</code> struck through, <code>{'<sup>'}</code> and{' '}
            <code>{'<sub>'}</code>, <code>{'<big>'}</code> and <code>{'<small>'}</code>,{' '}
            <code>{'<tt>'}</code> for monospace, a <code>{'<span>'}</code> for the same things
            by attribute (<code>{'<span weight="bold">'}</code>), and{' '}
            <code>{'<sym name="sharp"/>'}</code> for a symbol. Colours and fonts in a span are
            left to a typesetter, but the words inside are never lost. Only those tags are
            markup: a <code>{'<'}</code> that starts anything else — <code>a {'<'} b</code> — is
            an ordinary character.
          </li>
          <li>
            A backslash at the <em>end</em> of a line continues that line onto the next one, so a
            long line can be broken up in the file and still read as one on the page. Inside a tab
            or a grid it stays an ordinary character, where a trailing backslash is part of the
            drawing. <code>\\</code> at the end of a line is an escaped backslash and continues
            nothing.
          </li>
        </ul>

        <h2>Putting a value inside the words</h2>
        <p>
          <code>%&#123;artist&#125;</code> anywhere in a line becomes the artist —{' '}
          <code>Written by %&#123;artist&#125;</code> reads as you&apos;d expect. Any of the
          fields above can be named that way.
        </p>
        <p>
          There&apos;s a conditional form too:{' '}
          <code>%&#123;artist|by %&#123;&#125;&#125;</code> prints &quot;by …&quot; only when
          there <em>is</em> an artist, and nothing at all when there isn&apos;t — the inner{' '}
          <code>%&#123;&#125;</code> stands for the value just named. Add a third part for the
          other case: <code>%&#123;artist|by %&#123;&#125;|traditional&#125;</code>. A name
          Strumfolio doesn&apos;t hold comes out empty rather than printing itself.
        </p>
        <p>
          The song file keeps the placeholder exactly as you wrote it — what you see on the
          page is the value, what you get back from an export is{' '}
          <code>%&#123;artist&#125;</code>.
        </p>

        <h2>More than one song in a paste</h2>
        <p>Split songs with one of these, and only these:</p>
        <ul>
          <li>a line of nothing but <code>---</code>, <code>===</code>, <code>***</code>, or <code>___</code></li>
          <li><code>{'{ns}'}</code> or <code>{'{new_song}'}</code></li>
          <li>a second <code>{'{title: ...}'}</code> — the title line stays with the song it opens</li>
          <li>a form feed / page break — what text extracted from a PDF leaves behind</li>
        </ul>
        <p>
          A blank line never splits songs: verses are full of blank lines between them, and treating
          one as a separator would cut a single song into several.
        </p>

        <h2>Skipping the brackets entirely</h2>
        <p>
          Chords on their own line, directly above the lyrics and aligned by column — the way most
          chord sites publish a song — convert automatically on import:
        </p>
        <pre className="code-block">{`G                  C
Amazing grace, how sweet the sound`}</pre>
        <p>
          The result is shown as an editable preview before anything is saved, so a line read wrong
          is something to fix, not something that silently ships.
        </p>
      </article>
    </>
  )
}
