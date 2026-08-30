/**
 * The public-domain songs offered as the one-click "Example songbook" for an empty
 * account (PLAN.md, "Canzoniere di esempio per i nuovi account").
 *
 * Kept as string constants in this module rather than as files under `content/`.
 * `content/` is only ever read from disk when there is no database
 * (`lib/data/files.ts`), which never happens on Vercel — `DATABASE_URL` is always
 * set there — so that directory has never actually needed to exist inside the
 * deployed serverless function, and Next's build has no reason to trace a
 * `readdir`/`readFile` over a computed path into it. A statically imported module is
 * bundled the same way in dev and in production, so there is nothing here that only
 * works on one of the two.
 */

import { parseChordPro } from '@/lib/chordpro'
import { slugify } from '@/lib/slug'

/** The name every account's example songbook is created with. Renamable afterwards, like any other. */
export const SAMPLE_SONGBOOK_NAME = 'Example songbook'

/**
 * Whether a songbook slug is one this app seeded rather than one a reader made.
 *
 * Asked of the **slug**, never of the name, and that is the whole reason this is
 * reliable: a slug is minted once at creation and renaming deliberately never touches
 * it (see `lib/slug.ts`), so this still answers correctly for someone who called their
 * copy "Songs for Tuesday" the day after signing up. `uniqueSlug` may have added a
 * numeric suffix, hence the prefix arm.
 *
 * Best-effort by nature: a reader who creates their own songbook and names it exactly
 * "Example songbook" gets the same slug and the same answer. The only thing that hangs
 * off it is a dismissible first-run note, so being generous there costs nothing.
 */
export function isSampleSongbookSlug(slug: string): boolean {
  const base = slugify(SAMPLE_SONGBOOK_NAME)
  return slug === base || slug.startsWith(`${base}-`)
}

/**
 * The first entry is an original Strumfolio composition, written for this purpose
 * (no rights to clear). The rest are traditional songs with no living author and no
 * active copyright — hymns and folk ballads old enough to be in the public domain
 * everywhere this app is used. Order here is the order songs are inserted in; sections
 * are created the first time one of their songs is reached.
 */
