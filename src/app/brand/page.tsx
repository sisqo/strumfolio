import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CopyUrl } from '@/components/CopyUrl'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { auth } from '@/auth'
import { isOwner } from '@/lib/allowlist'
import { APP_NAME } from '@/lib/brand'
import { type KitFile, formatBytes, kitFolders, kitHref, kitUrl } from '@/lib/brandKit'

export const metadata: Metadata = { title: 'Brand' }

/** The owner check depends on the request session, same as `/design-system` and `/emails`. */
export const dynamic = 'force-dynamic'

/** Intrinsic sizes, straight off each file's `viewBox` — see `Shot` for what they are for. */
const LOCKUP_H = { w: 2336, h: 344 }
const LOCKUP_V = { w: 1688, h: 804 }
const MARK = { w: 499, h: 344 }
const GLYPH = { w: 369, h: 262 }
const NOTE = { w: 119, h: 179 }
const WORDMARK = { w: 1688, h: 281 }
const SQUARE = { w: 512, h: 512 }

/**
 * The palette, as the asset drop names it.
 *
 * Brown and Orange are `--accent`'s two theme values, to the digit — the app's accent and
 * the logo's tile are one colour, which is why `IconNote` inherits `--accent` instead of
 * carrying a hex of its own. Ink is the logo's alone: it is the glyph knocked out of the
 * orange tile, and nothing in the interface uses it.
 */
const PALETTE = [
  { name: 'Brown', hex: '#97490F', use: 'The tile, the theme colour, and this app’s light-theme accent.' },
  { name: 'Orange', hex: '#F1B369', use: 'The tile on a dark ground, and the dark-theme accent.' },
  { name: 'Ink', hex: '#231F20', use: 'The glyph, when the tile under it is orange.' },
  { name: 'Black', hex: '#000000', use: 'The lettering on a light ground.' },
  { name: 'White', hex: '#FFFFFF', use: 'The lettering on a dark ground, and the glyph on brown.' },
]

/**
 * The four app icons, all 512, all the same drawing on a different tile — which is the one
 * thing a table of icon files never says and the reason this page shows them side by side.
 */
const APP_ICONS = [
  { file: 'svg/icon-rounded.svg', name: 'Rounded', use: 'Corners already rounded, corners transparent — in-app and on the web, where nothing will round it for you.' },
  { file: 'svg/icon-square.svg', name: 'Square', use: 'Full-bleed to the edge, for iOS, Android and macOS, which round it themselves.' },
  { file: 'svg/icon-light.svg', name: 'Light', use: 'Orange tile, dark glyph — for a dark interface, where the brown tile disappears into the page.' },
  { file: 'svg/icon-maskable.svg', name: 'Maskable', use: 'The glyph pulled inside the middle 60%, so Android can crop this to any shape and lose none of it.' },
]

/** Actual size, in a row, because that is the whole argument for the note-only pair. */
const FAVICONS = [
  { file: 'web/favicon-16x16.png', px: 16, note: 'note only' },
  { file: 'web/favicon-32x32.png', px: 32, note: 'note only' },
  { file: 'web/favicon-48x48.png', px: 48, note: 'full mark' },
  { file: 'web/favicon-96x96.png', px: 96, note: 'full mark' },
]

/**
 * Everything the owner ever needs from the brand, at a URL.
 *
 * The page exists because the alternative is a folder: `public/brand/kit/` holds a hundred
 * and forty files, and knowing which of four horizontal lockups to reach for is exactly the
 * thing a directory listing cannot tell you. So each one is shown on the ground it was drawn
 * for, next to the one sentence that says when it is the right file — and then, at the
 * bottom, the whole drop listed without commentary for whoever already knows.
 *
 * Owner-only like `/accounts`, `/emails` and `/design-system` — `notFound()` rather than a
 * role notice, the same reasoning as those: "this does not exist" and "this is not yours"
 * should look identical from outside. The files under `/brand/kit/` stay reachable with no
 * session regardless (`middleware.ts`) — a store, a designer, an email client all still need
 * them — only this index of them is gated.
 */
