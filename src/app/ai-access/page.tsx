import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AiAccessPanel } from '@/components/AiAccessPanel'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { requireAccount } from '@/lib/auth/session'
import { mcpEnabled } from '@/lib/mcp/enabled'

export const metadata: Metadata = { title: 'AI assistants' }

/**
 * Things to ask, as `AI Access.dc.html` rewrote them (2026-09-27), each one a job the eleven
 * tools can actually do (`lib/mcp/tools.ts`). Nothing deletes, and a song lives in one section:
 * «make a copy» and «create it as a songbook» mean new songs, which `SERVER_INSTRUCTIONS` tells
 * the assistant, so building a set never pulls songs out of the songbooks they were in.
 */
const EXAMPLES: { title: string; prompt: string }[] = [
  {
    title: 'Bring in a song from a photo',
    prompt:
      'Here’s a photo of a handwritten song sheet. Turn it into a song in my “Originals” songbook, with each chord over the syllable it’s written above. Tell me which chords or words you couldn’t read.',
  },
  {
    title: 'Organize a repertoire you just imported',
    prompt:
      'I just imported my whole archive into a songbook called “Imported”. Sort it into songbooks: one for the band, one for solo gigs, one for songs I’m still learning. Use the folder names and any comments in the songs as clues, and ask me about the ones you can’t place. Show me the plan before moving anything.',
  },
  {
    title: 'Clean up an archive from another app',
    prompt:
      'In my “Imported” songbook, the songs mark the chorus with a comment line like “# Chorus” and write chords in round brackets. Convert them to proper ChordPro: chorus sections and chords in square brackets. Do three songs first so I can check, then the rest.',
  },
  {
    title: 'Mark verses and chorus',
    prompt:
      'Open “Clementine”, label each verse (Verse 1, Verse 2) and mark the chorus. Where the chorus repeats, replace it with {chorus}. Don’t change any words or chords.',
  },
  {
    title: 'Make a copy in someone else’s key',
    prompt:
      'Anna sings “Amazing Grace” lower. Make a copy in my “Choir” songbook in D instead of G: rewrite every chord and update {key}. Leave the original as it is.',
  },
  {
    title: 'Make an easier version for a student',
    prompt:
      'Make a beginner’s copy of “House of the Rising Sun” in my “Lessons” songbook. Avoid barre chords, sevenths and slash chords unless the song really needs them. If a capo helps, set {capo}.',
  },
  {
    title: 'Build a set',
    prompt:
      'From all my songs, put together about 40 minutes for a wedding. Open with something upbeat, keep the slow ones in the middle, and don’t play two songs in the same key back to back. Show me the list, then create it as a songbook called “Wedding 12 Oct”.',
  },
  {
    title: 'Ask about your repertoire',
    prompt:
      'Which songs in my “Gig” songbook need a barre F? And which of my songs are in A minor or C, so I could play them as a medley?',
  },
  {
    title: 'Add the missing keys',
    prompt:
      'Add {key} to every song in “Gig” that doesn’t have one, working it out from the chords. Where it could be either of two keys, like C or A minor, ask me. Don’t guess tempo or time.',
  },
  {
    /* The mock said «into {artist}»; the artist is a field of its own and `guide.ts` tells the
       assistant never to write it into the text, so the prompt names the field instead. */
    title: 'Tidy a whole songbook',
    prompt:
      'Go through my “Band” songbook. Write A# as Bb throughout, and move the artist out of titles like “Song - Artist” into the artist field. List any songs that look like duplicates, but don’t delete anything.',
  },
]

export default async function AiAccessPage() {
  /* A session whose account no longer exists — see `requireAccount`. Silent for a visitor with
     no session at all, which is the middleware's case and not this one. */
  await requireAccount()

  /* Behind the same switch as the endpoint: a page of tokens nothing accepts would be the
     unlabelled promise /pricing is careful never to make. */
  if (!mcpEnabled()) notFound()

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="ai-access" />

      <main className="mx-auto max-w-4xl px-4 pb-12 pt-3">
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">AI assistants</h1>
          <p className="mt-2 max-w-2xl text-sm leading-[1.45] text-muted">
            Connect an AI assistant — Claude, Codex, Cursor, Gemini and others that speak MCP — to your songbooks, and ask it to
            transpose, format, tidy or add songs for you. It can never delete anything, and every song it changes keeps the
            previous text, which you can restore from the song&apos;s editor, under History.
          </p>
        </header>

        <AiAccessPanel />

        <section className="card mb-5 p-4">
          <h2 className="section-title mb-1">Things to ask</h2>
          <p className="mb-3 text-[0.8125rem] leading-[1.45] text-muted">
            Once your assistant is connected, ask in your own words and name the song or the songbook. A few to start from:
          </p>
          <ul className="ai-examples">
            {EXAMPLES.map((example) => (
              <li key={example.title}>
                <p className="ai-example-title">{example.title}</p>
                <p className="ai-example-prompt">“{example.prompt}”</p>
              </li>
            ))}
          </ul>
          <p className="ai-examples-foot">
            If an edit is not what you wanted, open the song, tap Edit, and restore the previous version from History. If
            you changed the song on your phone while the assistant was working, it is told to read it again rather than
            overwrite your change.
          </p>
        </section>

        <Footer />
      </main>
    </PrefsProvider>
  )
}
