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
 * Things to ask, each one a job the eleven tools can actually do (`lib/mcp/tools.ts`). Worded so
 * none needs a tool that does not exist: nothing deletes, and `move_song` *moves* — there is no
 * copy — so no example builds a set by gathering songs out of other songbooks.
 */
const EXAMPLES: { title: string; prompt: string }[] = [
  {
    title: 'Transpose a song',
    prompt: 'Transpose “Amazing Grace” in my Strumfolio from G to D. Rewrite every chord, update {key}, and leave the capo alone.',
  },
  {
    title: 'Turn a pasted song into ChordPro',
    prompt:
      'Here are the words and chords of a song I wrote, with the chords on the line above the words. Turn it into ChordPro with the chords in square brackets, mark the verses and the chorus, and add it to my “Originals” songbook.',
  },
  {
    title: 'Mark verses and chorus',
    prompt: 'Open “Scarborough Fair”, mark each verse and the chorus, and replace every repeat of the chorus with {chorus}. Do not change any words.',
  },
  {
    title: 'Fill in the missing song data',
    prompt: 'Go through the songs in my “Gig” songbook and add {key}, {tempo} and {time} where they are missing. Ask me before writing anything you are not sure of.',
  },
  {
    title: 'Get a set ready for rehearsal',
    prompt:
      'For every song in the “Rehearsal” section, add a comment at the top saying which capo lets me play it with open chords, and which chords are barre chords.',
  },
  {
    title: 'Find and fix',
    prompt: 'Find my songs that mention “river” and check that each chord sits right before the syllable it falls on. Show me what you would change before saving.',
  },
  {
    title: 'Tidy the songbooks',
    prompt: 'Create a section called “Encores” at the end of my “Live” songbook and move “Hallelujah” and “Wonderwall” into it.',
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
          <ul className="grid gap-2">
            {EXAMPLES.map((example) => (
              <li key={example.title} className="rounded-row border border-line-soft p-3">
                <p className="text-sm font-medium">{example.title}</p>
                <p className="mt-1 text-[0.8125rem] leading-[1.45] text-muted">“{example.prompt}”</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.8125rem] leading-[1.45] text-muted">
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