export default async function BrandPage() {
  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) notFound()

  const folders = kitFolders()
  const byPath = new Map<string, KitFile>(
    folders.flatMap((folder) => folder.files.map((file) => [file.relative, file])),
  )

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="brand" />

      <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        <header className="max-w-[42rem]">
          <h1 className="screen-title">Brand</h1>

          <p className="brand-lede">
            <Link href="/" className="text-accent hover:underline">
              {APP_NAME}
            </Link>
            ’s logo, app icons and palette, hosted here for anything outside the app that needs
            them — a store listing, a slide, a signature, someone else’s stylesheet.
          </p>

          <p className="brand-lede-note">
            Link straight to a file rather than keeping a copy of it: these URLs stay put, and a
            copy on someone else’s drive is a copy of whatever the logo used to look like. The
            whole drop sits under <code className="brand-code">/brand/kit/</code>, and{' '}
            <a href={kitHref('README.md')} className="text-accent hover:underline">
              its own README
            </a>{' '}
            is the file-by-file index.
          </p>
        </header>

        {folders.length === 0 ? (
          <p className="brand-empty">
            The kit is not in this build. <code className="brand-code">public/brand/kit/</code> is
            where it goes — every path below is read off that folder at build time, so an empty
            checkout shows an empty page rather than a list of dead links.
          </p>
        ) : null}

        {/* ---- The lockup ------------------------------------------------ */}

        <section className="mt-11 sm:mt-14">
          <h2 className="section-title">The lockup</h2>
          <p className="brand-text">
            Two files, never one recoloured: the lettering is black for a light ground and white
            for a dark one. The mark and the wordmark are one image on purpose — the space
            between them is part of the drawing, not something to set by hand.
          </p>

          <SpecimenPair
            light="svg/lockup-horizontal-black.svg"
            dark="svg/lockup-horizontal-white.svg"
            alt="the Strumfolio horizontal lockup: the note-and-book tile beside the wordmark"
            size={LOCKUP_H}
            cap="17rem"
            byPath={byPath}
            /* The one specimen above the fold on every width, and this page's largest paint. */
            eager
          />

          <p className="brand-text mt-9">
            Stacked instead of side by side, for a column rather than a row — this is what heads
            the sign-in pages in this app.
          </p>

          <SpecimenPair
            light="svg/lockup-vertical-black.svg"
            dark="svg/lockup-vertical-white.svg"
            alt="the Strumfolio vertical lockup: the tile above the wordmark"
            size={LOCKUP_V}
            cap="9.5rem"
            byPath={byPath}
          />

          <h3 className="brand-subhead">Two more of each, for two specific jobs</h3>

          <div className="brand-pair">
            <div>
              <Specimen>
                <Ground tone="surface">
                  <Shot
                    file="svg/lockup-horizontal-adaptive.svg"
                    alt="the horizontal lockup in its adaptive variant"
                    size={LOCKUP_H}
                    cap="15rem"
                  />
                </Ground>
              </Specimen>
              <p className="brand-note">
                <strong>Adaptive.</strong> The switch happens inside the file, off{' '}
                <code className="brand-code">prefers-color-scheme</code>, so one tag covers both
                grounds. Reach for it where you cannot ship two files and a CSS rule — a README,
                someone else’s CMS. Not what this app uses, because what an{' '}
                <code className="brand-code">&lt;img&gt;</code> is told depends on the browser:
                Chromium hands the image the page’s own colour scheme, and one that hands it the
                operating system’s instead paints white lettering onto a white page for a reader
                who chose light.
              </p>
              <AssetLine relative="svg/lockup-horizontal-adaptive.svg" byPath={byPath} />
              <AssetLine relative="svg/lockup-vertical-adaptive.svg" byPath={byPath} />
            </div>

            <div>
              <Specimen>
                <Ground tone="surface">
                  <Tint
                    file="svg/lockup-horizontal-mono.svg"
                    label="the horizontal lockup in one colour"
                    size={LOCKUP_H}
                    cap="15rem"
                  />
                </Ground>
              </Specimen>
              <p className="brand-note">
                <strong>Mono.</strong> Every shape in{' '}
                <code className="brand-code">currentColor</code>, with the glyph knocked out of
                the tile rather than painted on it. Inline the SVG, or paint it through a CSS
                mask the way this specimen does — an <code className="brand-code">&lt;img&gt;</code>{' '}
                cannot inherit the colour of the text beside it.
              </p>
              <AssetLine relative="svg/lockup-horizontal-mono.svg" byPath={byPath} />
              <AssetLine relative="svg/lockup-vertical-mono.svg" byPath={byPath} />
            </div>
          </div>
        </section>

        {/* ---- Mark, glyph, wordmark ------------------------------------- */}

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Mark, glyph, wordmark</h2>
          <p className="brand-text">
            The three pieces on their own, for the places a full lockup does not fit: an avatar,
            a favicon, a stamp on a corner.
          </p>

          <SpecimenPair
            light="svg/mark.svg"
            dark="svg/mark-light.svg"
            alt="the Strumfolio mark: a note over an open book, on a rounded tile"
            size={MARK}
            cap="7rem"
            byPath={byPath}
          />

          <h3 className="brand-subhead">Without a tile, in your own colour</h3>
          <p className="brand-text">
            These three carry no colour of their own: they are{' '}
            <code className="brand-code">currentColor</code> on a transparent ground, tinted here
            with this page’s own text colour.
          </p>

          <div className="tint-row">
            <Specimen>
              <Ground tone="surface">
                <Tint file="svg/glyph.svg" label="the note and open book, without a tile" size={GLYPH} cap="6.5rem" />
              </Ground>
            </Specimen>
            <Specimen>
              <Ground tone="surface">
                <Tint file="svg/note.svg" label="the note alone" size={NOTE} cap="2.75rem" />
              </Ground>
            </Specimen>
            <Specimen>
              <Ground tone="surface">
                <Tint file="svg/wordmark.svg" label="the Strumfolio wordmark" size={WORDMARK} cap="12rem" />
              </Ground>
            </Specimen>
          </div>

          <div className="brand-lines">
            <AssetLine relative="svg/glyph.svg" byPath={byPath} note="note and book" />
            <AssetLine relative="svg/note.svg" byPath={byPath} note="the note alone" />
            <AssetLine relative="svg/wordmark.svg" byPath={byPath} note="lettering only" />
            <AssetLine relative="svg/mark-mono.svg" byPath={byPath} note="the badge in one colour" />
          </div>
        </section>

        {/* ---- Icons ----------------------------------------------------- */}

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Icons</h2>
          <p className="brand-text">
            Four tiles, one drawing. Which one you want depends entirely on what is going to
            round the corners, and on how dark the surface behind it is.
          </p>

          <div className="icon-grid">
            {APP_ICONS.map((icon) => (
              <div key={icon.file} className="icon-cell">
                <Specimen>
                  <Ground tone={icon.name === 'Light' ? 'night' : 'paper'}>
                    <Shot file={icon.file} alt={`the ${icon.name.toLowerCase()} app icon`} size={SQUARE} cap="4.5rem" />
                  </Ground>
                </Specimen>
                <h3 className="icon-cell-name">{icon.name}</h3>
                <p className="brand-note">{icon.use}</p>
                <AssetLine relative={icon.file} byPath={byPath} />
              </div>
            ))}
          </div>

          <h3 className="brand-subhead">Favicons, at the size they are actually drawn</h3>
          <p className="brand-text">
            Below roughly 48 pixels the open book stops reading as a book and turns into three
            grey strokes. That is the whole reason the two small favicons are the note alone
            rather than the same mark scaled down.
          </p>

          <Specimen>
            <Ground tone="paper">
              <div className="favicon-row">
                {FAVICONS.map((favicon) => (
                  <div key={favicon.file} className="favicon-cell">
                    <Shot
                      file={favicon.file}
                      alt={`the ${favicon.px} pixel favicon`}
                      size={{ w: favicon.px, h: favicon.px }}
                      cap={`${favicon.px}px`}
                      exact
                    />
                    <span className="favicon-cell-label">
                      {favicon.px}px
                      <span className="favicon-cell-note">{favicon.note}</span>
                    </span>
                  </div>
                ))}
              </div>
            </Ground>
          </Specimen>

          <div className="brand-lines">
            <AssetLine relative="web/favicon.svg" byPath={byPath} note="what a modern browser picks first" />
            <AssetLine relative="web/favicon.ico" byPath={byPath} note="16, 32 and 48 in one file, as a fallback" />
            <AssetLine relative="web/apple-touch-icon.png" byPath={byPath} note="180×180, no transparency — iOS rounds it" />
            <AssetLine relative="web/icon-192.png" byPath={byPath} note="PWA, purpose any" />
            <AssetLine relative="web/icon-512.png" byPath={byPath} note="PWA, purpose any" />
            <AssetLine relative="web/maskable-icon-512.png" byPath={byPath} note="PWA, purpose maskable" />
            <AssetLine
              relative="ios/AppIcon.appiconset/Contents.json"
              byPath={byPath}
              note="the whole appiconset is in the list below — drag the folder into Assets.xcassets"
            />
          </div>
        </section>

        {/* ---- Social ---------------------------------------------------- */}

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Link previews and social</h2>
          <p className="brand-text">
            Ready-made cards: 1200×630 for a link preview, 1200×1200 for the places that want a
            square. Three grounds for the wide one, because a card sits on whatever the app
            showing it decides.
          </p>

          <div className="card-row">
            {[
              { file: 'web/og-image-brand.png', name: 'Brand', note: 'What this site’s own cards use.' },
              { file: 'web/og-image-light.png', name: 'Light', note: 'Black lettering on white.' },
              { file: 'web/og-image-dark.png', name: 'Dark', note: 'White lettering on near-black.' },
            ].map((card) => (
              <figure key={card.file} className="card-cell">
                <Shot file={card.file} alt={`the ${card.name.toLowerCase()} link-preview card`} size={{ w: 1200, h: 630 }} cap="100%" framed />
                <figcaption>
                  <span className="card-cell-name">{card.name}</span>
                  <span className="brand-note">{card.note}</span>
                  <AssetLine relative={card.file} byPath={byPath} />
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="card-row is-square">
            {[
              { file: 'web/social-square-light.png', name: 'Square, light' },
              { file: 'web/social-square-dark.png', name: 'Square, dark' },
            ].map((card) => (
              <figure key={card.file} className="card-cell">
                <Shot file={card.file} alt={`the ${card.name.toLowerCase()} square`} size={{ w: 1200, h: 1200 }} cap="100%" framed />
                <figcaption>
                  <span className="card-cell-name">{card.name}</span>
                  <AssetLine relative={card.file} byPath={byPath} />
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* ---- Palette --------------------------------------------------- */}

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Palette</h2>
          <p className="brand-text">
            Five values, and only the first two are ever a background. Brown and Orange are this
            app’s own accent in its two themes, to the digit — the colour that marks a chord on a
            song sheet is the colour of the tile.
          </p>

          <ul className="swatch-grid">
            {PALETTE.map((colour) => (
              <li key={colour.hex} className="swatch">
                {/* The one place a literal hex is the content rather than a style: this is the value. */}
                <span className="swatch-chip" style={{ background: colour.hex }} aria-hidden />
                <span className="swatch-name">{colour.name}</span>
                <span className="swatch-hex font-mono">{colour.hex}</span>
                <span className="brand-note">{colour.use}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- Rules ----------------------------------------------------- */}

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Using it</h2>

          <ul className="rule-list">
            <li>
              <strong>Leave it room.</strong> Every <code className="brand-code">viewBox</code> is
              cropped to the ink, with no padding built in — clear space is yours to add. Half the
              height of the tile, on all four sides, is enough.
            </li>
            <li>
              <strong>Scale, never stretch.</strong> Set one dimension and let the other follow:
              2336×344 for the horizontal lockup, 1688×804 for the vertical, 499×344 for the mark.
            </li>
            <li>
              <strong>Pick the file for the ground.</strong> Black lettering on light, white on
              dark, and neither one recoloured to bridge the gap. On a photograph or a mid-tone,
              use the mark on its own tile rather than the lockup.
            </li>
            <li>
              <strong>Small means the note.</strong> Under about 48 pixels the book closes up.
              Below that use <code className="brand-code">note.svg</code> or the 16 and 32 pixel
              favicons, which are drawn for it.
            </li>
            <li>
              <strong>Don’t rebuild it.</strong> No shadows, outlines, gradients or rotations, and
              no setting the wordmark next to the mark yourself — the lockup files exist so that
              spacing is never a decision anyone has to make twice.
            </li>
          </ul>
        </section>

        {/* ---- Every file ------------------------------------------------ */}

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Every file</h2>
          <p className="brand-text">
            The drop as delivered, read off the folder itself. There is no archive to download:
            link to the file you need.
          </p>

          {folders.map((folder) => (
            <div key={folder.name} className="kit-folder">
              <h3 className="kit-folder-name font-mono">{folder.name === '' ? '/' : `${folder.name}/`}</h3>
              <p className="kit-folder-count">
                {folder.files.length} {folder.files.length === 1 ? 'file' : 'files'} ·{' '}
                {formatBytes(folder.files.reduce((total, file) => total + file.bytes, 0))}
              </p>

              <ul className="kit-file-list">
                {folder.files.map((file) => (
                  <li key={file.relative} className="kit-file">
                    <a href={file.href} className="kit-file-name font-mono">
                      {file.name}
                    </a>
                    <span className="kit-file-size">{formatBytes(file.bytes)}</span>
                    <CopyUrl url={file.url} name={file.name} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <Footer />
      </main>
    </PrefsProvider>
  )
}

/* -------------------------------------------------------------------------- */

interface Size {
  w: number
  h: number
}

/**
 * One asset, drawn.
 *
 * `width`/`height` carry the file's own intrinsic size — off the `viewBox` for the SVGs,
 * off the pixels for the PNGs — so the browser knows the shape before the bytes arrive and
 * nothing on the page jumps as they land. `cap` is what CSS then scales it to.
 *
 * `exact` is for the favicon row, which is the one place on this page where a pixel is
 * meant to be a pixel: no scaling, no upscaling, the file at its own size.
 *
 * Everything is lazy except what `eager` marks: the first specimen is above the fold on
 * every screen size and is this page's largest paint, so deferring it would be deferring
 * the thing the reader is waiting for.
 */
function Shot({
  file,
  alt,
  size,
  cap,
  exact = false,
  framed = false,
  eager = false,
}: {
  file: string
  alt: string
  size: Size
  cap: string
  exact?: boolean
  framed?: boolean
  eager?: boolean
}) {
  /*
   * A static file under `public/`, drawn at a size this page has already decided:
   * `next/image` has no source set to pick between and no format to convert an SVG into,
   * which is the same reason the lockups in `TopBar.tsx` are plain `<img>` too. Every
   * image on this page goes through here, so the rule is switched off once rather than at
   * thirty call sites.
   */
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- see above */
    <img
      src={kitHref(file)}
      alt={alt}
      width={size.w}
      height={size.h}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : undefined}
      decoding="async"
      className={`shot${exact ? ' is-exact' : ''}${framed ? ' is-framed' : ''}`}
      style={{ '--shot-cap': cap } as React.CSSProperties}
    />
  )
}

/**
 * An asset painted in the colour of the text around it, through a CSS mask.
 *
 * The three `currentColor` files cannot show what they are as an `<img>`: that is a separate
 * document, so `currentColor` resolves to its own default and the file arrives black no
 * matter what it sits next to. A mask paints `currentColor` *through* the shape instead,
 * which is both the honest specimen and the technique the page recommends for using them.
 */
function Tint({ file, label, size, cap }: { file: string; label: string; size: Size; cap: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className="tint-shot"
      style={
        {
          '--tint-src': `url("${kitHref(file)}")`,
          '--shot-cap': cap,
          aspectRatio: `${size.w} / ${size.h}`,
        } as React.CSSProperties
      }
    />
  )
}

/** The frame every specimen shares: one surface, its own edge, nothing inside it styled. */
function Specimen({ children }: { children: React.ReactNode }) {
  return <div className="specimen">{children}</div>
}

/**
 * The ground an asset is shown against.
 *
 * `paper` and `night` are this app's own two page colours, pinned rather than themed: the
 * point of a specimen is the ground the file was drawn for, so the light half stays light
 * for a reader in dark mode. `surface` is the exception — the adaptive and mono variants are
 * *about* following their surroundings, so theirs is the page's own live surface colour.
 */
function Ground({ tone, children }: { tone: 'paper' | 'night' | 'surface'; children: React.ReactNode }) {
  return <div className={`specimen-ground is-${tone}`}>{children}</div>
}

/** A light/dark pair, side by side on the two grounds they were drawn for. */
function SpecimenPair({
  light,
  dark,
  alt,
  size,
  cap,
  byPath,
  eager = false,
}: {
  light: string
  dark: string
  alt: string
  size: Size
  cap: string
  byPath: Map<string, KitFile>
  eager?: boolean
}) {
  return (
    <>
      <Specimen>
        <div className="specimen-grounds">
          <Ground tone="paper">
            <Shot file={light} alt={`${alt}, in black`} size={size} cap={cap} eager={eager} />
          </Ground>
          <Ground tone="night">
            <Shot file={dark} alt={`${alt}, in white`} size={size} cap={cap} eager={eager} />
          </Ground>
        </div>
      </Specimen>

      <div className="brand-lines">
        <AssetLine relative={light} byPath={byPath} note="on a light ground" />
        <AssetLine relative={dark} byPath={byPath} note="on a dark ground" />
      </div>
    </>
  )
}

/**
 * One line under a specimen: what the file is called, how big it is, and the button that
 * puts its URL on the clipboard.
 *
 * The size comes from the folder listing rather than from a number typed here, and its
 * absence is not an error worth hiding a row for: a file this page names but the build did
 * not ship still gets its line, so a missing asset shows up as a missing size instead of as
 * a specimen with nothing written under it.
 */
function AssetLine({
  relative,
  byPath,
  note,
}: {
  relative: string
  byPath: Map<string, KitFile>
  note?: string
}) {
  const file = byPath.get(relative)
  const name = relative.split('/').pop() ?? relative

  return (
    <p className="asset-line">
      <a href={kitHref(relative)} className="asset-line-name font-mono">
        {name}
      </a>
      {file ? <span className="asset-line-size">{formatBytes(file.bytes)}</span> : null}
      {note ? <span className="asset-line-note">{note}</span> : null}
      <CopyUrl url={kitUrl(relative)} name={name} label />
    </p>
  )
}
