import type { Metadata } from 'next'
import Link from 'next/link'

import { PromoPanel } from '@/components/PromoPanel'
import { Footer } from '@/components/Footer'
import { APP_NAME } from '@/lib/brand'
import { CARD_HEIGHT, CARD_WIDTH } from '@/lib/blog/openGraph'

const TITLE = 'Free tools for chords and setlists'

const DESCRIPTION =
  'Six free pages that do their whole job in your browser: convert a sheet to ChordPro, transpose it, find the capo, time a set, look up any guitar or ukulele chord.'

/** Full `openGraph` block, never inherited — see any tool page for why. */
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/tools' },
  openGraph: {
    title: `${TITLE} — ${APP_NAME}`,
    description: DESCRIPTION,
    url: '/tools',
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/brand/og-image.png', width: CARD_WIDTH, height: CARD_HEIGHT }],
  },
}

/**
 * The tools, listed — a real index as of the day the fourth one landed.
 *
 * This route was a redirect to the converter while that was the only tool here, because an
 * index listing one entry is a thin page and thin pages are worse than none. Four entries is
 * a page with something on it, so the redirect is gone and the entry in `publicRoutes.ts` is
 * `indexable` with it.
 *
 * The last two are the chord charts, and they are not tools: there is nothing to type into
 * them and nothing is computed. They are here because this is where a visitor looks for a
 * free page about chords, and they are two cards rather than one because a ukulele player
 * scanning this list should see their own instrument named.
 *
 * Written out here rather than derived from `PUBLIC_ROUTES`: that list knows paths, and a card
 * needs a name and a sentence saying what the tool is for. Deriving one from the other would
 * mean putting copy into a module the middleware reads on every request.
 */
const TOOLS = [
  {
    href: '/tools/chordpro-converter',
    name: 'ChordPro converter',
    what: 'Paste a sheet with the chords above the words and get ChordPro back, each chord attached to its own syllable.',
  },
  {
    href: '/tools/chord-transposer',
    name: 'Chord transposer',
    what: 'Move a whole sheet to the key you sing in, with every chord still over the right word.',
  },
  {
    href: '/tools/capo-calculator',
    name: 'Capo calculator',
    what: 'See what every fret does to your hands — same sound, easier shapes. Guitar and ukulele.',
  },
  {
    href: '/tools/setlist-length-calculator',
    name: 'Setlist length calculator',
    what: 'Find out how long the set really runs, gaps included, and what time you come off stage.',
  },
  {
    href: '/tools/guitar-chords',
    name: 'Guitar chord chart',
    what: 'Every chord on six strings, drawn as the shape a hand holds — with its fingering and its notes.',
  },
  {
    href: '/tools/ukulele-chords',
    name: 'Ukulele chord chart',
    what: 'The same chords on four strings, where the easy ones and the hard ones swap places.',
  },
]

export default function ToolsIndexPage() {
  return (
    <>
      <div className="site-hero">
        <div aria-hidden className="site-hero-glow" />
        <div aria-hidden className="site-hero-stave" />

        <div className="site-hero-inner">
          <h1 className="site-hero-title">Tools</h1>
          <p className="site-hero-lede">
            Six small pages for the work around a song: the arithmetic, and the chord you cannot remember the shape of.
            Each does its whole job in your browser — no account, no upload, nothing stored.
          </p>
        </div>
      </div>

      <main className="site-main">
        <ul className="tool-index">
          {TOOLS.map((tool) => (
            <li key={tool.href}>
              <Link href={tool.href} className="tool-index-card">
                <span className="tool-index-name">{tool.name}</span>
                <span className="tool-index-what">{tool.what}</span>
                <span className="tool-index-go" aria-hidden>
                  Open →
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="article-body tool-prose">
          <h2>Which one do you need?</h2>
          <ul>
            <li>
              <strong>Your sheet is chords above the words and you want it to survive being reflowed</strong> —{' '}
              <Link href="/tools/chordpro-converter">the converter</Link>. It attaches each chord to a syllable instead
              of to a column.
            </li>
            <li>
              <strong>The song sits wrong for your voice</strong> —{' '}
              <Link href="/tools/chord-transposer">the transposer</Link>. It moves the whole sheet and leaves the words
              alone.
            </li>
            <li>
              <strong>The key is right and your hand is not</strong> —{' '}
              <Link href="/tools/capo-calculator">the capo calculator</Link>. Same sound, different shapes.
            </li>
            <li>
              <strong>You have a slot to fill and a list to fit into it</strong> —{' '}
              <Link href="/tools/setlist-length-calculator">the setlist calculator</Link>. Gaps included, because they
              are what makes a set overrun.
            </li>
            <li>
              <strong>You just want to see where the fingers go</strong> — the chord charts, for{' '}
              <Link href="/tools/guitar-chords">guitar</Link> or <Link href="/tools/ukulele-chords">ukulele</Link>.
              Every root, every chord type, and every other way to play each one behind the box.
            </li>
          </ul>

          <h2>Why these run in your browser</h2>
          <p>
            Because you have not signed in, may never sign in, and are holding a chord sheet you want dealt with now. A
            round trip to a server would buy you a spinner and cost us the reason you trusted the page — so{' '}
            <strong>the work happens on your own machine</strong>, and a song nobody has heard yet stays that way.
            Nothing is uploaded, nothing is stored, and none of the six asks for an account.
          </p>
          <p>
            They are also <strong>not simplified copies</strong> of what {APP_NAME} does. The converter runs the same
            conversion the import screen runs; the capo calculator runs the same arithmetic the reading screen runs; the
            chord charts draw the shapes the reading screen draws, from the same function.
            What the app adds is memory — the key this song sits in for your voice, the fret it lives on, kept per song
            across every device you open it on, and readable with no signal.
          </p>
          <p>
            If you would rather read than click: the blog covers{' '}
            <Link href="/blog/chordpro-explained">what ChordPro is and why it outlives the app you type it in</Link>,{' '}
            <Link href="/blog/capo-second-fret">what a capo does to the key</Link>, and{' '}
            <Link href="/blog/transposing-to-fit-your-voice">what transposing changes and what it leaves alone</Link>.
          </p>
        </div>

        <PromoPanel />

        <Footer />
      </main>
    </>
  )
}
