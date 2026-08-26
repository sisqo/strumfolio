import type { Metadata } from 'next'

import { Footer } from '@/components/Footer'
import { APP_NAME } from '@/lib/brand'
import { RELEASES, releaseMonth } from '@/lib/changelog'

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
 * Public, and linked from the footer beside the legal pages and `/brand`: the point of writing
 * a release note is that a customer reads it. Nothing here needs a session, so there is no gate
 * and no `dynamic` — the content is a constant in `lib/changelog.ts`, which is exactly the shape
 * that statically prerenders.
 *
 * Deliberately **not** in `scripts/precache-routes.ts`, like every other public page in this app
 * except the two shell routes: a stale changelog served from an install-time cache would tell a
 * reader the newest release is one they are already past. `/pricing`'s own comment makes the
 * sharper version of this argument about prices; the same reasoning applies more mildly here.
 *
 * A `<section>` per release rather than one long list, so a screen reader can move release by
 * release, and `<time dateTime>` so the date is machine-readable even though it is rendered as a
 * month — see `releaseMonth` on why it is never rendered as a day.
 */
export default function ChangelogPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
      <header className="mb-10">
        <h1 className="landing-title">Changelog</h1>
        <p className="mt-4 text-[1.03125rem] leading-[1.6] text-muted">
          The changes worth knowing about, gathered into releases rather than listed one by one. Written when there is
          something new to tell you, which is less often than {APP_NAME} changes.
        </p>
      </header>

      <div className="flex flex-col gap-10">
        {RELEASES.map((release) => (
          <section key={release.version}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="section-title">{release.title}</h2>
              <span className="badge">{release.version}</span>
              <time dateTime={release.date} className="text-sm text-muted">
                {releaseMonth(release.date)}
              </time>
            </div>

            <ul className="mt-3 flex flex-col gap-2.5">
              {release.highlights.map((line) => (
                <li key={line} className="flex gap-2.5 text-[0.9375rem] leading-[1.55] text-ink">
                  {/* A bullet drawn rather than a list-marker, so the second line of a long
                      entry lines up under the first word and not under the dot. */}
                  <span aria-hidden className="mt-[0.5em] h-[0.3125rem] w-[0.3125rem] flex-none rounded-full bg-accent" />
                  <span className="min-w-0">{line}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
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
