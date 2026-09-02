import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { ImageResponse } from 'next/og'

import { APP_NAME, SITE_URL } from '@/lib/brand'
import { CARD_HEIGHT, CARD_WIDTH } from '@/lib/blog/openGraph'
import { loadPost, publishedSlugs } from '@/lib/blog/posts'

/**
 * The social card for an article that has no cover image of its own.
 *
 * It exists so that publishing never waits on somebody sourcing a picture: an article with a
 * cover uses it, and one without gets its title set on the brand's own ground instead of the
 * nothing that a missing `og:image` produces — which is what a link shared with no card looks
 * like, and it reads as a broken site rather than as a plain one.
 *
 * **A plain route rather than the `opengraph-image` file convention**, deliberately. That
 * convention attaches an image to *every* article automatically, which would fight the covers
 * instead of backing them up: `lib/blog/openGraph.ts` has to be the one place that decides
 * cover-or-generated, and it can only decide if the other option does not also apply itself.
 *
 * Prerendered at build (`force-static` plus the params below), so the font is read from the
 * repository while the repository is still there — nothing here runs, or reads a file, in
 * production.
 */
export const dynamicParams = false
export const dynamic = 'force-static'

export async function generateStaticParams() {
  return (await publishedSlugs()).map((slug) => ({ slug }))
}

/**
 * Outfit, as bytes.
 *
 * `ImageResponse` cannot be handed a `next/font/google` handle — that is a class name and a
 * CSS rule, and this renders no CSS — so the font has to exist as a file. It is vendored at
 * `src/lib/blog/fonts/` rather than in `public/` for a reason worth keeping: `publicEntries()`
 * in `next.config.ts` walks `public/` recursively and precaches what it finds, so a font
 * there would be downloaded by every installation of the PWA to draw something no reader ever
 * sees. Licence: SIL OFL, shipped beside them as `OFL.txt`.
 *
 * **Two static instances rather than the one variable file Google publishes**, and this is
 * not a preference. Satori — what `ImageResponse` renders with — cannot read a variable font:
 * it fails inside the glyph tables with `Cannot read properties of undefined`, which surfaces
 * as a prerender error naming the page and not the cause. The instances were cut from the
 * variable original with `fonttools varLib.instancer` at `wght=400` and `wght=600`.
 */
async function outfit(weight: 'Regular' | 'SemiBold'): Promise<ArrayBuffer> {
  const file = await readFile(path.join(process.cwd(), 'src', 'lib', 'blog', 'fonts', `Outfit-${weight}.ttf`))
  return Uint8Array.from(file).buffer
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { meta } = await loadPost(slug)

  return new ImageResponse(
    (
      /*
       * Inline styles and flexbox only: this is Satori, not a browser — it supports a subset
       * of CSS and no stylesheet of ours reaches it, so the app's tokens are repeated here as
       * literals. The colours are `paper-bg`, `ink` and `chord-terracotta` from `DESIGN.md`;
       * if those ever move, this is a place that does not follow on its own.
       */
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#f6f5f2',
          padding: '72px 80px',
          fontFamily: 'Outfit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#97490f' }} />
          <div style={{ fontSize: 30, fontWeight: 600, color: '#5c626c', letterSpacing: '0.02em' }}>{APP_NAME}</div>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: meta.title.length > 70 ? 60 : 74,
            fontWeight: 600,
            lineHeight: 1.15,
            color: '#16181d',
            /* Satori has no `text-wrap: balance`; a long title simply wraps, and the size
             * step above is what keeps a four-line one inside the card. */
            maxWidth: '100%',
          }}
        >
          {meta.title}
        </div>

        <div style={{ display: 'flex', fontSize: 26, color: '#8d939c' }}>{SITE_URL}/blog</div>
      </div>
    ),
    {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      fonts: [
        { name: 'Outfit', data: await outfit('Regular'), weight: 400, style: 'normal' },
        { name: 'Outfit', data: await outfit('SemiBold'), weight: 600, style: 'normal' },
      ],
    },
  )
}
