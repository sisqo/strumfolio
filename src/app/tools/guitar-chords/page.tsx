import type { Metadata } from 'next'
import Link from 'next/link'

import { ChordLibrary, CHORD_CHART_PATH } from '@/components/ChordLibrary'
import { BlogChord } from '@/components/BlogChord'
import { Faq } from '@/components/Faq'
import { PromoPanel } from '@/components/PromoPanel'
import { Footer } from '@/components/Footer'
import { APP_NAME } from '@/lib/brand'
import { CARD_HEIGHT, CARD_WIDTH } from '@/lib/blog/openGraph'
import { LIBRARY_FAMILIES, LIBRARY_ROOTS, LIBRARY_SIZE, shapeCount } from '@/lib/music/chordLibrary'

const TITLE = 'Guitar chord chart'

/**
 * How many boxes the page can draw, alternatives included — **counted, not written down**,
 * for the reason the ukulele page's own `UNPLAYABLE` is: these come out of the shape
 * search, and a retuned search would quietly turn a number in the prose below into a lie.
 * `LIBRARY_SIZE` counts chords and is a constant; this counts shapes and is not.
 */
const SHAPES = shapeCount('guitar')

const DESCRIPTION =
  `Every guitar chord this app can draw: ${LIBRARY_SIZE} chords across twelve roots and eighteen chord types, ${SHAPES} shapes in all, each with its fingering and its notes. Free.`

/** Full `openGraph` block, never inherited — see the converter page for why. */
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CHORD_CHART_PATH.guitar },
  openGraph: {
    title: `${TITLE} — ${APP_NAME}`,
    description: DESCRIPTION,
    url: CHORD_CHART_PATH.guitar,
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/brand/og-image.png', width: CARD_WIDTH, height: CARD_HEIGHT }],
  },
}

/**
 * The guitar half of the chord chart. `ukulele-chords/page.tsx` is its twin, and the switch
 * at the top of `ChordLibrary` is the link between them.
 *
 * **Two pages and not one with a control**, for the reason the component writes down: these
 * are two documents, arrived at from two different searches, and each has to stay on a URL
 * somebody can send. Which is also why the prose below is *not* shared with the ukulele
 * page — the shapes a guitar makes easy are not the ones a ukulele makes easy, the barre is a
 * guitar's whole problem and four strings are the ukulele's, and two near-identical pages
 * would be the one thing a search engine is right to ignore.
 *
 * **There is deliberately no `softwareToolJsonLd` here**, unlike every other page under
 * `/tools`. That block declares a `WebApplication`, and its own comment says why: those pages
 * run in the browser, take input and produce a result, and «nothing about them is a
 * document». This one is a document — it takes no input and computes nothing a reader asked
 * for. The `Faq` block at the foot still declares its own questions, which is the structured
 * data this page genuinely has.
 */
