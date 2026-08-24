'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { IconInfo } from '@/components/icons'
import { activatePlanChoice } from '@/lib/plans/checkout'
import type { BillingPeriod } from '@/lib/plans/prices'
import { PLAN_LABEL, type Plan } from '@/lib/plans/types'
import { mustChooseNow } from '@/lib/plans/viewer'
import type { Viewer } from '@/lib/plans/viewer'

export type { Viewer }

/**
 * The same order `PLAN_RANK` (`lib/plans/types.ts`) states, copied rather than imported —
 * this file's own header explains why that module never crosses into the client bundle.
 * Read only against `column.slug` and the reader's own `plan`, both bare strings for the
 * same reason, so a rank comparison never needs the real `Plan` type at all. Five entries,
 * matching `PLAN_VALUES`: a plan missing here compares as `undefined < number`, which is
 * always `false` — an upgrade-shaped default for a mistake this codebase tests never
 * happens, rather than a downgrade sentence for a plan that turns out unranked.
 */
const RANK: Record<string, number> = { free: 0, standard: 1, plus: 2, premium: 3, lifetime: 4 }

/**
 * A column's price slot: the number, and the small suffix beside it — never a whole worded
 * sentence, and that is a deliberate narrowing rather than the shape this used to be. The
 * v3.4 design draws «€2.49» and «/mo» as two different sizes in the same line, which a single
 * pre-worded string («€2.49 per month») could not do; and it draws no third line under either
 * — the renewal disclosure that line used to carry («Billed once a year, and renews each year
 * until you cancel.») has no home in this design at all, on any column, so it is gone rather
 * than kept and left unrendered.
 */
export interface ColumnPrice {
  /** «€19», «€2.49», «€0» — the number alone, with no unit attached. */
  amount: string
  /** «/yr», «/mo», or `''` for Free, which has nothing to bill and so nothing to suffix. */
  suffix: string
}

export interface PlanColumn {
  name: string
  /**
   * `'free' | 'standard' | 'plus' | 'premium'` as a bare string, for the same reason
   * `checkoutPlan` below is one: comparing it against the reader's own plan (`useRole().plan`,
   * itself typed `Plan | null` only because that flows in from a context this file never
   * imports from) is what decides whether a card is the one already held, an upgrade, or a
   * downgrade — see `RANK` above. Every column needs one, including Free, which is why this
   * is separate from `checkoutPlan` rather than reusing it: Free has no checkout plan at all.
   */
  slug: string
  /**
   * Both states, always. Free's two are identical rather than absent, so this component
   * never asks whether a column has a monthly form — a column that opted out of the toggle
   * would be the one place the layout could shift under a tap.
   */
  price: Record<BillingPeriod, ColumnPrice>
  /** Who the plan is for, in one sentence. */
  audience: string
  /**
   * Raised above the other three, with a "Most popular" ribbon — true for exactly one
   * column, `Plus`. A reversal of what this file's CSS used to say on purpose ("no accent
   * border, no ribbon... not something to fix later"): the v3.4 redesign decided a page
   * that only lets somebody choose still benefits from naming the one most people pick.
   */
  featured?: boolean
  /**
   * The middle tier's own faint tint (`.is-paid`) — true for Standard and Premium, false for
   * Free (nothing bought) and unset for Plus, which gets `.is-featured` instead and must
   * never carry both classes at once. A separate field from `featured` rather than inferred
   * from "not free and not featured", because that inference is exactly the kind of thing a
   * fifth plan could get quietly wrong.
   */
  paid?: boolean
  /**
   * True on the Free column and nowhere else — a marker rather than a descriptor, unlike it
   * used to be (`{ href, label }`, back when this rendered one plain link and nothing had to
   * ask who was looking). Free's four states — not signed in, mid the mandatory plan-choice
   * gate, already on Free, or a paid reader downgrading to it — each pick their own wording
   * and their own action now (`startFree`, a link to `/billing`, a plain indicator), none of
   * which a generic `href`/`label` pair could have named; every other column's action comes
   * from `checkoutPlan` below instead, never from this.
   */
  cta?: true
  /**
   * The route slug for the mock checkout (`lib/plans/checkout.ts`'s `CheckoutPlan`), or
   * absent when there is nothing to buy yet. A bare string rather than that type imported
   * here: this file's own header explains why it must never import `@/lib/plans/types`, and
   * `checkout.ts` sits downstream of that module, so pulling in its type would reopen the
   * exact bundle-size door this file exists to keep shut. The page decides whether this is
   * set at all — see `mockCheckoutEnabled()` in `pricing/page.tsx` — so its mere presence is
   * the only thing this component has to check.
   *
   * When it is absent on a paid column, the card simply ends after `audience` with no
   * button at all — the design has no notice anywhere for "not on sale yet" and neither
   * does this component; the absence of a button is the whole of what is said.
   */
  checkoutPlan?: string
}

