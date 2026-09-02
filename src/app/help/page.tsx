import type { Metadata } from 'next'
import Link from 'next/link'

import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'

export const metadata: Metadata = { title: 'Help' }

/**
 * A plain guide to using the app, reachable from the menu on every screen.
 *
 * Static, like Export's own shell: nothing here depends on who is asking or what
 * their repertoire holds, so there is nothing to wait for after mount. `.legal-content`
 * is reused rather than duplicated — it is already exactly this, a set of rules for
 * long-form headings and paragraphs, and nothing about them is specific to the four
 * pages that happened to need it first.
 */
export default function HelpPage() {
  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="help" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <article className="legal-content">
          <h1>Help</h1>
          <p className="legal-updated">A short guide to the basics — start to finish takes about five minutes.</p>

          <p>
            <a href="#songbooks">1. Create your first songbook</a>
            <br />
            <a href="#add-songs">2. Add your songs</a>
            <br />
            <a href="#sections">3. Organize with sections</a>
            <br />
            <a href="#reading">4. Read and play</a>
            <br />
            <a href="#strum-together">5. Strum Together</a>
            <br />
            <a href="#export">6. Backup and export</a>
            <br />
            <a href="#offline">7. Offline and on your phone</a>
            <br />
            <a href="#account">8. Your account</a>
          </p>

          <h2 id="songbooks">1. Create your first songbook</h2>
          <p>
            A songbook is a folder for a set of songs — a repertoire, a setlist, whatever grouping
            makes sense to you. From the home screen, tap <strong>New songbook</strong>, give it a
            name, and it&apos;s ready — already holding one section for songs to go into.
          </p>
          <p>You can create as many songbooks as you like, and rename or reorder them at any time.</p>

          <h2 id="add-songs">2. Add your songs</h2>
          <p>Open a songbook and add songs one of two ways:</p>
          <ul>
            <li>
              <strong>Paste text.</strong> The fastest way in. Paste lyrics with chords, and the app
              figures out the format on its own — if it&apos;s already ChordPro (chords in{' '}
              <code>[square brackets]</code>, right where they fall in the line) it&apos;s used as is;
              otherwise, chords written above the lyrics are converted automatically. Pasting several
              songs at once works too — separate each one with a line that just says{' '}
              <code>---</code>. Nothing is saved until you&apos;ve reviewed it: one song shows a full
              editable preview, several show a list where you can fix a wrong title or artist, exclude
              one, or edit the words before saving.
            </li>
            <li>
              <strong>Write one by hand.</strong> Use <strong>New song</strong> and type directly in
              ChordPro — a chord name in square brackets right before the syllable it belongs to, for
              example <code>That [G]saved a [Em]wretch like [D]me</code>. A live preview next to
              the box shows exactly how it will look while you type.
            </li>
          </ul>
          <p>
            Pasting or typing a song that&apos;s already in the songbook offers to replace it or add
            it as a second copy, rather than silently overwriting anything.
          </p>
          <p>
            <Link href="/help/chordpro" className="underline underline-offset-2">
              The full ChordPro reference
            </Link>{' '}
            covers every directive Strumfolio reads and writes, for converting a whole collection at
            once or handing to an AI doing the converting instead.
          </p>

          <h2 id="sections">3. Organize with sections</h2>
          <p>
            Inside a songbook, songs are grouped into sections — a first set and an encore, a
            rehearsal order, whatever divides your repertoire the way you think about it. Add a
            section, rename it, and drag songs into the one they belong to. Songbooks, sections, and
            the songs inside them can all be reordered by dragging.
          </p>

          <h2 id="reading">4. Read and play</h2>
          <p>
            Open any song to read it. The bar at the bottom is the one you&apos;ll reach for mid-song:
            play/pause starts auto-scroll at a speed you set with the turtle-to-hare slider next to it.
          </p>
          <p>
            Everything you&apos;d only change before playing, not during, lives behind the{' '}
            <strong>Chords and text</strong> button:
          </p>
          <ul>
            <li><strong>Key</strong> — move the song up or down a semitone at a time, or back to how it was written.</li>
            <li>
              <strong>Capo</strong> — tap the fret you have it on, or apply the suggested position,
              which finds the fret that lets you play the most open chords for the current key. The
              arrow at the end of the row reaches the frets above the sixth.
            </li>
            <li><strong>Chords as</strong> — chords as their name, or as a diagram of where to put your fingers.</li>
            <li><strong>Instrument</strong> — which instrument those diagrams are for: guitar, or ukulele on a paid plan.</li>
            <li><strong>Text size</strong> — how big the words are on screen.</li>
          </ul>
          <p>
            Tap any chord on the sheet to see it up close, drawn for whichever instrument you
            picked. Which alphabet the chords are written in is not here but in your account
            menu, under Settings — it is how you read every song rather than something about
            this one. There are four: Do-Re-Mi, C-D-E, the German convention (H for B, B for B
            flat), and Nashville numbers, where each chord is written as its degree of the key
            and so reads the same however far you have transposed the song.
          </p>

          <h2 id="strum-together">5. Strum Together</h2>
          <p>
            Share a song live with people around you, on their own phones — no account needed on
            their side. Open <strong>Strum together</strong> from the menu and start broadcasting: you
            get a link and a QR code, either one gets someone in. Once they&apos;ve joined, press play
            on whatever song you want everyone to see — it appears on every connected screen, in the
            same key, live.
          </p>

          <h2 id="export">6. Backup and export</h2>
          <p>
            From <strong>Export</strong> in the menu: <strong>Backup</strong> downloads your entire
            repertoire as a zip, a safety copy that&apos;s yours to keep. <strong>Organized
            export</strong> downloads the same songs sorted into folders by songbook and section,
            meant for reading outside the app rather than bringing back in.
          </p>

          <h2 id="offline">7. Offline and on your phone</h2>
          <p>
            Once a song is saved, it stays available with no connection at all — open it on stage or
            anywhere else with no signal, and it&apos;s there. No app store or install step either:
            open the site on your phone once, and from then on it behaves like any other app on the
            home screen.
          </p>

          <h2 id="account">8. Your account</h2>
          <p>
            Sign in with Google, or with an email and password. Whichever address you use, it has its
            own songbooks and songs — separate from anyone else&apos;s, private by default.
          </p>
        </article>

        <Footer />
      </main>
    </PrefsProvider>
  )
}
