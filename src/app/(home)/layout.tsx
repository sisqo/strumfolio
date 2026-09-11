import type { Metadata } from 'next'
import type { ReactNode } from 'react'

/* Relative, unlike every other import in this app: the `@/` alias would have to spell a route
   group's parentheses inside a module path, which resolves but reads as a glob. `./Landing` is
   also the truer statement — it is this segment's other half, not a component from elsewhere. */
import { Landing, LANDING_DESCRIPTION, LANDING_TITLE } from './Landing'
import { StandaloneRedirect } from '@/components/StandaloneRedirect'
import { currentUser } from '@/lib/auth/session'
import type { CurrentUser } from '@/lib/auth/session'
import { hasDatabase } from '@/lib/db/client'
import { requirePlanChoice } from '@/lib/plans/gate'

/**
 * Which of the two pages `/` is for this request, and who is asking.
 *
 * **Three outcomes, not two, and reading it as two is a real bug.** The shape that suggests
 * itself is `const user = hasDatabase ? await currentUser() : null` followed by
 * `user === null → landing`, and it reads *no database* as *visitor*. Running with no
 * `DATABASE_URL` is the normal, documented way to work on this app locally — songs come
 * straight from `content/` — so that version serves the marketing page at `/` on every
 * `npm run dev` and leaves the home screen unreachable.
 *
 * One function because **two things ask** — the render below and `generateMetadata` under it —
 * and the first version of this file had them written out separately: the render got all three
 * cases right and the metadata got two, so local dev rendered the app under the landing page's
 * own title. Caught by running it; it would never have shown up in production, where there is
 * always a database. One question, one answer, no way for the two to disagree again.
 *
 * `currentUser()` costs no query — `auth()` reads the JWT cookie, `readAccountCookie` a cookie,
 * `roleOf` the environment (v3.1) — so being asked twice per request is two cookie reads, not
 * two round trips.
 *
 * **What `user === null` stopped meaning.** It used to be "the session is still valid but is no
 * longer admitted anywhere" — every membership pulled, no owner status either — and it answered
 * `redirect('/login')`. That case still exists and is now indistinguishable from a visitor,
 * because `currentUser` returns `null` for both. The landing branch absorbs it: somebody whose
 * access was withdrawn sees the public home with «Sign in» in the bar, which is true and is no
 * worse than the redirect they used to get.
 */
async function audience(): Promise<{ landing: boolean; user: CurrentUser | null }> {
  if (!hasDatabase) return { landing: false, user: null }

  const user = await currentUser()
  return { landing: user === null, user }
}

/**
 * `/` serves two audiences, and this file is where they are told apart.
 *
 * With no session it renders `Landing` — the public home, what a visitor and a crawler get.
 * With one it renders `children`, which is `page.tsx`: the reader's own songbooks, unchanged.
 * Until this shipped, `/` required a session and the middleware redirected anybody without one
 * to `/login`, which is why the sign-in form was also the product's only public page.
 *
 * **Why the layout rather than `page.tsx`.** Two reasons, and the second is the one that would
 * not be noticed until a visitor saw it:
 *
 * - `redirect()` thrown from inside a page's own async body is not a redirect at all when the
 *   segment has a `loading.tsx`: Next wraps the page in a Suspense boundary and streams a 200
 *   shell before the body runs, downgrading it to a client-side navigation in the RSC stream —
 *   which a hooks-order mismatch during that exact transition was silently swallowing outright.
 *   A brand-new account landed on `/` and stayed there, gate or no gate, confirmed with a plain
 *   `curl`. A layout sits outside the boundary its own segment's `loading.tsx` introduces, so
 *   `requirePlanChoice` below still produces a genuine top-level redirect. See
 *   `songbooks/[slug]/layout.tsx` for the other route this same bug hit.
 * - `loading.tsx` beside this file is the *app home's* skeleton — `TopBar`, a search field, five
 *   card rows. Deciding inside `page.tsx` would stream that skeleton to a visitor before the
 *   marketing page replaced it, and it is what a crawler would read in the initial HTML.
 *   Returning `Landing` from here instead of `children` means the page slot is never rendered,
 *   so its Suspense boundary never opens and no fallback exists to flash.
 */
export default async function HomeLayout({ children }: { children: ReactNode }) {
  const { landing, user } = await audience()

  /*
   * `StandaloneRedirect` is here rather than inside `Landing`, where it lived until `/home`
   * arrived. Its whole argument is about *this URL* — `manifest.ts` has `start_url: '/'`, so
   * whoever taps the Home Screen icon after their session lapsed would open onto a page arguing
   * that they should try the app they installed months ago. `Landing` is now also served at
   * `/home` to anybody who asks for it, and that reader has asked for the marketing page on
   * purpose; bouncing them to `/login` because they happen to be in the installed app would
   * break the one promise that URL makes.
   */
  if (landing) {
    return (
      <>
        <StandaloneRedirect />
        <Landing />
      </>
    )
  }

  /* The mandatory plan-choice gate (v3.7) — `/` is the page every sign-in path lands on. It
     returns immediately with no database, which is the one case that reaches here with a null
     user. */
  await requirePlanChoice(user)

  return <>{children}</>
}

/**
 * The landing page's own title, description and share card — declared here rather than in
 * `page.tsx` for the same reason the render decision is here: `/` is one URL with two pages
 * behind it, and metadata is resolved per segment, so the file that knows which page is being
 * served is the file that has to name it. A page's own `metadata` export would override
 * whatever a layout said, which is why `page.tsx` deliberately declares none.
 *
 * A crawler has no session and therefore always gets the landing block, which is the audience
 * these five strings are written for. Anybody being served the app gets a plain «Home», its own
 * tab title: their `/` is a screen, not a pitch, and «Play and sing with your own chords…» in
 * the tab of the page they use every day would be an advertisement aimed at somebody who has
 * already bought.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { landing } = await audience()

  if (!landing) return { title: 'Home' }

  return {
    // `absolute`, not the root template: this page names itself, and "· Strumfolio" after its
    // own payoff would repeat the name in the same breath.
    title: { absolute: LANDING_TITLE },
    description: LANDING_DESCRIPTION,
    /* The landing page is `/`, and it is reached at `/` — but the middleware's own redirect
       and `next.config.ts`'s legacy ones (`/canzonieri`, `/songbooks`, `/import`…) all end
       here, so say so rather than leaving a crawler to decide which of them is canonical. */
    alternates: { canonical: '/' },
    openGraph: {
      title: LANDING_TITLE,
      description: LANDING_DESCRIPTION,
      locale: 'en_GB',
      type: 'website',
      images: [{ url: '/brand/og-image.png', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: LANDING_TITLE,
      description: LANDING_DESCRIPTION,
      images: ['/brand/og-image.png'],
    },
  }
}
