import { PublicHeader } from '@/components/PublicHeader'
import { isOwner } from '@/lib/allowlist'
import { currentUser } from '@/lib/auth/session'
import { hasChosenPlan } from '@/lib/plans/resolve'
import { publicBarFrom } from '@/lib/publicBar'

/**
 * Adds `PublicHeader` above `/pricing` without touching its own `<main>` — a layout of one
 * page rather than a route group, because there is only the one page here to share it with.
 * Its brand mark replaces the bespoke «← Strumfolio» link the page used to draw above its own
 * heading: a second way home directly under this bar would only repeat what it already says.
 *
 * **This file used to be the only bar that knew who was reading, and that is what generalised.**
 * It grew the branch after v3.13, where «Sign in» was written once and never conditional — so a
 * reader who was already signed in was offered a sign-in, permanently, not for a moment before
 * hydration but for as long as they stayed on the page. The conclusion drawn at the time was
 * that the decision belonged at the call site, since «Sign in» was right on the other seven;
 * it was not. It was wrong on all seven for anybody signed in, and the fix simply had nowhere
 * to live but here. `lib/publicBar.ts` is where it lives now, and every bar gets it.
 *
 * **What stays this file's own is the third reader.** The shared rule answers two of them —
 * «Sign in» for a visitor, «My songbooks» for somebody with an account — and knows nothing
 * about plans, which is right: no other public page should pay for a `hasChosenPlan` read.
 * This one must, because `requirePlanChoice` redirects a reader who has not chosen *here*, and
 * for them «My songbooks» is a bounce — `/` sends them straight back. So they get no capsule
 * at all, and the notice the page itself shows is what explains the situation instead.
 * "Actually gated" and not "has not chosen": see `gated` below.
 *
 * Their brand mark is no longer a bounce, incidentally, which it was while it pointed at `/`:
 * a signed-in reader's mark leads to `/home`, and that URL renders the landing page with no
 * gate of any kind.
 *
 * What none of the three carries is a «Pricing» pill, and that is separate from all of the
 * above and not about who is reading: this *is* that page, and a bar that links to the page it
 * stands on is a dead control. `Home.dc.html` draws that pill because it draws the home.
 *
 * **`currentUser()` is not free**, and a comment here said the opposite for months (v3.1, when
 * it resolved a role from the cookie and the environment alone). A session no longer outlives
 * its account, so it is one indexed lookup — memoized per request by `accountExists`, and
 * skipped entirely for a global owner. The page beside it makes its own, fuller identity read
 * for the cards; the two are deliberately not shared, because plumbing one through would mean
 * either a context or a cache wrapper for a value this bar needs one boolean of, and the
 * memoization already collapses what would otherwise be the second query.
 */
export default async function PricingLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser()

  /*
   * The gate's own question, not the stored fact — the same distinction `Viewer.mustChoosePlan`
   * documents on the page beside this. `requirePlanChoice` lets a global owner through without
   * consulting `hasChosenPlan` at all, so asking that function alone would put an owner whose
   * row has never been stamped in the third case below and leave them with no button of any
   * kind: a regression from the wrong-but-clickable «Sign in» this replaced, and on the one
   * account whoever changes this file is signed into.
   *
   * `isOwner` short-circuits, so an owner costs no query here either.
   */
  const gated =
    user !== null &&
    !isOwner(user.email, process.env.ALLOWED_EMAILS) &&
    !(await hasChosenPlan(user.accountOwnerEmail))

  /* `publicBarFrom` and not `publicBarFor`, because `user` is already resolved above — and no
     `links`, per the rule about the page a bar is standing on. */
  const bar = publicBarFrom(user !== null, { action: gated ? false : undefined })

  return (
    <>
      {/* 70rem, matching this page's own `<main className="... max-w-[70rem] ...">`. */}
      <PublicHeader width="70rem" {...bar} />
      {children}
    </>
  )
}
