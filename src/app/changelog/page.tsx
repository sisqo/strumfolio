import type { Metadata } from 'next'

import { Footer } from '@/components/Footer'
import { APP_NAME } from '@/lib/brand'
import { KIND_LABEL, RELEASES, releaseAnchor, releaseDate } from '@/lib/changelog'

/**
 * Spelled out rather than built from `SITE_URL`, which is what the four legal pages each do
 * too. The two are the same string today and are not the same fact: the domain could move to
 * one where this mailbox does not exist, and deriving it would point every reader at nothing
 * while the legal pages stayed correct.
 */
const CONTACT = 'info@strumfolio.com'

const DESCRIPTION = `What has shipped in ${APP_NAME}, release by release — the changes worth knowing about, not every commit.`

/**
 * `openGraph.images` repeated here for the reason `/pricing`'s own comment gives: Next replaces
 * the root layout's `openGraph` block wholesale once a page declares one, rather than merging
 * into it, so a page that names its own would otherwise share a link card with no image.
 */
export const metadata: Metadata = {
  title: 'Changelog',
  description: DESCRIPTION,
  openGraph: {
    title: `${APP_NAME} — Changelog`,
    description: DESCRIPTION,
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/brand/og-image.png', width: 1200, height: 630 }],
  },
}

/**
 * What has shipped, newest first.
 *
 * Public, and linked from the footer beside the legal pages: the point of writing a release note
 * is that a customer reads it. Nothing here needs a session, so there is no gate and no
 * `dynamic` — the content is a constant in `lib/changelog.ts`, which is exactly the shape that
 * statically prerenders.
 *
 * Deliberately **not** in `scripts/precache-routes.ts`, like every other public page in this app
 * except the manifest: a stale changelog served from an install-time cache would tell a reader
 * the newest release is one they are already past — which matters more now that a release lands
 * about every week. `/pricing`'s own comment makes the sharper version of this argument about
 * prices; the same reasoning applies here with a shorter fuse.
 *
 * A `<section>` per release rather than one long list, so a screen reader can move release by
 * release, and `<time dateTime>` so the date is machine-readable as well as printed.
 *
 * **Each release is addressable**: the version badge links to its own `id`, so «fixed in 1.1»
 * can be sent as a URL rather than as an instruction to scroll. That is the half of `Footer`'s
 * argument for printing a version number at all that was missing until now — see `releaseAnchor`
 * on why the fragment carries no dot.
 */
export default function ChangelogPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
      <header className="mb-10">
        <h1 className="landing-title">Changelog</h1>
        <p className="mt-4 text-[1.03125rem] leading-[1.6] text-muted">
          A new version about once a week, listing what changed for you — not every repair under the floor. A quiet week
          gets no entry rather than a padded one, so everything below is something you can go and use.
        </p>
      </header>

      <div className="flex flex-col gap-10">
        {RELEASES.map((release) => {
          const anchor = releaseAnchor(release.version)

          return (
            <section key={release.version} id={anchor}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="section-title">{release.title}</h2>
                <a href={`#${anchor}`} className="badge" aria-label={`Link to version ${release.version}`}>
                  {release.version}
                </a>
                <time dateTime={release.date} className="text-sm text-muted">
                  {releaseDate(release.date)}
                </time>
              </div>

              <ul className="mt-3 flex flex-col gap-2.5">
                {release.highlights.map((highlight) => (
                  <li key={highlight.text} className="changelog-entry text-[0.9375rem] leading-[1.55] text-ink">
                    {/* Real text, not the `aria-hidden` bullet it replaces: "Fixed" is
                        information, and a screen reader should get it like any other word.
                        Below 30rem it sits above the sentence instead of stealing width from
                        it — a fixed label column and a phone cannot both have that space. The
                        row/column switch lives in `.changelog-entry`, not in utilities here;
                        that class's own comment says what happened when it did not. */}
                    <span className="changelog-kind">{KIND_LABEL[highlight.kind]}</span>
                    <span className="min-w-0">{highlight.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <p className="mt-12 text-sm text-muted">
        Questions, or something that looks wrong? Write to{' '}
        <a href={`mailto:${CONTACT}`} className="text-accent hover:underline">
          {CONTACT}
        </a>
        .
      </p>

      <Footer />
    </main>
  )
}
