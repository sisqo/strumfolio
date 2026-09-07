import type { Metadata } from 'next'
import Link from 'next/link'

import { ChordLibrary, CHORD_CHART_PATH } from '@/components/ChordLibrary'
import { BlogChord } from '@/components/BlogChord'
import { Faq } from '@/components/Faq'
import { PromoPanel } from '@/components/PromoPanel'
import { Footer } from '@/components/Footer'
import { APP_NAME } from '@/lib/brand'
import { CARD_HEIGHT, CARD_WIDTH } from '@/lib/blog/openGraph'
import { LIBRARY_FAMILIES, LIBRARY_ROOTS, LIBRARY_SIZE, chordLibrary, shapeCount } from '@/lib/music/chordLibrary'

const TITLE = 'Ukulele chord chart'

const DESCRIPTION =
  `Every ukulele chord this app can draw: ${LIBRARY_SIZE} chords across twelve roots and eighteen chord types, every shape for each with its fingering and its notes. Free.`

/** Full `openGraph` block, never inherited — see the converter page for why. */
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CHORD_CHART_PATH.ukulele },
  openGraph: {
    title: `${TITLE} — ${APP_NAME}`,
    description: DESCRIPTION,
    url: CHORD_CHART_PATH.ukulele,
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/brand/og-image.png', width: CARD_WIDTH, height: CARD_HEIGHT }],
  },
}

/**
 * The chords a ukulele can hold with no box for the ones it cannot — **counted, not written
 * down**. These shapes come out of a search rather than a table, so a retuned search would
 * quietly turn a sentence in the prose below into a lie. The build asks instead.
 *
 * It costs nothing: `chordLibrary` runs once per build and the search caches per chord, so
 * this call is reading what `ChordLibrary` below already computed.
 */
const UNPLAYABLE = chordLibrary('ukulele').flatMap((group) =>
  group.chords.filter((chord) => chord.shapes.length === 0).map((chord) => chord.name),
)

/** How many boxes the chart can draw in all, counted rather than written down for the
 *  same reason `UNPLAYABLE` is: both are properties of the search, not constants. */
const SHAPES = shapeCount('ukulele')

/**
 * The ukulele half of the chord chart. `guitar-chords/page.tsx` is its twin; the switch at
 * the top of `ChordLibrary` links the two, and that component's own comment argues why there
 * are two pages rather than one page with a control.
 *
 * The prose here is written from scratch rather than adapted from the guitar page, and that
 * is the point of splitting them: a ukulele's hard chords are the guitar's easy ones, its
 * shapes are found by a search instead of transcribed as barre forms, and it has chords that
 * four strings simply cannot hold. Two pages saying the same thing in different words would
 * be the one arrangement a search engine is right to ignore.
 *
 * No `softwareToolJsonLd`, for the reason spelt out on the guitar page: that block declares a
 * `WebApplication`, and this page is a document.
 */
