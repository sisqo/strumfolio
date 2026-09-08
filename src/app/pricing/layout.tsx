import { PublicHeader } from '@/components/PublicHeader'
import { isOwner } from '@/lib/allowlist'
import { currentUser } from '@/lib/auth/session'
import { hasChosenPlan } from '@/lib/plans/resolve'

/**
 * Adds `PublicHeader` above `/pricing` without touching its own `<main>` — a layout of one
 * page rather than a route group, because there is only the one page here to share it with.
 * Its brand mark replaces the bespoke «← Strumfolio» link the page used to draw above its own
 * heading: a second way home directly under this bar would only repeat what it already says.
 *
 * **The one thing this bar has to decide, and used to get wrong (v3.13):** what its button
 * says. It was `{ href: '/login', label: 'Sign in' }`, written once and never conditional —
 * which meant a reader who was already signed in was offered a sign-in, permanently, not for
 * a moment before hydration but for as long as they stayed on the page. `PublicHeader` has no
 * notion of a session and should not grow one (six other layouts render it in front of one,
 * where "Sign in" is exactly right); the decision belongs here, where the one page that
 * serves both audiences is.
 *
 * Three answers, because there are three readers:
 *
 * - **Nobody signed in** — the two public actions, «Start free» as the capsule and «Sign in»
 *   quiet beside it. The majority case. It used to be a lone «Sign in» capsule, which was the
 *   right single control while `/login` *was* the landing page and carried the whole pitch;
 *   with `/` doing that job, somebody reading a price list has no account yet by definition,
 *   so the loud control is the one that gets them one.
 * - **Signed in, plan chosen** — «My songbooks», the thing they actually came from and the
 *   only place this bar can usefully send them. No quiet action: they are signed in, so
 *   neither «Sign in» nor «Start free» means anything.
 * - **Signed in and actually gated** — nothing at all. This is the reader `requirePlanChoice`
 *   redirected *here*, and every destination is a bounce: `/` sends them straight back. A
 *   button that returns you to the page you are on is worse than no button, and the notice the
 *   page itself now shows is what explains the situation instead. "Actually gated" and not
 *   "has not chosen": see `gated` below.
 *
 * What none of the three carries is a «Pricing» pill, and that is separate from all of the
 * above and not about who is reading: this *is* that page, and a bar that links to the page it
 * stands on is a dead control. `Home.dc.html` draws that pill because it draws the home.
 *
 * `currentUser()` costs no query (v3.1 — it resolves a role from the cookie and the
 * environment alone), so the price of all this is the single `hasChosenPlan` read, and only
 * for a signed-in reader who is not a global owner. The page beside it makes its own, fuller
 * identity read for the cards; the two are deliberately not shared, because plumbing one
 * through would mean either a context or a cache wrapper for a value this bar needs one
 * boolean of.
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

  const cta =
    user === null
      ? { href: '/register', label: 'Start free' }
      : gated
        ? undefined
        : { href: '/', label: 'My songbooks' }

  /*
   * «Sign in» only for the reader who has no account: the other two are already signed in.
   * No «Pricing» pill at any of the three, and that is the rule rather than an omission — this
   * is that page, and a bar that links to the page it stands on is a dead control.
   */
  const links = user === null ? [{ href: '/login', label: 'Sign in' }] : []

  return (
    <>
      {/* 70rem, matching this page's own `<main className="... max-w-[70rem] ...">`. */}
      <PublicHeader width="70rem" links={links} cta={cta} />
      {children}
    </>
  )
}