const SONG_BODIES: string[] = [
  `{title: Never Lose The Chord}
{artist: The Strumfolio Sessions}
{tags: original, strumfolio}
{division: Demo}

[C]I used to juggle tabs, a hundred open tabs
[G]Banner ads and popups, [Am]losing where I was
[F]Now it's in my pocket, [C]works without a signal
[G]Offline on a mountain, [Am]still it's [F]all here

{start_of_chorus}
[C]Strumfolio, take it anywhere
[G]No wifi, no worries, I don't care
[Am]Every song I love, one tap away
[F]Transpose it, [C]play it, [G]my [Am]way
{end_of_chorus}

[C]Capo's on the second, key of D I need
[G]One tap and it shifts, that's [Am]all it takes to lead
[F]My cousin sings it high, [C]I sing it kinda low
[G]Same chart, different key, [Am]that's the [F]way to go

{start_of_bridge}
[Am]No more scrolling ads
[F]No more squinting eyes
[C]Just me and my guitar
[G]Under open skies
{end_of_bridge}

{start_of_chorus}
[C]Strumfolio, take it anywhere
[G]No wifi, no worries, I don't care
[Am]Every song I love, one tap away
[F]Transpose it, [C]play it, [G]my [Am]way
{end_of_chorus}`,

  `{title: Amazing Grace}
{artist: Traditional (John Newton, 1779)}
{tags: hymn, gospel, folk}
{division: Hymns & Gospel}

[G]Amazing [G7]grace, how [C]sweet the [G]sound,
That [G]saved a [Em]wretch like [D]me.
[G]I once was [G7]lost, but [C]now am [G]found,
Was [Em]blind, but [D]now I [G]see.

'Twas [G]grace that [G7]taught my [C]heart to [G]fear,
And [G]grace my [Em]fears re[D]lieved.
How [G]precious [G7]did that [C]grace ap[G]pear
The [Em]hour I [D]first be[G]lieved.

Through [G]many [G7]dangers, [C]toils and [G]snares,
I [G]have al[Em]ready [D]come.
'Tis [G]grace hath [G7]brought me [C]safe thus [G]far,
And [Em]grace will [D]lead me [G]home.`,

  `{title: House of the Rising Sun}
{artist: Traditional}
{tags: folk, americana}
{division: Ballads & Folk Tales}

There [Am]is a [C]house in [D]New Or[F]leans
They [Am]call the [C]Rising [E]Sun
And it's [Am]been the [C]ruin of [D]many a poor [F]girl
And [Am]me, oh [E]God, [Am]I'm [E]one

My [Am]mother [C]was a [D]tailor [F]
She [Am]sewed my [C]new blue [E]jeans
My [Am]father [C]was a [D]gamblin' [F]man
Down [Am]in New Or[E]leans

Now the [Am]only [C]thing a [D]gambler [F]needs
Is a [Am]suitcase [C]and a [E]trunk
And the [Am]only [C]time he's [D]satisfied
Is [Am]when he's [E]on a [Am]drunk`,

  `{title: Whiskey in the Jar}
{artist: Traditional (Irish)}
{tags: folk, irish}
{division: Irish & Scottish Folk}

As [G]I was going over the [C]far famed Kerry [G]mountains
I [G]met with Captain Farrell and his [C]money he was [D]counting
I [G]first produced my pistol and I [C]then produced my [G]rapier
Saying [G]"Stand and deliver" for [C]he was the bold de[D]ceiver

{start_of_chorus}
[G]Musha ring dum a doo dum a [C]da
Whack for the [G]daddy-o
Whack for the [C]daddy-o
[G]There's whiskey [D]in the [G]jar
{end_of_chorus}

I [G]counted out his money and it [C]made a pretty [G]penny
I [G]put it in my pocket and I [C]took it home to [D]Jenny
She [G]sighed and she swore that she [C]never would de[G]ceive me
But the [G]devil take the women for they [C]never can be [D]easy

{start_of_chorus}
[G]Musha ring dum a doo dum a [C]da
Whack for the [G]daddy-o
Whack for the [C]daddy-o
[G]There's whiskey [D]in the [G]jar
{end_of_chorus}`,

  `{title: Danny Boy}
{artist: Traditional Irish air, lyrics by Frederick Weatherly (1913)}
{tags: ballad, irish}
{division: Irish & Scottish Folk}

Oh [D]Danny boy, the [G]pipes, the [D]pipes are [A]calling
From [D]glen to [A]glen, and [D]down the [G]mountain[D]side
The [G]summer's [D]gone, and [Em]all the [A]roses [D]falling
'Tis [G]you, 'tis [D]you must [A]go and [D]I must [A7]bide

But [D]come ye [G]back when [D]summer's [A]in the [D]meadow
Or [D]when the [A]valley's [D]hushed and [G]white with [D]snow
'Tis [G]I'll be [D]here in [Em]sunshine [A]or in [D]shadow
Oh [G]Danny [D]boy, oh [A]Danny [D]boy, I [A7]love you [D]so`,

  `{title: When the Saints Go Marching In}
{artist: Traditional gospel}
{tags: gospel, jazz, new orleans}
{division: Hymns & Gospel}

Oh [C]when the [F]saints [C]go marching [G7]in
Oh [C]when the [F]saints go [C]marching [G7]in
Oh [C]Lord I [F]want to [C]be in that [G7]number
When the [C]saints [F]go [C]marching [G7]in [C]

And [C]when the [F]sun [C]refuse to [G7]shine
And [C]when the [F]sun re[C]fuse to [G7]shine
Oh [C]Lord I [F]want to [C]be in that [G7]number
When the [C]saints [F]go [C]marching [G7]in [C]

Oh [C]when the [F]trumpet [C]sounds the [G7]call
Oh [C]when the [F]trumpet [C]sounds the [G7]call
Oh [C]Lord I [F]want to [C]be in that [G7]number
When the [C]saints [F]go [C]marching [G7]in [C]`,

  `{title: Scarborough Fair}
{artist: Traditional English ballad}
{tags: folk, ballad, english}
{division: Ballads & Folk Tales}

Are you [Am]going to [C]Scarborough [G]Fair?
[Am]Parsley, [C]sage, rose[G]mary and [Am]thyme
Remember [Am]me to [C]one who lives [G]there
[Am]For once she [C]was a true [Am]love of mine

Tell her to [Am]make me a [C]cambric [G]shirt
[Am]Parsley, [C]sage, rose[G]mary and [Am]thyme
Without any [Am]seam nor [C]needlework [G]
[Am]And then she'll be a [C]true love of [Am]mine

Tell her to [Am]find me an [C]acre of [G]land
[Am]Parsley, [C]sage, rose[G]mary and [Am]thyme
Between the salt [Am]water and the [C]sea [G]sand
[Am]And then she'll be a [C]true love of [Am]mine`,

  `{title: Waltzing Matilda}
{artist: Traditional (words by Banjo Paterson, 1895)}
{tags: folk, australian}
{division: Ballads & Folk Tales}

Once a [D]jolly swagman [G]camped by a [D]billabong
[G]Under the shade of a [D]coolibah [A7]tree
And he [D]sang as he watched and [G]waited 'til his [D]billy boiled
"You'll come a-[A7]waltzing Matilda, with [D]me"

{start_of_chorus}
[D]Waltzing Ma[G]tilda, [D]waltzing Ma[A7]tilda
You'll come a-[D]waltzing Ma[G]tilda, with [D]me
And he [D]sang as he watched and [G]waited 'til his [D]billy boiled
"You'll come a-[A7]waltzing Matilda, with [D]me"
{end_of_chorus}

Down came a [D]jumbuck to [G]drink at the [D]billabong
[G]Up jumped the swagman and [D]grabbed him with [A7]glee
And he [D]sang as he stowed that [G]jumbuck in his [D]tucker bag
"You'll come a-[A7]waltzing Matilda, with [D]me"

{start_of_chorus}
[D]Waltzing Ma[G]tilda, [D]waltzing Ma[A7]tilda
You'll come a-[D]waltzing Ma[G]tilda, with [D]me
And he [D]sang as he watched and [G]waited 'til his [D]billy boiled
"You'll come a-[A7]waltzing Matilda, with [D]me"
{end_of_chorus}`,

  `{title: Auld Lang Syne}
{artist: Robert Burns (1788), traditional Scottish air}
{tags: folk, scottish, new year}
{division: Irish & Scottish Folk}

Should [D]auld ac[G]quaintance [D]be forgot
And [D]never [A]brought to [D]mind?
Should [D]auld ac[G]quaintance [D]be forgot
And [A]auld lang [D]syne?

{start_of_chorus}
For [D]auld lang [G]syne, my [D]dear
For [D]auld lang [A]syne
We'll [D]take a cup o' [G]kindness [D]yet
For [A]auld lang [D]syne
{end_of_chorus}

And [D]surely you'll buy your [G]pint cup
And [D]surely I'll buy [A]mine
And [D]we'll take a cup o' [G]kindness [D]yet
For [A]auld lang [D]syne

{start_of_chorus}
For [D]auld lang [G]syne, my [D]dear
For [D]auld lang [A]syne
We'll [D]take a cup o' [G]kindness [D]yet
For [A]auld lang [D]syne
{end_of_chorus}`,
]

export interface SampleSong {
  title: string
  artist: string | null
  tags: string[]
  sectionName: string | null
  body: string
}

/** Parsed fresh on every call — cheap for eight short songs, and never mutated by a caller. */
export function sampleSongs(): SampleSong[] {
  return SONG_BODIES.map((body) => {
    const parsed = parseChordPro(body)
    return {
      title: parsed.title ?? 'Untitled',
      artist: parsed.artist,
      tags: parsed.tags,
      sectionName: parsed.sectionName,
      body,
    }
  })
}
