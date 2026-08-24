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
        </ul>
        <p>
          <strong>Not <code>{'{section: ...}'}</code></strong> for the songbook division, even
          though it reads naturally — some ChordPro tools use <code>{'{section: chorus}'}</code> to
          mark a block of the song, and Strumfolio would read it exactly that way: as an attempt to
          file the song into a section literally named &quot;chorus&quot;. Use{' '}
          <code>{'{division: ...}'}</code> instead.
        </p>
        <p>
          Anything else — <code>{'{key: ...}'}</code>, <code>{'{tempo: ...}'}</code>,{' '}
          <code>{'{capo: ...}'}</code> — is read and silently ignored, never shown to whoever opens
          the song. Strumfolio doesn&apos;t store a key or a capo position for a song: it works the key
          out live from the chords, and a capo is a suggestion made live to whoever&apos;s reading,
          not a fact about the song itself — so there&apos;s nothing for either directive to set.
        </p>

        <h2>Chords</h2>
        <p>
          Both notations work, mixed freely, chord by chord: <code>[C]</code> and <code>[Do]</code>,{' '}
          <code>[Bb]</code> and <code>[Sib]</code>, <code>[F#m7]</code> and <code>[Fa#-7]</code>.
          Whoever reads the song sees it in the notation they&apos;ve chosen, regardless of which one
          you typed. Standard symbols are recognized — <code>m</code>, <code>7</code>,{' '}
          <code>maj7</code>, <code>sus4</code>, <code>add9</code>, <code>dim</code>, <code>aug</code>,
          slash chords like <code>C/E</code> — including their common alternate spellings
          (<code>min7</code>, <code>-7</code>, and <code>mi7</code> are all the same chord).
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
            between the lines. Good for &quot;intro&quot;, &quot;x2&quot;, stage directions.
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
            <code>{'{start_of_tab}'}</code> … <code>{'{end_of_tab}'}</code> (or <code>{'{sot}'}</code>{' '}
            … <code>{'{eot}'}</code>) — a block of tablature, kept exactly as typed: never read for
            chords, never wrapped or reflowed.
          </li>
        </ul>

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
