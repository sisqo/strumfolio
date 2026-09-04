import type { Metadata } from 'next'
import Link from 'next/link'

import { ChordTransposer } from '@/components/ChordTransposer'
import { BlogChord } from '@/components/BlogChord'
import { Faq } from '@/components/Faq'
import { PromoPanel } from '@/components/PromoPanel'
import { Footer } from '@/components/Footer'
import { JsonLd } from '@/components/JsonLd'
import { APP_NAME } from '@/lib/brand'
import { CARD_HEIGHT, CARD_WIDTH } from '@/lib/blog/openGraph'
import { softwareToolJsonLd } from '@/lib/blog/jsonLd'

const TITLE = 'Free chord transposer'

const DESCRIPTION =
  'Paste a chord sheet and move it to any key, chords still over the right words. Runs in your browser — no account, no upload, nothing stored.'

/**
 * `openGraph` declared in full rather than inherited — Next replaces the root layout's block
 * wholesale once a page declares one, so a page that names its own title and stops there
 * ships a link card with no image. Same note as `/pricing`, `/changelog` and the converter.
 */
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/tools/chord-transposer' },
  openGraph: {
    title: `${TITLE} — ${APP_NAME}`,
    description: DESCRIPTION,
    url: '/tools/chord-transposer',
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/brand/og-image.png', width: CARD_WIDTH, height: CARD_HEIGHT }],
  },
}

/**
 * The transposer, and the words around it.
 *
 * The prose under the box is not padding, for the reason the converter page states: a tool
 * page with nothing but the tool on it tells a search engine — and a person who landed by
 * accident — nothing about what the thing does or why it matters. It is also where the two
 * questions this tool cannot answer get answered: why a capo is a different control, and why
 * the columns of a chords-above sheet are the fragile part.
 */
export default function ChordTransposerPage() {
  return (
    <>
      {/* A free web application, said in the form a crawler reads — see `lib/blog/jsonLd.ts`. */}
      <JsonLd data={softwareToolJsonLd({ name: TITLE, description: DESCRIPTION, path: '/tools/chord-transposer' })} />

      <div className="site-hero">
        <div aria-hidden className="site-hero-glow" />
        <div aria-hidden className="site-hero-stave" />

        <div className="site-hero-inner">
          <h1 className="site-hero-title">{TITLE}</h1>
          <p className="site-hero-lede">
            Paste a chord sheet, step the key up or down, and take it away in the key you sing in. It runs in your
            browser — nothing is uploaded and nothing is stored.
          </p>
        </div>
      </div>

      <main className="site-main">
        <ChordTransposer />

        <div className="article-body tool-prose">
          <h2>What transposing actually changes</h2>
          <p>
            Every chord moves by the same interval and nothing else moves at all. The melody keeps its exact shape — the
            same distances between the same notes — and comes out higher or lower, which is what you want when a song
            was recorded by a voice that is not yours.
          </p>
          <p>
            The number on the stepper is the distance from the key the sheet was written in, not a new key name. Two up
            means two up from wherever this song started, on this song and on every other one, which is the version of
            the instruction you can use without first working out what key you are in.
          </p>

          <h2>Sharps or flats</h2>
          <p>
            A semitone above <BlogChord>A</BlogChord> can be written <BlogChord>Bb</BlogChord> or <BlogChord>A#</BlogChord>. Same shape, same sound,
            same everything except what is printed above the syllable — so the choice is yours rather than the
            arithmetic&apos;s, and the two buttons above make it. Keys with flats in them read better with flats; keys
            with sharps read better with sharps, and mixing the two on one page is legible but distracting.
          </p>

          <h2>A capo is a different question</h2>
          <p>
            Transposing changes what the room hears. A capo changes only what your hand holds — clamp it on and the
            shapes you finger are lower than what comes out, so the sound stays exactly where it was. If what you
            actually want is easier shapes for the same key, that is the{' '}
            <Link href="/tools/capo-calculator">capo calculator</Link>, not this page. The difference is worth ten
            minutes: <Link href="/blog/capo-second-fret">what your fingers play and what the song is in</Link>.
          </p>

          <h2>Why ChordPro survives this and a column layout barely does</h2>
          <p>
            If your sheet is ChordPro — chords in square brackets, inside the line — transposition is exact. The chord
            is attached to a syllable, so renaming it moves nothing.
          </p>
          <p>
            If your sheet has the chords on a line above the words, the alignment is doing the work, and a longer name
            has to fit in the space the shorter one had. This page keeps every chord in its own column and tells you
            when one could not stay there: <BlogChord>A</BlogChord> becoming <BlogChord>Bb</BlogChord> with a single space in front of the
            next chord has nowhere to go. That is a real limit of the layout rather than a bug here, and it is most of
            the argument for{' '}
            <Link href="/blog/chordpro-explained">keeping your songs in ChordPro instead</Link> — a{' '}
            <Link href="/tools/chordpro-converter">converter for that</Link> is one page over.
          </p>

          <h2>Nothing leaves your browser</h2>
          <p>
            The transposition happens on your own machine, in the page you are looking at. There is no upload, no
            account and no copy kept anywhere — which matters if what you are pasting is a song nobody has heard yet.
          </p>

          <h2>When a stepper stops being enough</h2>
          <p>
            This page moves one sheet, once. What it cannot do is remember: that this song sits two down for your voice,
            that the capo lives on the second fret for it, that the singer reads it in Italian while you read the
            letters. That is what {APP_NAME} is for — the same transposition as here, kept per song, on every device you
            open it on, and readable with no signal once the page has been opened.
          </p>
        </div>

        <Faq
          items={[
            {
              question: 'How do I transpose a chord chart to a different key?',
              answer:
                'Paste the sheet, then step the transposer up or down until the key suits the voice singing it. Every chord moves by the same number of semitones, so the song keeps its exact shape and only its pitch changes. The number you step is the distance from the key the sheet was written in, which means the same instruction works on every song rather than only on this one.',
            },
            {
              question: 'Does transposing change the melody?',
              answer:
                'No. Transposing moves every note by the same interval, so the distances between the notes — which is what a melody actually is — stay identical. It comes out higher or lower, and nothing else about it changes.',
            },
            {
              question: 'Should I write sharps or flats?',
              answer:
                'Whichever the key you are landing in uses: keys with flats in them read better with flats, keys with sharps read better with sharps. Bb and A# are the same sound and the same shape, so nothing but legibility is at stake — but mixing both spellings on one page is distracting, and a chord sheet exists to remove distraction.',
            },
            {
              question: 'Will my chords still line up with the words?',
              answer:
                'In ChordPro, always: the chord is attached to a syllable, so renaming it moves nothing. In a sheet with chords on a line above the words, the alignment is doing the work — this page keeps every chord in its own column and tells you when a longer name could not stay in one, which happens when a name grows with only a single space in front of the next chord.',
            },
          ]}
        />

        <PromoPanel />

        <Footer />
      </main>
    </>
  )
}
