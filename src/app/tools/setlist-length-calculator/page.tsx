import type { Metadata } from 'next'
import Link from 'next/link'

import { SetlistCalculator } from '@/components/SetlistCalculator'
import { PromoPanel } from '@/components/PromoPanel'
import { Footer } from '@/components/Footer'
import { APP_NAME } from '@/lib/brand'
import { CARD_HEIGHT, CARD_WIDTH } from '@/lib/blog/openGraph'

const TITLE = 'Setlist length calculator'

const DESCRIPTION =
  'Paste your set and see how long it really runs, gaps included, and what time you come off stage. In your browser, nothing stored.'

/** Full `openGraph` block, never inherited — see the converter page for why. */
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/tools/setlist-length-calculator' },
  openGraph: {
    title: `${TITLE} — ${APP_NAME}`,
    description: DESCRIPTION,
    url: '/tools/setlist-length-calculator',
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/brand/og-image.png', width: CARD_WIDTH, height: CARD_HEIGHT }],
  },
}

export default function SetlistLengthCalculatorPage() {
  return (
    <>
      <div className="site-hero">
        <div aria-hidden className="site-hero-glow" />
        <div aria-hidden className="site-hero-stave" />

        <div className="site-hero-inner">
          <h1 className="site-hero-title">{TITLE}</h1>
          <p className="site-hero-lede">
            Paste the set, keep the lengths you already wrote at the end of each line, and find out whether it fits the
            slot — and what time you actually come off.
          </p>
        </div>
      </div>

      <main className="site-main">
        <SetlistCalculator />

        <div className="article-body tool-prose">
          <h2>Why a set always runs longer than the songs</h2>
          <p>
            Add up the tracks and you get the music. What you play is the music plus everything between it: tuning
            down for the one song in <code>DADGAD</code>, saying who wrote the next one, waiting for the room to stop
            clapping, finding the capo. Thirty seconds a song is a conservative guess, and on a twenty-song set that is
            nine and a half extra minutes — the difference between finishing on time and being asked to.
          </p>
          <p>
            The gap goes <em>between</em> songs, so a set of twenty has nineteen of them and none after the last. That
            sounds like pedantry until you notice it is the direction that makes a calculator over-promise.
          </p>

          <h2>Write lengths as 3:45</h2>
          <p>
            One form, on purpose. A bare <code>4</code> at the end of a line is far more often the end of a title —{' '}
            <code>Interlude 2</code>, <code>Take 4</code> — than it is four minutes, and a calculator that ate it would
            report a shorter set than the one you are about to play. Anything without a length counts as the default you
            picked above, and the table marks it as assumed so the guess is visible rather than hidden in a total.
          </p>

          <h2>The finish time is rounded up</h2>
          <p>
            A slot is a promise to somebody holding the keys to the venue, so a set that runs 44:20 is a 45-minute set
            here. If the number matters — a curfew, a support slot, a wedding — being wrong late is cheaper than being
            wrong early.
          </p>

          <h2>Nothing leaves your browser</h2>
          <p>
            The arithmetic happens on your own machine. Nothing is uploaded, nothing is stored, no account — which is
            worth saying about a document that names what you can play and when you are on stage.
          </p>

          <h2>When the list stops being a list</h2>
          <p>
            A set typed into a box is fine once. What it cannot do is be the thing you read from: reorder with a finger
            during soundcheck, hold the key each song sits in for your voice, be on the phone in your pocket as well as
            the tablet on the stand, and open with no signal in a basement.
          </p>
          <p>
            That is what {APP_NAME} does with a set — songbooks that are one set each, split into sections, reordered by
            dragging, and readable offline once opened. If your songs are text files right now, the{' '}
            <Link href="/tools/chordpro-converter">ChordPro converter</Link> is the way in, and the{' '}
            <Link href="/tools/chord-transposer">transposer</Link> is one page over for the ones that sit wrong.
          </p>
        </div>

        <PromoPanel />

        <Footer />
      </main>
    </>
  )
}
