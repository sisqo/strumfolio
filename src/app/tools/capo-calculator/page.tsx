import type { Metadata } from 'next'
import Link from 'next/link'

import { CapoCalculator } from '@/components/CapoCalculator'
import { BlogChord } from '@/components/BlogChord'
import { Faq } from '@/components/Faq'
import { PromoPanel } from '@/components/PromoPanel'
import { Footer } from '@/components/Footer'
import { JsonLd } from '@/components/JsonLd'
import { APP_NAME } from '@/lib/brand'
import { CARD_HEIGHT, CARD_WIDTH } from '@/lib/blog/openGraph'
import { softwareToolJsonLd } from '@/lib/blog/jsonLd'

const TITLE = 'Capo calculator'

const DESCRIPTION =
  'Type your chords and see what every fret does to your hands — same sound, easier shapes. Guitar and ukulele, in your browser, nothing stored.'

/** Full `openGraph` block, never inherited — see the converter page for why. */
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/tools/capo-calculator' },
  openGraph: {
    title: `${TITLE} — ${APP_NAME}`,
    description: DESCRIPTION,
    url: '/tools/capo-calculator',
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/brand/og-image.png', width: CARD_WIDTH, height: CARD_HEIGHT }],
  },
}

export default function CapoCalculatorPage() {
  return (
    <>
      {/* A free web application, said in the form a crawler reads — see `lib/blog/jsonLd.ts`. */}
      <JsonLd data={softwareToolJsonLd({ name: TITLE, description: DESCRIPTION, path: '/tools/capo-calculator' })} />

      <div className="site-hero">
        <div aria-hidden className="site-hero-glow" />
        <div aria-hidden className="site-hero-stave" />

        <div className="site-hero-inner">
          <h1 className="site-hero-title">{TITLE}</h1>
          <p className="site-hero-lede">
            Type the chords you are stuck with and see which fret turns them into shapes you already know. The song
            keeps sounding exactly as it did — a capo moves your hand, not the key.
          </p>
        </div>
      </div>

      <main className="site-main">
        <CapoCalculator />

        <div className="article-body tool-prose">
          <h2>What a capo actually does</h2>
          <p>
            It shortens every string at once, so the shape your left hand holds comes out higher than the shape says.
            Clamp it on the second fret, hold what looks like <BlogChord>G</BlogChord>, and the room hears <BlogChord>A</BlogChord>. Your
            fingers are in G; the song is in A. Both descriptions are true, and keeping them apart is the whole skill —{' '}
            <Link href="/blog/capo-second-fret">the longer version is on the blog</Link>.
          </p>
          <p>
            Which means a capo is not a transposition. The sound stays exactly where it was; only what you read changes.
            If you want the song to come out in a different key — because it sits wrong for your voice — that is the{' '}
            <Link href="/tools/chord-transposer">chord transposer</Link> instead.
          </p>

          <h2>Which frets win, and why</h2>
          <p>
            The shapes a guitar makes easy are the ones with open strings in them — <BlogChord>C</BlogChord>,{' '}
            <BlogChord>G</BlogChord>, <BlogChord>D</BlogChord>, <BlogChord>A</BlogChord>, <BlogChord>E</BlogChord>,{' '}
            <BlogChord>Em</BlogChord>, <BlogChord>Am</BlogChord>. <strong>A capo wins when it lands your song on one
            of those keys</strong>, and does nothing at all when it lands between them. That is why the useful frets
            are so unevenly spread: the good ones are the distances from your key to an open-string key.
          </p>
          <p>
            It is also why the received wisdom is worth checking. <strong>&ldquo;Song in F? Capo 5.&rdquo; does not
            survive the arithmetic</strong>: the fifth fret turns <BlogChord>F</BlogChord> <BlogChord>Bb</BlogChord>{' '}
            <BlogChord>C</BlogChord> <BlogChord>Dm</BlogChord> into <BlogChord>C</BlogChord> <BlogChord>F</BlogChord>{' '}
            <BlogChord>G</BlogChord> <BlogChord>Am</BlogChord>, and the <BlogChord>F</BlogChord> is still a barre. The
            third fret gives you <BlogChord>D</BlogChord> <BlogChord>G</BlogChord> <BlogChord>A</BlogChord>{' '}
            <BlogChord>Bm</BlogChord> — one barre as well, but a lower capo — so the table above calls it a tie and
            takes the lower fret. Paste your own chords and it will do the same for them.
          </p>
          <p>
            <strong>Ties go to the lowest fret</strong>, because a capo further up the neck shortens the instrument for
            nothing: the low end of the song goes with it. The table shows the names you would be reading at every
            position so you can check the answer rather than trust it.
          </p>

          <h2>Guitar and ukulele are different questions</h2>
          <p>
            The same chords are hard on one and simple on the other: <BlogChord>E</BlogChord> is a stretch on a guitar and three
            fingers on a ukulele, and <BlogChord>Bb</BlogChord> is the reverse. The switch above is not cosmetic — it changes
            which shapes count as easy, and often which fret wins.
          </p>

          <h2>Nothing leaves your browser</h2>
          <p>
            The arithmetic happens on your own machine, in the page you are looking at. No upload, no account, nothing
            kept.
          </p>

          <h2>One song at a time, or every song remembered</h2>
          <p>
            This page answers for the chords in the box. What it cannot do is remember: that this song lives on the
            second fret, that one on the fifth, that the third needs no capo at all — and have the sheet already
            showing the right shapes when you open it on stage next Friday.
          </p>
          <p>
            That is what {APP_NAME} does with the same arithmetic: a capo kept per song, the sheet redrawn to match, and
            the chords still a tap away from their fingering. Bring the sheet in first with the{' '}
            <Link href="/tools/chordpro-converter">ChordPro converter</Link> if it is still a text file.
          </p>
        </div>

        <Faq
          items={[
            {
              question: 'What key am I in with a capo on the second fret?',
              answer:
                'Two semitones above the shapes you are holding. G shapes sound in A, C shapes sound in D, D shapes sound in E, A shapes sound in B. Every fret adds one semitone, so the same arithmetic works at any position: what sounds is what you play, plus the fret number.',
            },
            {
              question: 'Which fret should I put the capo on?',
              answer:
                'The one that turns the most of your chords into open shapes — and the lowest of them when two frets tie, because a capo further up the neck shortens the instrument for nothing. It is worth checking rather than assuming: for F, Bb, C and Dm the common advice of capo 5 leaves you C, F, G and Am, which still has a barre in it, while capo 3 gives D, G, A and Bm for a lower capo and the same count. The table above does that comparison for every fret at once.',
            },
            {
              question: 'Does a capo change the key of the song?',
              answer:
                'It changes the key that comes out, and it does not change what you read. That is the distinction worth keeping straight: a capo moves your hand, and the sheet still shows the shapes your hand is holding. If you want the sounding key to change while your shapes stay the same, that is transposing instead.',
            },
            {
              question: 'Does this work for a ukulele?',
              answer:
                'Yes, and it gives a different answer. The shapes a ukulele makes easy are not the ones a guitar makes easy — E is a stretch on a guitar and three fingers on a ukulele, and Bb is the reverse — so the instrument switch changes which chords count as easy, and often which fret wins.',
            },
          ]}
        />

        <PromoPanel />

        <Footer />
      </main>
    </>
  )
}
