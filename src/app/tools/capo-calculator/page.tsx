import type { Metadata } from 'next'
import Link from 'next/link'

import { CapoCalculator } from '@/components/CapoCalculator'
import { PromoPanel } from '@/components/PromoPanel'
import { Footer } from '@/components/Footer'
import { APP_NAME } from '@/lib/brand'
import { CARD_HEIGHT, CARD_WIDTH } from '@/lib/blog/openGraph'

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
            Clamp it on the second fret, hold what looks like <code>G</code>, and the room hears <code>A</code>. Your
            fingers are in G; the song is in A. Both descriptions are true, and keeping them apart is the whole skill —{' '}
            <Link href="/blog/capo-second-fret">the longer version is on the blog</Link>.
          </p>
          <p>
            Which means a capo is not a transposition. The sound stays exactly where it was; only what you read changes.
            If you want the song to come out in a different key — because it sits wrong for your voice — that is the{' '}
            <Link href="/tools/chord-transposer">chord transposer</Link> instead.
          </p>

          <h2>Why fret 5 keeps winning</h2>
          <p>
            Because the shapes a guitar makes easy are the ones with open strings in them — <code>C</code>,{' '}
            <code>G</code>, <code>D</code>, <code>Em</code>, <code>Am</code> — and most keys are five, three or two
            semitones away from a key made of those. A song in F is a song in C with a barre in front of every chord;
            put the capo on the fifth fret and the barre disappears.
          </p>
          <p>
            The table above works that out for every fret rather than for the one everybody quotes. It counts how many
            of your chords fall into an easy shape at each position and shows the names you would be reading there, so
            you can check the answer instead of trusting it. Ties go to the lowest fret, because a capo further up the
            neck shortens the instrument for nothing.
          </p>

          <h2>Guitar and ukulele are different questions</h2>
          <p>
            The same chords are hard on one and simple on the other: <code>E</code> is a stretch on a guitar and three
            fingers on a ukulele, and <code>Bb</code> is the reverse. The switch above is not cosmetic — it changes
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

        <PromoPanel />

        <Footer />
      </main>
    </>
  )
}