export default function UkuleleChordsPage() {
  return (
    <>
      <div className="site-hero">
        <div aria-hidden className="site-hero-glow" />
        <div aria-hidden className="site-hero-stave" />

        <div className="site-hero-inner">
          <h1 className="site-hero-title">{TITLE}</h1>
          <p className="site-hero-lede">
            Every chord on four strings, in the position a hand actually takes it in — which on a ukulele is almost
            always low and compact, because there is nowhere else for it to be. {LIBRARY_ROOTS.length} roots,{' '}
            {LIBRARY_FAMILIES.length} chord types, {LIBRARY_SIZE} boxes — and {SHAPES - LIBRARY_SIZE} further shapes
            behind them, one tap away.
          </p>
        </div>
      </div>

      <main className="site-main">
        <ChordLibrary instrument="ukulele" />

        <div className="article-body tool-prose">
          <h2>How to read one of these boxes</h2>
          <p>
            Four vertical lines, one per string, in the order you look down at them: <strong>G C E A</strong>, with the
            G on the left. That G is the odd thing about a ukulele — it is tuned <em>above</em> the C beside it, not
            below it, which is why a strum sounds like a chord rather than like a bass note with a chord on top. The
            box does not care either way: it says which fret to hold, and a shape is the same shape whichever octave
            the string is in.
          </p>
          <p>
            The thick line across the top is the nut. A dot is a finger, a bar across several strings is one finger laid
            flat over them, a circle above the nut means the string rings open and a cross means it is not played. The
            line of numbers under the box is the same shape written out — one cell per string, G to A, so{' '}
            <code>0003</code> is a <BlogChord>C</BlogChord>: three strings open and one finger on the third fret of the
            A string.
          </p>

          <h2>Why a ukulele chart is short and a guitar chart is not</h2>
          <p>
            Because there is hardly any choice worth making. Four strings and a hand that reaches four frets leave very
            few fingerings that are even the right chord, and almost nowhere to hide a string you would rather not
            play. So the compact shape near the nut usually <em>is</em> the shape everybody plays, and drawing that one
            in the grid is not the simplification it would be on six strings.
          </p>
          <p>
            The search does find others, and they are behind each box the same way they are on the guitar chart — tap
            one and you can page through every shape that chord has. What comes up is usually{' '}
            <strong>the same grip somewhere else</strong> rather than a different way of holding the chord: a{' '}
            <BlogChord>C</BlogChord> is <code>0003</code>, then two shapes at the fourth fret, then{' '}
            <code>000x</code> — which is <code>0003</code> with the A string left out. Worth a look when you are
            moving between two shapes and one of them is fighting you, and worth ignoring the rest of the time.
          </p>
          <p>
            These shapes are found rather than listed: every fingering inside the first twelve frets is tried, the ones
            that sound a note outside the chord or miss a note the chord needs are thrown away, and what is left is
            ranked — a string damped between two ringing ones costs the most, then leaving the first four frets, then
            dropping an outer string, then how far up the neck it sits. The shapes a ukulele book prints come out of
            that on their own: <BlogChord>C</BlogChord> as <code>0003</code>, <BlogChord>F</BlogChord> as{' '}
            <code>2010</code>, <BlogChord>G</BlogChord> as <code>0232</code>, <BlogChord>Am</BlogChord> as{' '}
            <code>2000</code>, <BlogChord>B7</BlogChord> as <code>2322</code>. Nobody typed them in.
          </p>

          {UNPLAYABLE.length > 0 && (
            <>
              <h2>The chords four strings cannot hold</h2>
              <p>
                A minor ninth is five notes and keeps four of them once the fifth is dropped — four <em>different</em>{' '}
                notes, on an instrument with exactly four strings to put them on. For most roots that works out; for at
                least one it does not, and there is no honest picture to draw. Those cards say so and list the notes
                instead of showing a shape that would be quietly wrong:{' '}
                {UNPLAYABLE.map((name, index) => (
                  <span key={name}>
                    {index > 0 && ', '}
                    <BlogChord>{name}</BlogChord>
                  </span>
                ))}
                .
              </p>
            </>
          )}

          <h2>The hard chords are not the guitar&rsquo;s hard chords</h2>
          <p>
            Worth knowing if you play both, because the instinct transfers wrongly.{' '}
            <BlogChord>E</BlogChord> is a stretch on a guitar and three easy fingers on a ukulele.{' '}
            <BlogChord>Bb</BlogChord> is a first-fret barre here and a comfortable shape there.{' '}
            <BlogChord>C</BlogChord> is one finger on a ukulele and three on a guitar. So a key that sits badly on one
            instrument may sit perfectly on the other — and if it sits badly on the one in your hands, the{' '}
            <Link href="/tools/capo-calculator">capo calculator</Link> knows which fret fixes it, ukulele included.
          </p>
          <p>
            The guitar shapes for all the same chords are on{' '}
            <Link href={CHORD_CHART_PATH.guitar}>their own chart</Link>, or use the switch at the top of this one.
          </p>

          <h2>What the app adds</h2>
          <p>
            This page knows every chord and nothing about your songs. {APP_NAME} puts the same shapes{' '}
            <strong>inside the sheet you are playing from</strong>: the instrument is a setting, so the whole songbook
            draws ukulele shapes, and a chord in the middle of a verse opens the same picker a box on this page does.
            The difference is that it remembers —{' '}
            <strong>the shape you pick is kept for that chord in that song</strong> on every device you sign in on,
            offline included, where this page forgets it as soon as you close the box.
          </p>
          <p>
            If your sheets are still text files, the <Link href="/tools/chordpro-converter">ChordPro converter</Link>{' '}
            is the way in, and it costs nothing either.
          </p>
        </div>

        <Faq
          items={[
            {
              question: 'What are the four strings on a ukulele tuned to?',
              answer:
                'G, C, E and A, low to high on the page — but the G is tuned above the C rather than below it, which is called reentrant tuning and is why a strummed ukulele chord sounds compact rather than spread out. The chord boxes on this page are drawn G C E A from left to right, in the order you look down at the strings.',
            },
            {
              question: 'What do the numbers under a ukulele chord box mean?',
              answer:
                'The same shape written out as text, one cell per string from G to A: 0003 is a C, which is three open strings and one finger on the third fret of the A string, and 2010 is an F. A zero is an open string and an x is a string you do not play. It is the form chord charts print, so you can copy it into a text file or read it out loud.',
            },
            {
              question: 'Which ukulele chords should I learn first?',
              answer:
                'C, F, G, Am and C7 between them cover a very large share of songs, and none of them needs more than three fingers. Add Dm, Em and A7 and you can play in the keys most songbooks are written in. The shapes that stay hard on a ukulele are the barred ones — Bb and Eb in particular — and a capo is usually the honest way around those.',
            },
            {
              question: 'Why do a few chords on this page have no shape?',
              answer:
                'Because four strings cannot always do it. A minor ninth needs four different notes once the fifth is dropped, and for some roots there is no fingering inside twelve frets that sounds all four and nothing else. Rather than draw a shape that is quietly the wrong chord, those cards say so and list the notes, which is what you would need to work out a substitute anyway.',
            },
            {
              question: 'Are ukulele chord shapes the same as guitar shapes?',
              answer:
                'No, and the difficulty does not transfer either. A ukulele is not a small guitar: it has four strings tuned differently, so the shapes are unrelated, and the chords that are awkward swap over. E is a stretch on a guitar and three fingers on a ukulele; Bb is the reverse. The guitar chart is a separate page, linked from the switch at the top of this one.',
            },
          ]}
        />

        <PromoPanel />

        <Footer />
      </main>
    </>
  )
}