/** One row of the comparison table below the cards. */
export interface ComparisonRow {
  label: string
  /** One small sentence saying what living without this row is like. */
  note: string
  /** Free, Standard, Plus, Premium — in `columns` order. `null` is "no part of this plan". */
  cells: (string | null)[]
}

const PERIODS: { value: BillingPeriod; label: string }[] = [
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
]

/**
 * Who is reading this page, answered by the server and handed down as a prop — `Viewer` itself
 * and `mustChooseNow` both live in `@/lib/plans/viewer` now, a plain module rather than this
 * one, and that file's own comment says why: this file is `'use client'`, and a Server
 * Component may only render one of this module's exports as JSX, never call one as a plain
 * function. `pricing/page.tsx` did exactly that with `mustChooseNow` and crashed in production
 * on every load. `export type { Viewer }` above re-exports the type for anyone still importing
 * it from here — type-only re-exports carry no such restriction, only the function did.
 *
 * The four fields `useRole()` used to supply here, and the same values from the same read
 * (`loadIdentity`) — what changed is *when* they arrive. `RoleProvider` fills its context from
 * an effect, so until that resolves every consumer is told `known: false`, and this page's own
 * reading of that default was "nobody is signed in": three paid cards offering «Sign up» to
 * /register, plus the Lifetime block doing the same. Correct for a visitor, and exactly wrong
 * for the one reader who cannot have arrived any other way — `requirePlanChoice`
 * (`lib/plans/gate.ts`) redirects an account that has not chosen a plan *here*, so the person
 * most likely to be looking at this page is signed in, and was being invited to register.
 *
 * A prop cannot be wrong for a moment first, which is why this is the shape it is. It costs
 * /pricing its static rendering — the page reads cookies now, so Next serves it per request —
 * and that trade was made deliberately (see the page's own comment) rather than worked around
 * with a placeholder, because a placeholder still means a page that cannot say anything true
 * until JavaScript runs. `LIFETIME_OPEN` stops being frozen at build time as a side effect,
 * which is a duty removed rather than a new one.
 */

