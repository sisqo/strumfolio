'use client'

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

        <h2>The shape of a song</h2>
        <p>A chord sits in square brackets immediately before the syllable it belongs to. Everything else is lyrics, read exactly as typed.</p>
        <pre className="code-block">{`{title: Amazing Grace}
{artist: Traditional (John Newton, 1779)}
{tags: hymn, gospel}

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
            <strong><code>{'{artist: ...}'}</code></strong> — optional. <code>{'{subtitle: ...}'}</code>{' '}
            and <code>{'{st: ...}'}</code> mean the same thing.
          </li>
          <li>
            <strong><code>{'{tags: rock, live}'}</code></strong> — optional, comma-separated.
          </li>
          <li>
            <strong><code>{'{link1: ...}'}</code></strong>, <code>{'{link2: ...}'}</code> and{' '}
            <code>{'{link3: ...}'}</code> — optional, one URL each. Three fixed slots rather than
            a list, so a link can sit in the second or third one with nothing in the first.
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
          So does the strict spelling for the three directives that are Strumfolio&apos;s own
          rather than the format&apos;s — <code>{'{x_songbook: ...}'}</code>,{' '}
          <code>{'{x_division: ...}'}</code>, <code>{'{x_link1: ...}'}</code> — which is what a
          tool fussy about private directives will have written. Strumfolio reads both and writes
          the short ones.
        </p>
        <p>
          <strong>Everything else the format defines is kept and shown</strong> in the
          &quot;About this song&quot; panel, behind a tap beside the artist:{' '}
          <code>{'{album}'}</code>, <code>{'{composer}'}</code>, <code>{'{lyricist}'}</code>,{' '}
          <code>{'{year}'}</code>, <code>{'{copyright}'}</code>, <code>{'{duration}'}</code>,{' '}
          <code>{'{ccli}'}</code>, <code>{'{subtitle}'}</code> and the two sorting keys{' '}
          <code>{'{sorttitle}'}</code> and <code>{'{sortartist}'}</code>. Behind a tap because
          none of them is wanted mid-song, and the words need the room.
        </p>
        <p>
          <strong><code>{'{key: ...}'}</code></strong> is the one that also does something: it
          names the note the Nashville numbers count from. Without it Strumfolio works the key
          out from the chords, which is a good guess and only a guess — so when the song says,
          the song wins. A key written in a notation we don&apos;t read (German{' '}
          <code>H</code>, for instance) falls back to the guess rather than to C.
        </p>
        <p>
          Anything else — <code>{'{capo: ...}'}</code> and the
          typesetting directives a printed songbook needs (<code>{'{textfont}'}</code>,{' '}
          <code>{'{columns}'}</code>, <code>{'{new_page}'}</code>, <code>{'{define}'}</code>) — is
          read and silently ignored, never shown to whoever opens the song. Ignored, not lost: the
          editor keeps every one of them, so a file that arrives carrying them leaves carrying
          them. Strumfolio doesn&apos;t store a
          key or a capo position for a song: it works the key out live from the chords, and a capo
          is a suggestion made live to whoever&apos;s reading, not a fact about the song itself —
          so there&apos;s nothing for either directive to set.
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
            around it and <code>{'{highlight}'}</code> picks it out in colour. Not{' '}
            <code>{'{cb}'}</code>, which is a column break and not a comment at all.
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
            again. Shown as the reminder it is; Strumfolio doesn&apos;t repeat the words, since a
            song on a stand is read in the order it was typed.
          </li>
          <li>
            Any other <code>{'{start_of_...}'}</code> … <code>{'{end_of_...}'}</code> pair —{' '}
            <code>{'{start_of_solo}'}</code>, <code>{'{start_of_intro}'}</code> — is kept, and the
            block prints its own name above it. It reads as a verse, since those three are the only
            kinds Strumfolio draws differently. Naming one — <code>{'{start_of_chorus: Chorus 2}'}</code>{' '}
            — prints that name instead.
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
            is the same: every column left where it was put.
          </li>
        </ul>

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
            stays a backslash.
          </li>
          <li>
            A backslash at the <em>end</em> of a line is the one thing in the format Strumfolio
            doesn&apos;t read: elsewhere it continues the line onto the next one, here it stays an
            ordinary backslash. Write the long line as one line.
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