export default function GuitarChordsPage() {
  return (
    <>
      <div className="site-hero">
        <div aria-hidden className="site-hero-glow" />
        <div aria-hidden className="site-hero-stave" />

        <div className="site-hero-inner">
          <h1 className="site-hero-title">{TITLE}</h1>
          <p className="site-hero-lede">
            Every chord on six strings, drawn as the shape a hand actually holds — open at the nut where an open shape
            exists, a barre form up the neck where it does not. {LIBRARY_ROOTS.length} roots,{' '}
            {LIBRARY_FAMILIES.length} chord types, {LIBRARY_SIZE} boxes — and the other {SHAPES - LIBRARY_SIZE} ways of
            playing them, one tap behind each box.
          </p>
        </div>
      </div>

      <main className="site-main">
        <ChordLibrary instrument="guitar" />

        <div className="article-body tool-prose">
          <h2>How to read one of these boxes</h2>
          <p>
            The six vertical lines are the strings, low <BlogChord>E</BlogChord> on the left. The thick line across the
            top is the nut. A dot is a finger; a bar across several strings is <strong>one</strong> finger laid flat
            over them, which is what a barre is and why it is drawn as a bar rather than as four separate dots. Above
            the nut, a circle means the string rings open and a cross means it is not played at all.
          </p>
          <p>
            When the shape sits higher up the neck there is no nut to draw, so the box shows a plain fret with a{' '}
            <strong>number beside it</strong> — that is the fret the window starts on, not the fret your first finger
            goes to. The line of numbers under each box is the same shape written out the way a chord chart prints it:{' '}
            one cell per string, low to high, <code>x</code> for a string you leave alone.
          </p>

          <h2>Why these shapes and not others</h2>
          <p>
            A guitar has too many valid fingerings for any chord to make a list of them useful. What is on this page is
            the one a player reaches for: <strong>an open shape at the nut where the chord has one</strong> —{' '}
            <BlogChord>C</BlogChord>, <BlogChord>G</BlogChord>, <BlogChord>D</BlogChord>, <BlogChord>A</BlogChord>,{' '}
            <BlogChord>E</BlogChord> and their sevenths — and otherwise the movable form that sits{' '}
            <strong>lowest on the neck</strong>. That last rule is what keeps a <BlogChord>Bb</BlogChord> at the first
            fret instead of the tenth, where an A form and an E form both technically answer.
          </p>
          <p>
            None of the fret numbers here were copied out of a book. Each shape is checked against the notes it actually
            sounds: nothing outside the chord, and every note that makes the chord what it is present. So the claim
            these boxes make is «this is a voicing of the right chord», which is a stronger thing to be able to say
            than «this is what page 12 printed».
          </p>

          <h2>There is more than one way to play any of them</h2>
          <p>
            One box per chord is a chart, not the truth. Nearly every entry above has two or three other shapes behind
            it — the E form and the A form of the same barre, the open voicing and the one further up — and which of
            them you want depends on the chord you are coming from and the one you are going to.
          </p>
          <p>
            So they are all here. <strong>Tap any box</strong> and the chord opens on its own with every shape it has,
            swiped through one at a time, the standard one first and the fingering under it changing with the picture.
            The card says how many there are before you open it.
          </p>
          <p>
            It is the same picker {APP_NAME} puts on a chord in a song, with one difference that is the whole point of
            the app: there, <strong>the shape you land on is remembered for that chord in that song</strong>, on every
            device you open it on. This page forgets the moment you close the box.
          </p>

          <h2>A ukulele is a different chart</h2>
          <p>
            Not a shorter version of this one. Four strings and a four-fret reach leave so few valid voicings that the
            compact one usually <em>is</em> the one everybody plays, and the chords that are hard swap places
            completely: <BlogChord>E</BlogChord> is a stretch on a guitar and three fingers on a ukulele, while{' '}
            <BlogChord>Bb</BlogChord> is the reverse. The ukulele shapes are on{' '}
            <Link href={CHORD_CHART_PATH.ukulele}>their own chart</Link>, or use the switch at the top of this one.
          </p>

          <h2>What the app adds</h2>
          <p>
            This page is a reference: it knows every chord and nothing about your songs. What {APP_NAME} does is put
            the same shapes <strong>inside the sheet you are reading on stage</strong> — a chord is a tap away from its
            fingering, the sheet is already in the key you sing in and on the fret you capo at, and all of it works
            with the phone in aeroplane mode.
          </p>
          <p>
            If a chord above is one you keep having to look up, the honest fix is usually a{' '}
            <Link href="/tools/capo-calculator">capo</Link> or a{' '}
            <Link href="/tools/chord-transposer">different key</Link> rather than more practice — and both of those are
            free pages here too.
          </p>
        </div>

        <Faq
          items={[
            {
              question: 'What do the x and the o above a chord box mean?',
              answer:
                'A circle means play that string open — you fret nothing on it and it rings as it is tuned. A cross means do not play that string at all: either you miss it with the strum or you damp it with the side of a finger. Both sit above the nut because they are instructions about the string rather than about a fret.',
            },
            {
              question: 'What is the number next to a chord box?',
              answer:
                'The fret the window starts on. A box with a thick line at the top is drawn at the nut, so the first row of the grid is the first fret. When a shape sits higher up the neck there is no nut to show, so the top line becomes an ordinary fret and the number beside it says which one — a 5 means the first row you are looking at is the fifth fret.',
            },
            {
              question: 'How many ways are there to play one chord on a guitar?',
              answer:
                'More than a chart can usefully print at once. Most chords have an open or partly open shape near the nut and at least two movable barre forms further up, and all of them are the same chord. The grid on this page draws one per chord — the open shape where the chord has one, and otherwise the movable form lowest on the neck, because a lower shape keeps more of the instrument ringing — and keeps the rest behind it: tap a box and you can page through every shape that chord has.',
            },
            {
              question: 'Which chords should I learn first?',
              answer:
                'The ones with open strings in them, because an open string is a finger you do not have to place: C, G, D, A, E, and the minors Am, Em, Dm. Those seven cover a large share of guitar songs between them, and they are also the shapes a capo exists to get you back to when a song sits in a key that has none of them.',
            },
            {
              question: 'Are these shapes the same as the ones in the app?',
              answer:
                'Yes, and not by coincidence — the page and the reading screen call the same function for the same chord, so a shape you learn here is the one the sheet will draw, and tapping a box here opens the same picker tapping a chord in a song does. What the app adds is memory: in a song the shape you pick is remembered for that chord in that song, on every device you sign in on. This page forgets it when you close the box.',
            },
          ]}
        />

        <PromoPanel />

        <Footer />
      </main>
    </>
  )
}