/**
 * The four price columns and the one control on the page that has state.
 *
 * The only client component /pricing loads, and now holds the comparison table as well as
 * the cards (v3.4) — the design repeats each plan's price in the table's own header, and
 * that only reads correctly if it moves with the same toggle the cards already answer to.
 * The headline, the lede, the notice, the lifetime block and the closing block stay
 * server-rendered by the page itself; only the parts that actually say a price crossed the
 * boundary. The page stays statically prerendered either way — a client child is rendered
 * into the HTML with `'month'` already chosen and merely hydrates — so what this boundary
 * costs is one small bundle, and what it buys is a toggle whose selected state a screen
 * reader can actually read, now reaching the table too.
 *
 * The words arrive as props and are not written here, `PlanColumn` by `PlanColumn`,
 * `ComparisonRow` by `ComparisonRow`. Two reasons, and the second is the one that would be
 * missed: the page owns its own copy, so a reader looking for a sentence on /pricing finds
 * every sentence in one file; and this file must never import `@/lib/plans/types`, because
 * importing `PLANS` into a client component ships that whole module to the browser —
 * `LIMIT_MESSAGE`, `limitSentence`, `capWorthNaming` and every paragraph of commentary with
 * them. The numbers are read from `PLANS` on the server and arrive here as strings that have
 * already been made into sentences. `BillingPeriod` is a type import, which erases.
 *
 * Rejected: a CSS-only toggle — two radios and `:has()`, which needs no JavaScript at all
 * and is what the `<details>` FAQ on /login argues for in a comparable spot. It would put
 * both price sets in the DOM at once, which is fine, and leave the *selected* state
 * unspeakable, which is not: a radio that visually swaps other elements' visibility
 * announces itself as a radio and says nothing about the prices that changed. Here one tap
 * changes what four columns say, so the control has to be able to say that it did.
 *
 * `aria-pressed` on two buttons in a `role="group"` rather than a radiogroup with arrow-key
 * semantics: there are two options, both always visible, and the pair reads as two toggles
 * that happen to be exclusive. A radiogroup would promise keyboard behaviour this does not
 * implement.
 *
 * Opens on `'month'`, the v3.4 redesign's own choice — a departure from the previous default
 * of `'year'`, which `prices.test.ts`'s "makes a year cheaper than twelve months" test was
 * the reason for. That invariant still holds and still matters: whichever tab opens first,
 * the other one has to still read as the better deal once tapped.
 */
