import type { Metadata } from 'next'
import Link from 'next/link'

import { BlogChord } from '@/components/BlogChord'
import { Faq } from '@/components/Faq'
import { PromoPanel } from '@/components/PromoPanel'
import { ChordProConverter } from '@/components/ChordProConverter'
import { Footer } from '@/components/Footer'
import { JsonLd } from '@/components/JsonLd'
import { APP_NAME } from '@/lib/brand'
import { CARD_HEIGHT, CARD_WIDTH } from '@/lib/blog/openGraph'
import { softwareToolJsonLd } from '@/lib/blog/jsonLd'

const TITLE = 'Free ChordPro converter'

const DESCRIPTION =
  'Paste a chord sheet with the chords above the words and get ChordPro back. Runs in your browser — no account, no upload, nothing stored.'

/**
 * `openGraph` declared in full rather than inherited, for the reason `/pricing` and
 * `/changelog` each write down: Next replaces the root layout's block wholesale once a page
 * declares one, so a page that names its own title and stops there ships a link card with no
 * image.
 */
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/tools/chordpro-converter' },
  openGraph: {
    title: `${TITLE} — ${APP_NAME}`,
    description: DESCRIPTION,
    url: '/tools/chordpro-converter',
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/brand/og-image.png', width: CARD_WIDTH, height: CARD_HEIGHT }],
  },
}

/**
 * The converter, and the words around it.
 *
 * A tool page with nothing but the tool on it ranks badly and deserves to: there is nothing
 * on it to tell a search engine — or a person who landed by accident — what the thing does or
 * why the format is worth having. The prose under the box is not padding; it is the half that
 * gets somebody here in the first place.
 *
 * Static, like every public page here. The work happens in the browser after the page loads
 * (see `ChordProConverter`), so there is nothing to render per request and nothing to cache
 * wrongly.
 */