export function PricingPlans({
  columns,
  rows,
  tableTitle,
  viewer,
}: {
  columns: PlanColumn[]
  /** The comparison table's own rows, rendered below the cards. */
  rows: ComparisonRow[]
  /** The table's own heading — plain text, not a slot, since it is never anything but one line. */
  tableTitle: string
  /** Who is reading, decided by the server before this renders — see `Viewer`. */
  viewer: Viewer
}) {
  const [period, setPeriod] = useState<BillingPeriod>('month')

  /*
   * The reader's own state is what makes this the one page that also serves an existing
   * customer changing plans, not only a visitor choosing one for the first time — every card
   * reads it now, not only Free's own (PLAN.md, v3.7) mandatory plan-choice gate that used to
   * be the sole reason this file needed it at all. None of it gates anything: a reader who
   * turns out signed out after clicking "Upgrade to Plus" is stopped by the middleware on
   * `/checkout/plus`, not by this component second-guessing what it already decided to
   * show — which is why everything below only ever changes which sentence a card shows,
   * never what pressing it is allowed to do.
   *
   * **A prop, not `useRole()`, since v3.13** — the reason is in `Viewer`'s own comment: the
   * hook cannot answer before hydration, and the wrong answer it gives until then was being
   * read by the one person this page must not mislead.
   */
  const router = useRouter()
  /* No `mustChoosePlan` here: it is read through `mustChooseNow(viewer)` below, which is the
     one place that decides it, so destructuring it as well would only invite a second answer. */
  const { email, plan, subscriptionPlan } = viewer
  const [freeBusy, setFreeBusy] = useState(false)
  const [freeError, setFreeError] = useState<string | null>(null)
  const signedIn = email !== null
  /* `mustChooseNow`, not the comparison written out again: the page's own heading turns on the
     same answer, and the two must never disagree — see that function's own comment. */
  const pending = mustChooseNow(viewer)
  /*
   * Every rank question on this page is asked of the **subscription**, never of `plan`'s
   * blend of subscription-and-gift — the invariant `mockPurchase` states for its own
   * comparison, which this file used to break. A gifted Premium sitting on top of a paid
   * Standard made the Premium card say "Your plan", and completing that card's checkout
   * turned the gift into a real purchase nobody asked for.
   *
   * `?? 'free'` because a live subscription of `null` and an effective plan of `'free'` are
   * the same account — one with nothing paid running — and Free's own card has to keep
   * reading as current for it. Gated on `plan !== null` rather than on `signedIn` so that
   * enforcement being off still marks nothing as current, exactly as before.
   */
  const currentPlan: Plan | null = plan === null ? null : (subscriptionPlan ?? 'free')
  /* `null` while the role is still loading or nobody is signed in — `RANK[column.slug] <
     null` is always `false` in JS, which is what keeps every column reading as "not a
     downgrade" (never a real claim, since `isDowngrade` is only read once `signedIn` is
     already true) rather than needing its own guard at each call site. */
  const currentRank = currentPlan === null ? null : RANK[currentPlan]
  /*
   * Lifetime is a terminal state, and every CTA on this page is a no-op for it: `mockPurchase`
   * refuses each paid column with `not-applicable` (nothing left to buy) and `mockCancel`
   * refuses the Free one for the same reason. `BillingScreen`'s own `canCancel` has always
   * excluded `lifetime`; this is that same exclusion, finally applied on the page that offers
   * the actions rather than only on the one that manages them.
   */
  const isLifetime = currentPlan === 'lifetime'
  /*
   * A gift outranking the subscription underneath it — the one case where the badge in
   * `UserMenu` and the card marked "Your plan" here name two different plans, which without a
   * word of explanation reads as one of them being wrong.
   */
  const giftedAbove = plan !== null && currentPlan !== null && RANK[plan] > RANK[currentPlan] ? plan : null

  const startFree = async () => {
    setFreeBusy(true)
    setFreeError(null)

    const result = await activatePlanChoice()
    if (result.ok) {
      /*
       * `/thanks`, not `/` — the screen that answers "what did I just do" already has a Free
       * branch written for exactly this moment («Still on Free. Here's what's next.», three
       * steps and a way on to the songbooks), and until now nothing reached it: a global owner
       * with `?preview=free` was the only reader who ever saw it. Choosing Free out of the
       * mandatory gate was the one act in this app that confirmed itself by silently landing
       * somewhere else, while every paid choice got a thank-you page.
       */
      router.push('/thanks')
      return
    }

    setFreeBusy(false)
    setFreeError('Something went wrong. Try again.')
  }

  return (
    <div>
      <div className="segment mx-auto w-fit" role="group" aria-label="Billing period">
        {PERIODS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            /* px-4: `.segment-button` sets a 44px minimum and no horizontal padding, because
             * every other call site in the app puts a glyph or a number in it. A word needs
             * the padding, and a utility is safe here precisely because the class declares
             * none of its own — there is no coin flip over which rule wins. */
            className={entry.value === period ? 'segment-button is-on px-4' : 'segment-button px-4'}
            aria-pressed={entry.value === period}
            onClick={() => setPeriod(entry.value)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {/*
        * Why the badge in the account menu can name a higher plan than the card marked "Your
        * plan" below. Without this the two look like a contradiction — and the honest answer
        * is that they are answering different questions: the gift decides the limits in force,
        * the subscription decides what is being paid for and therefore what an upgrade or a
        * downgrade is measured from.
        */}
      {/*
        * Why this reader is on a pricing page they never asked for.
        *
        * `requirePlanChoice` sends an account that has not chosen a plan here, and until now the
        * only trace of that was the wording on the buttons — «Choose Standard», «Continue with
        * Free» — which says what to press, never why pressing something is unavoidable. Read
        * without it the page is what it looks like: marketing, arrived at by accident, with a
        * brand mark at the top that leads to `/` and bounces straight back. The one thing worth
        * saying out loud is that the choice is not a commitment, because the reader who thinks
        * it is stops here.
        *
        * Above the gift notice, not below: this one explains the whole screen, that one explains
        * which card is marked.
        */}
      {pending && (
        <p className="notice notice-accent mt-6" role="status">
          <IconInfo />
          <span>
            One step left: pick the plan to start on. Free is a real plan with no end date, not a trial — and
            whichever you pick, you can change or cancel it any time from Billing.
          </span>
        </p>
      )}

      {giftedAbove !== null && (
        <p className="notice notice-accent mt-6" role="status">
          <IconInfo />
          <span>
            This account has been given {PLAN_LABEL[giftedAbove]} as a gift, so those are the limits in force
            right now. The plan marked below is the subscription underneath it — what changes if you upgrade,
            switch or cancel.
          </span>
        </p>
      )}

      <div className="plan-columns mt-6">
        {columns.map((column) => {
          const cardClass = column.featured
            ? 'card plan-card is-featured'
            : column.paid
              ? 'card plan-card is-paid'
              : 'card plan-card'

          /*
           * Three ways a signed-in reader's own plan relates to this column — computed once
           * per column and read by both the `checkoutPlan` block below and the `cta` (Free)
           * one, since Free is exactly as much a destination as any paid column now.
           * `isCurrent`/`isDowngrade` are meaningless while `!signedIn` and are never read
           * then; `currentRank`'s own comment says why neither needs its own guard for it.
           */
          /*
           * `currentPlan`, never `plan` — the same rule the block above states for `currentRank`
           * and the same one it was still breaking here. A gifted Premium over a paid Standard
           * made the *Premium* card read "Your plan · Manage", so the one control beside it
           * ("Change billing cycle") led to a real purchase of a plan the account had been
           * given for nothing, while the Standard card the customer actually pays for offered
           * to "Upgrade" them to it. It also made the notice above this grid untrue in as many
           * words: it promises that the card marked below is the subscription underneath the
           * gift, which only became so with this line.
           */
          const isCurrent = signedIn && column.slug === currentPlan
          const isDowngrade = currentRank !== null && RANK[column.slug] < currentRank

          return (
            <article key={column.name} className={cardClass}>
              {column.featured && <span className="plan-badge">Most popular</span>}

              <h3 className="plan-name">{column.name}</h3>
              <p className="plan-price">
                {column.price[period].amount}
                {column.price[period].suffix !== '' && (
                  <span className="plan-price-period">{column.price[period].suffix}</span>
                )}
              </p>
              <p className="plan-audience">{column.audience}</p>

              {column.checkoutPlan !== undefined && (
                !signedIn ? (
                  <Link href="/register" className="btn btn-primary btn-sm plan-cta w-full">
                    Sign up
                  </Link>
                ) : isCurrent ? (
                  <>
                    <p className="plan-current w-full">
                      Your plan · <Link href="/billing">Manage</Link>
                    </p>
                    {/*
                      * The one action this card still needs: re-buying the plan already held
                      * is how a billing-cycle change has always worked (`mockPurchase`'s own
                      * comment — equal rank applies immediately, like a small upgrade) and
                      * there is nowhere else in the app to do it, since the active cycle
                      * itself is not even a stored column. Worded apart from "Upgrade"/
                      * "Switch" below, which both change *which* plan this is — this changes
                      * nothing about the plan, only how often it bills.
                      */}
                    <Link
                      href={`/checkout/${column.checkoutPlan}?cycle=${period}`}
                      className="plan-cycle-link"
                      /* A re-buy of the plan already held also clears a scheduled downgrade,
                       * by design (`mockPurchase` reads it as changing your mind). The
                       * checkout screen's own status line spells the pending change out
                       * before anything is confirmed, so this only has to stop the link
                       * itself from looking like it touches nothing but the cycle. */
                      title="Re-bills this plan on the chosen cycle. If a downgrade or cancellation is scheduled, this cancels it."
                    >
                      Change billing cycle
                    </Link>
                  </>
                ) : isLifetime ? (
                  <p className="plan-current w-full">Included in Lifetime</p>
                ) : (
                  <Link
                    href={`/checkout/${column.checkoutPlan}?cycle=${period}`}
                    className="btn btn-primary btn-sm plan-cta w-full"
                  >
                    {/*
                      * "Upgrade" is a claim about where somebody already is, and during the
                      * mandatory plan-choice gate (`pending`) it is false for every column: that
                      * reader has never had a plan at all — the row says `free` because the
                      * column defaults to it, which is the exact reading `noPlanYet`
                      * (`accounts/planText.ts`) exists to refuse on the operator's side. The
                      * first choice is a choice, so it is worded as one; "Switch" is for a
                      * reader who has something to switch away from.
                      */}
                    {pending
                      ? `Choose ${column.name}`
                      : isDowngrade
                        ? `Switch to ${column.name}`
                        : `Upgrade to ${column.name}`}
                  </Link>
                )
              )}

              {column.cta !== undefined && pending && (
                <>
                  <button
                    type="button"
                    className="btn btn-sm plan-cta w-full"
                    onClick={() => void startFree()}
                    disabled={freeBusy}
                  >
                    {freeBusy ? 'Activating…' : 'Continue with Free'}
                  </button>
                  {freeError !== null && (
                    <p className="notice notice-error mt-2 text-xs" role="alert">
                      {freeError}
                    </p>
                  )}
                </>
              )}

              {/*
                * Free's other three states, beside `pending` above: not signed in gets the
                * same "Sign up" every paid column does; already on Free gets the same "Your
                * plan" indicator, with no `/billing` link — there is nothing there to manage
                * on a plan with no payment, no expiry and no history; signed in on a *paid*
                * plan gets `switchToFree`, the one card whose downgrade cannot go through
                * `checkoutPlan` at all (see that function's own comment).
                */}
              {column.cta !== undefined && !pending && !signedIn && (
                <Link href="/register" className="btn btn-sm plan-cta w-full">
                  Sign up
                </Link>
              )}

              {column.cta !== undefined && !pending && signedIn && isCurrent && (
                <p className="plan-current w-full">Your plan</p>
              )}

              {/*
                * A Lifetime holder gets no downgrade offer here either: `mockCancel` refuses
                * it (`not-applicable`, the same answer it gives for "nothing live" and
                * "already Free"), so the button could only ever report a failure — and it used
                * to report the *wrong* one, telling someone who had paid €149 that their
                * account "is already on Free".
                */}
              {column.cta !== undefined && !pending && signedIn && !isCurrent && isLifetime && (
                <p className="plan-current w-full">Included in Lifetime</p>
              )}

              {/*
                * **This card no longer cancels anything.** It used to call `mockCancel`
                * itself, behind a two-press confirmation added because one stray tap on a
                * price card ended a paid plan — and that confirmation then had to word, here,
                * a question `/billing` already words better: `cancelQuestion` names the plan
                * *and the day it stops*, which is the fact the reader is actually deciding on,
                * and this card had no way to know that date (`Viewer` carries no expiry, and
                * giving it one means widening `loadIdentity`, the read `RoleProvider` shares).
                * So there were two doors into the same destructive act with two different
                * questions behind them, the weaker one on the more casual surface — and the
                * reader who came through this one landed on `/billing` with no line saying
                * what had just happened.
                *
                * A link, therefore, and `?cancel=1` so the dated question is already open on
                * arrival rather than something to hunt for. This is what `switchToFree`'s own
                * comment was already arguing for one step short of the conclusion:
                * "duplicating it here would be the second copy this file already avoids
                * elsewhere". No confirmation needed on a link that only navigates, which is
                * why the two-press shape goes with the action it was protecting.
                */}
              {column.cta !== undefined && !pending && signedIn && !isCurrent && !isLifetime && (
                <Link href="/billing?cancel=1" className="btn btn-sm plan-cta w-full">
                  Switch to Free
                </Link>
              )}
            </article>
          )
        })}
      </div>

      <section className="mt-16">
        <h2 className="landing-feature-title">{tableTitle}</h2>

        <div className="plan-table-frame mt-5">
          <div className="plan-table-scroll">
            <table className="plan-table">
              <caption className="sr-only">The four plans compared, feature by feature.</caption>

              <thead>
                <tr>
                  {/* The row-header column has no heading of its own to give. */}
                  <th scope="col">
                    <span className="sr-only">Feature</span>
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column.name}
                      scope="col"
                      className={column.featured ? 'plan-table-featured' : undefined}
                    >
                      <span className="plan-table-name">{column.name}</span>
                      <span className="plan-table-price">
                        {column.price[period].amount}
                        {column.price[period].suffix}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">
                      <span className="plan-row-label">{row.label}</span>
                      <span className="plan-row-note">{row.note}</span>
                    </th>

                    {row.cells.map((cell, index) => {
                      const featured = columns[index].featured
                      const cellClass =
                        cell === null
                          ? featured
                            ? 'plan-cell-none plan-table-featured'
                            : 'plan-cell-none'
                          : featured
                            ? 'plan-table-featured'
                            : undefined

                      return (
                        <td key={columns[index].name} className={cellClass}>
                          {cell === null ? (
                            <>
                              {/*
                                * A dash is a glyph, not a word: read aloud it is either silence
                                * or "em dash", and neither says what the cell means. The word
                                * goes to a screen reader, the glyph to the eye.
                                */}
                              <span aria-hidden>—</span>
                              <span className="sr-only">Not included</span>
                            </>
                          ) : (
                            cell
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}

/**
 * The Lifetime panel's own button — split out from the panel itself, which stays
 * server-rendered in `pricing/page.tsx` (its title, price and trust note need nothing from
 * a session). Only the one thing that has to know who is looking moves here, into a
 * component that already reads `useRole()`, rather than a second `'use client'` boundary
 * opened just to ask the same question again.
 *
 * `href` is `/checkout/lifetime` for a signed-in reader, exactly as before; a reader with
 * no session yet gets `/register` instead, for the same reason every column above does —
 * a click on `/checkout/lifetime` with no session redirects through `/login` and loses
 * which purchase they meant, and Lifetime is not exempt from that just because it renders
 * outside the four-card grid.
 *
 * Already on Lifetime gets the same "Your plan" indicator the four cards show for their
 * own current plan, rather than a live "Choose Lifetime" that would only reach checkout to
 * be refused — `mockPurchase` already answers `not-applicable` there ("This account is
 * already on Lifetime — there is nothing left to buy."), so this is the one-step-earlier
 * version of the same fact, not a new rule.
 */
export function LifetimeCta({ href, viewer }: { href: string; viewer: Viewer }) {
  /* Handed the same server-decided `Viewer` the cards get, for the same reason — this panel
     was the fourth «Sign up» a signed-in reader saw before hydration. */
  const { email, plan, subscriptionPlan } = viewer
  const signedIn = email !== null

  if (!signedIn) {
    return (
      <Link href="/register" className="btn btn-primary btn-sm mt-4 w-full sm:w-auto">
        Sign up
      </Link>
    )
  }

  /*
   * The subscription, exactly as every card above asks it — this panel used to ask `plan`, and
   * so answered for a *gift* as if it were a purchase. Both directions were wrong on the same
   * page at the same time: an account gifted Lifetime was told "Your plan" here while all four
   * cards beside it offered to sell it an upgrade, and an account that had actually bought
   * Lifetime is a card this panel must never offer to sell again.
   */
  if ((plan === null ? null : (subscriptionPlan ?? 'free')) === 'lifetime') {
    return <p className="plan-current mt-4">Your plan</p>
  }

  return (
    <Link href={href} className="btn btn-primary btn-sm mt-4 w-full sm:w-auto">
      Choose Lifetime
    </Link>
  )
}