export default function ChordProConverterPage() {
  return (
    <>
      {/* A free web application, said in the form a crawler reads — see `lib/blog/jsonLd.ts`. */}
      <JsonLd data={softwareToolJsonLd({ name: TITLE, description: DESCRIPTION, path: '/tools/chordpro-converter' })} />

      <div className="site-hero">
        <div aria-hidden className="site-hero-glow" />
        <div aria-hidden className="site-hero-stave" />

        <div className="site-hero-inner">
          <h1 className="site-hero-title">{TITLE}</h1>
          <p className="site-hero-lede">
            Paste a chord sheet with the chords sitting above the words. Get ChordPro back, ready to keep. It runs in
            your browser — nothing is uploaded and nothing is stored.
          </p>
        </div>
      </div>

      <main className="site-main">
        <ChordProConverter />

        <div className="article-body tool-prose">
          <h2>How to convert a chord sheet to ChordPro</h2>
          <ol>
            <li>Copy the sheet you already have — from a text file, a forum post, a notes app, anywhere.</li>
            <li>Paste it into the left box. The converted ChordPro appears on the right as you type.</li>
            <li>
              <strong>Read the result before you keep it.</strong> The conversion is a heuristic, and the one thing it
              can get wrong is which lines are chords.
            </li>
            <li>Copy it, or download it as a <code>.chopro</code> file.</li>
          </ol>

          <h2>What the converter is doing</h2>
          <p>
            Almost every chord sheet on the internet is written the same way: a line of chord names, then the line of
            words underneath, with the chords held over the right syllable by a row of spaces. It reads perfectly and{' '}
            <strong>it survives nothing</strong>. Change the font, open it on a phone, let one long line wrap, and every
            chord slides away from the word it belonged to.
          </p>
          <p>
            ChordPro fixes that by putting the chord <em>inside</em> the line, in square brackets, at the exact point
            where your hand changes:
          </p>
          <pre>
            <code>{'[Am]The last bus home is [F]late\nand [C]I am singing [G]anyway'}</code>
          </pre>
          <p>
            <strong>The chord is now attached to a syllable instead of to a column</strong>, which is what lets an app
            transpose it, put a capo on it, or reflow it on a narrow screen without anything drifting. This converter
            reads the columns and writes the brackets.
          </p>

          <h2>It is a guess, and it will sometimes be wrong</h2>
          <p>
            Deciding which lines are chords and which are words is a heuristic, not a certainty — a line reading{' '}
            <BlogChord>A</BlogChord> could be a chord or the start of a sentence. The converter looks at whether{' '}
            <strong>every</strong> token on the line parses as a chord name, and it gets that right nearly always and
            not quite always.
          </p>
          <p>
            Three places it is worth checking the output, because these are where it goes wrong:
          </p>
          <ul>
            <li>
              <strong>A line of single letters that are also chord names.</strong> Italian solfège is the hard case —{' '}
              <BlogChord>La</BlogChord> and <BlogChord>Do</BlogChord> are chords and also words that get sung. The converter uses the
              spacing to decide, so a sung line with wide gaps in it can be misread.
            </li>
            <li>
              <strong>Section labels.</strong> <code>Chorus:</code> and <code>[Verse 1]</code> become{' '}
              <code>{'{comment: …}'}</code> lines, which is usually what you want — but a label the converter does not
              recognise stays as a plain line of words.
            </li>
            <li>
              <strong>Tablature.</strong> A run of dashes is kept verbatim inside a tab block rather than read for
              chords, because alignment is the whole point of a tab and a string of dashes is not a syllable.
            </li>
          </ul>
          <p>
            So read the output before you keep it. That is the same reason the import screen inside {APP_NAME} shows a
            preview that stays editable rather than saving straight away: <strong>an escape hatch is part of the design,
            not an apology for it.</strong>
          </p>

          <h2>Nothing leaves your browser</h2>
          <p>
            The conversion happens on your own machine, in the page you are looking at. There is no upload, no account
            and no copy kept anywhere — which matters if what you are pasting is a song nobody has heard yet.
          </p>

          <h2>What to do with the result</h2>
          <p>
            A <code>.chopro</code> file is plain text. It opens in any editor, it goes into version control, and it is
            readable by a person twenty years from now on a device nobody has designed yet — which is the real argument
            for the format, and the subject of{' '}
            <Link href="/blog/chordpro-explained">a longer piece on the blog</Link>.
          </p>
          <p>
            If you want the chords to <em>do</em> something — transpose to the key you sing in, suggest a capo, scroll
            hands-free while you play — paste the same text into {APP_NAME} instead. It runs the same conversion this
            page just did, and then the song is a song rather than a file.
          </p>
        </div>

        <Faq
          items={[
            {
              question: 'What is ChordPro, and what is a .chopro file?',
              answer:
                'ChordPro is a plain-text format for lyrics with chords, where each chord sits inside the line in square brackets at the exact syllable your hand changes on. A .chopro file is just a text file written that way — it opens in any editor, and most chord apps built in the last twenty years can read it. Nothing about it is proprietary, which is the whole reason it is worth converting to.',
            },
            {
              question: 'Will the converter get my chord sheet wrong?',
              answer:
                'Sometimes, and always in the same way: deciding which lines are chords and which are words is a guess. A line where every token reads as a chord name is treated as chords, so a sung line of Italian solfège with wide spacing can be misread. Read the output before you keep it — that one habit catches everything this can get wrong.',
            },
            {
              question: 'Is my song uploaded anywhere?',
              answer:
                'No. The conversion runs in your browser, on your own machine, in the page you are looking at. There is no upload, no account and no copy kept anywhere — which matters if what you are pasting is a song nobody has heard yet.',
            },
            {
              question: 'Can I convert several songs at once?',
              answer:
                'Paste them all and the tool will tell you how many it found, splitting on the boundaries ChordPro itself defines. The converter shows you one continuous result; the app splits a multi-song paste into separate songs on import.',
            },
          ]}
        />

        <PromoPanel />

        <Footer />
      </main>
    </>
  )
}
