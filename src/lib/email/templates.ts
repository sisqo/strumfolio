/**
 * Every email Resend sends, each returning `{ subject, html, text }` — plain data, no
 * `sendEmail` call inside — so the flows that own the actual send (registration,
 * verification, password recovery, `mockPurchase`, `mockCancel`, `/accounts`' own icons)
 * decide the recipient themselves.
 *
 * **They come in two shapes, and the split is the point.** The six transactional ones —
 * verification, welcome, password reset, purchase, plan change, gift notice — go through
 * `layout()`: the wash, the white card, the lockup, the payoff line. The two courtesy notes
 * go through `plainMessage()` and carry no chrome of any kind, because they are written to
 * read as one person typing rather than as the product announcing something. See
 * `courtesyThanksEmail`'s own header for the whole argument.
 *
 * Colors are the light half of `globals.css`'s palette, copied as hex rather than
 * `var(--x)`: most webmail clients strip `<style>` blocks and custom properties along
 * with them, and there is no dark mode to switch between in an inbox anyway. They apply to
 * the transactional half only — the courtesy notes declare no colour at all.
 */

import { APP_NAME, APP_PAYOFF, SITE_URL } from '@/lib/brand'
import { FEEDBACK_CATEGORY_LABEL, excerpt, type FeedbackCategory } from '@/lib/feedback/types'
import { euro } from '@/lib/plans/prices'

/*
 * The header is a hosted PNG lockup, not `<IconNote />`: that's an inline SVG, which mail
 * clients render inconsistently at best, so the app's own brand mark never appears here.
 * A plain `<img>` pointed at a real URL is the one thing every client — including images
 * blocked by default — handles the same way, the latter falling back to `alt`.
 */
const LOGO_URL = `https://${SITE_URL}/brand/email/logo.png`
/*
 * Both attributes are set, and their ratio has to be the lockup's own (2336:344 in
 * the vector, hence 163:24 and not a rounder 160): a mail client that has images
 * turned off draws the `alt` text in exactly this box, and one that shows them
 * scales the file to it — a width and height picked independently stretch the logo
 * by however much they disagree. The file itself is the 300px render, drawn at
 * roughly 2× for retina inboxes.
 */
const LOGO_WIDTH = 163
const LOGO_HEIGHT = 24

const BG = '#f6f5f2'
const SURFACE = '#ffffff'
const INK = '#16181d'
const MUTED = '#5c626c'
const LINE = '#dcdad4'
const ACCENT = '#97490f'
const ON_ACCENT = '#fffaf4'

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

export interface EmailTemplate {
  subject: string
  html: string
  text: string
}

/**
 * The chrome the six transactional emails share — not every email in this file: the two
 * courtesy notes deliberately have none, and `plainMessage()` below is what they use instead.
 *
 * The wash and the card go on a wrapper `<div>`, not on `<body>` — Gmail and most other
 * webmail rewrite or drop a message's own `<body>` tag and whatever is styled directly on it.
 */
function layout(bodyHtml: string): string {
  return `<div style="background:${BG};padding:32px 16px;font-family:${FONT};">
  <div style="max-width:480px;margin:0 auto;background:${SURFACE};border:1px solid ${LINE};border-radius:20px;padding:36px 32px;">
    <img src="${LOGO_URL}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="${APP_NAME}" style="display:block;border:0;margin:0 0 28px;" />
    ${bodyHtml}
  </div>
  <p style="max-width:480px;margin:20px auto 0;padding:0 4px;color:${MUTED};font-size:12px;line-height:1.5;text-align:center;">
    ${APP_NAME} — ${APP_PAYOFF}
  </p>
</div>`
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 12px;color:${INK};font-size:20px;font-weight:600;letter-spacing:-0.02em;">${text}</h1>`
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;color:${MUTED};font-size:14px;line-height:1.55;">${text}</p>`
}

/**
 * A paragraph of somebody else's words, in the ink colour and with their line breaks kept.
 *
 * `white-space:pre-wrap` is the whole reason this is not `paragraph`: a feature request is
 * typed into a textarea, and every blank line the reader put between their thoughts
 * collapses without it.
 */
function quoted(text: string): string {
  return `<p style="margin:0;color:${INK};font-size:14px;line-height:1.6;white-space:pre-wrap;">${text}</p>`
}

function button(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;margin:4px 0 20px;padding:13px 26px;background:${ACCENT};color:${ON_ACCENT};font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;">${label}</a>`
}

/**
 * The one thing in this file that ever handles text a person typed.
 *
 * Every other template interpolates a URL we minted, a plan name from a closed set or a
 * price — `feedbackEmail` is the first to put a reader's own sentences into an HTML
 * document, and an unescaped `<` in one of them is a malformed email at best. The five
 * characters are the standard set; `&` first, or it would double-escape the entities the
 * others introduce.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fallbackLink(url: string): string {
  return `<p style="margin:0;color:${MUTED};font-size:12px;line-height:1.5;word-break:break-all;">
    Or copy and paste this link into your browser:<br />
    <a href="${url}" style="color:${ACCENT};">${url}</a>
  </p>`
}

/**
 * A message with no chrome at all — no wash, no card, no lockup, no payoff line — in the shape
 * Gmail itself emits when a person types one: a `<div dir="ltr">`, paragraphs separated by
 * `<br><br>`, and not one `style` attribute anywhere, so the text inherits whatever font the
 * client reads mail in. `layout()` above is the six transactional templates; this is the two
 * that are meant to read as one person writing.
 *
 * **The shape, not the bytes.** Every paragraph goes through `escapeHtml`, so an apostrophe
 * leaves here as `&#39;` where Gmail would send the character — what renders is identical,
 * the source is not. The escape is what keeps `firstName` safe, the one part of these two
 * messages this file did not write, so it stays: the sentence above is not licence to remove
 * it.
 *
 * **Both halves come out of the same array**, which is the other reason this exists rather
 * than the two templates each spelling out an `html` and a `text` literal the way the
 * transactional ones do. With the HTML down to `<br><br>` the two are all but the same bytes,
 * and two hand-written copies of the same sentences drift in silence — a correction made in
 * one of them reaches nobody until it reaches a reader.
 *
 * The unsubscribe URL is a parameter rather than a last paragraph precisely because it is the
 * one place the halves *must* differ: a link on one side, the address spelled out on the
 * other. The line it builds is not decoration — these two are the only messages in this file
 * sent under legitimate interest rather than as a reply-carrying transaction, so they are the
 * only ones that owe a reader a way to say "stop." It reads in the body's own voice, the same
 * size as everything above it, because a footer in small grey type would be the one thing left
 * in the message announcing a machine wrote it.
 */
function plainMessage(paragraphs: string[], unsubscribeUrl: string): { html: string; text: string } {
  const optOut = "If you'd rather not get these, "

  const htmlParts = [...paragraphs.map(escapeHtml), `${escapeHtml(optOut)}<a href="${unsubscribeUrl}">unsubscribe</a>.`]
  const textParts = [...paragraphs, `${optOut}unsubscribe: ${unsubscribeUrl}`]

  return { html: `<div dir="ltr">${htmlParts.join('<br><br>')}</div>`, text: textParts.join('\n\n') }
}

export function verificationEmail(url: string): EmailTemplate {
  const subject = `Verify your email for ${APP_NAME}`

  const html = layout(`
    ${heading('Verify your address')}
    ${paragraph("One step left: open the link below to confirm your address and finish creating your account. The link expires in 24 hours.")}
    ${button('Verify email', url)}
    ${fallbackLink(url)}
    ${paragraph("If you didn't sign up, you can ignore this email. Until it's confirmed, the address isn't used for anything.")}
  `)

  const text = `Verify your address

One step left: open the link below to confirm your address and finish creating your account. The link expires in 24 hours.

${url}

If you didn't sign up, you can ignore this email. Until it's confirmed, the address isn't used for anything.

${APP_NAME} — ${APP_PAYOFF}`

  return { subject, html, text }
}

/**
 * `planClause` only while `SONGBOOK_PLANS=on` — the mandatory plan-choice gate
 * (`(home)/page.tsx`, v3.7) only actually redirects anyone when that flag is on, so a
 * reader who signs up while it is off would open the app straight to their songbooks and find
 * this email had promised a screen that never came. Read fresh per send rather than baked in
 * at build time, the same reason every other plan-aware reader of this flag is.
 *
 * Checked directly against `process.env` rather than by importing `plansEnforced` from
 * `lib/plans/resolve` — that module also value-imports `lib/db/client`, and this file is
 * reachable from `EmailPreview.tsx` (`'use client'`, via `lib/email/preview.ts`), so pulling
 * in the database driver here would break that client bundle.
 */
export function welcomeEmail(): EmailTemplate {
  const subject = `Welcome to ${APP_NAME}`

  const planClause =
    process.env.SONGBOOK_PLANS === 'on'
      ? " Before you get to them, we'll ask you to pick a plan — Free, with no card and no end date, is one of the choices."
      : ''

  const html = layout(`
    ${heading(`Welcome to ${APP_NAME}`)}
    ${paragraph(`Your account is ready, and it isn't empty: there's a songbook in it already, nine traditionals, so there's something to open straight away. When you're ready, bring in the songs you already have, build your own songbooks, and take them with you — on stage, in rehearsal, even with no signal.${planClause}`)}
  `)

  const text = `Welcome to ${APP_NAME}

Your account is ready, and it isn't empty: there's a songbook in it already, nine traditionals, so there's something to open straight away. When you're ready, bring in the songs you already have, build your own songbooks, and take them with you — on stage, in rehearsal, even with no signal.${planClause}

${APP_NAME} — ${APP_PAYOFF}`

  return { subject, html, text }
}

/**
 * The purchase confirmation (`mockPurchase`), and the one email in this file that is about
 * something the reader just *did* rather than a link they have to follow.
 *
 * **Worded as a real payment confirmation, deliberately, while the processor behind it is
 * still a stand-in that charges nothing** (`lib/plans/checkout.ts`, `FAKE_CARD`). That is a
 * decided trade-off and not an oversight, so the reasoning belongs here rather than in a commit
 * message: every account reaching this today is a test account, the app is neither advertised
 * nor linked from anywhere, and so there is nobody this can mislead — while writing the copy as
 * if the payment were real is what makes the day a processor actually lands a change of wiring
 * rather than a rewrite of every sentence a customer reads. The one thing to know when that day
 * comes: nothing in this template needs revisiting, because it already says what a real
 * purchase would say.
 *
 * The one clause that was *not* covered by that argument, and was corrected in v3.13, is
 * `endsOn`'s — see its own comment. A processor being a stand-in is why no money moved; it is
 * not a reason to name a renewal date that no code anywhere will act on.
 *
 * `amount` is `amountFor`'s own string (`plans/history.ts`), the same figure the ledger row
 * written in the same breath records — never recomputed here, so a receipt cannot disagree with
 * the history it is logged beside.
 */
export function purchaseEmail(input: {
  /** `PLAN_LABEL`'s spelling, resolved by the caller — this file names no plans of its own. */
  planLabel: string
  /** Euro, without the symbol; null when there is no price to name. */
  amount: string | null
  /** null for `lifetime`, which is bought once and has no cycle. */
  cycle: 'month' | 'year' | null
  /**
   * The day the period just paid for runs out, as a plain day — or null for a plan that has
   * no such day (`lifetime`).
   *
   * **Named for what it is, since v3.13.** This was `renewsOn`, and the sentence it fed said
   * «It renews on 3 May 2027» — a promise nothing in this repository keeps. `checkout.ts`
   * passes `planExpiresAt`, and nothing renews it: no cron, no webhook, no scheduled write
   * exists anywhere here, so when that day comes the entitlement simply stops
   * (`liveSubscription`, `plans/entitlements.ts`). The three screens were corrected to say so
   * in v3.12; this email was the last place still telling a customer a charge was coming that
   * never comes. Note what did *not* change with it: every other sentence here still reads as
   * a real payment confirmation, deliberately, for the reasons below — saying "it renews"
   * was not part of that pretence but a plain claim about a date, and the wrong one.
   */
  endsOn: string | null
  /**
   * The coupon redeemed, when one was — the code, what the listino said, and the sentence
   * `durationCopy` composed for the screen the customer just left.
   *
   * **This is the disclosure that matters most in the whole message**, and the reason it is a
   * field rather than something the caller folds into `amount`. A campaign that discounts three
   * months and then reverts means a charge going up from €2.44 to €3.49 at the fourth period —
   * the commercial deck calls that attrition and accepts it — and what makes it acceptable
   * rather than disputed is that the customer was told in writing, at the moment they paid,
   * and not only on a page they had already navigated away from.
   */
  coupon?: { code: string; fullAmount: string; duration: string | null } | null
}): EmailTemplate {
  const { planLabel, amount, cycle, endsOn, coupon } = input
  const subject = `Your ${planLabel} plan is active — thanks`

  /* «€9.49 per month», «€149, once», or nothing at all if there is no figure to name. */
  const paidClause =
    amount === null
      ? 'Your payment went through.'
      : cycle === null
        ? `We've received your payment of ${euro(amount)}.`
        : `We've received your payment of ${euro(amount)} for the first ${cycle}.`
  /*
   * Names the listino as well as the code, so the reduction is checkable rather than asserted
   * — «with FOUNDER30, off €34.99» is a sentence a customer can hold up against what left
   * their account. `duration` is the same sentence the checkout screen showed, passed through
   * rather than rewritten here: two wordings of one promise is how the two come to differ.
   */
  /*
   * `duration` is `null` for the Lifetime, which has no cycle and therefore no reversion to
   * describe — and the code and the full price still have to be named. An earlier version
   * dropped the whole clause whenever there was no cycle, which meant the one purchase that
   * is permanent, and the one nobody can escape by cancelling a renewal, was the single
   * confirmation that never said what the €139.99 had come off.
   */
  const couponClause =
    coupon == null
      ? ''
      : ` You used ${coupon.code}, off the full price of ${euro(coupon.fullAmount)}.` +
        (coupon.duration === null ? '' : ` ${coupon.duration}`)
  const renewalClause =
    endsOn === null
      ? 'There is nothing to renew — it stays yours, for good.'
      : `It runs until ${endsOn}, and you can change or cancel it any time from Billing.`

  const billingUrl = `https://${SITE_URL}/billing`

  const html = layout(`
    ${heading(`Thanks — you're on ${planLabel}`)}
    ${paragraph(`${paidClause}${couponClause} ${planLabel} is active on your account right now. ${renewalClause}`)}
    ${paragraph(`Your payment history and this plan's settings are in <a href="${billingUrl}" style="color:${ACCENT};">Billing</a>.`)}
  `)

  const text = `Thanks — you're on ${planLabel}

${paidClause}${couponClause} ${planLabel} is active on your account right now. ${renewalClause}

Your payment history and this plan's settings are in Billing: ${billingUrl}

${APP_NAME} — ${APP_PAYOFF}`

  return { subject, html, text }
}

/**
 * The other half of `purchaseEmail`: what a customer gets when a plan is taken away rather
 * than started — a cancellation, or a downgrade scheduled for the end of a period already
 * paid for.
 *
 * Until now the only plan email in the installation confirmed a purchase, so the one change a
 * customer most wants a written trace of left none: the cancellation existed on `/billing`'s
 * own screen and in the Telegram line the *operator* gets, and nowhere the customer could go
 * back and read it. Deliberately **not** sent when a scheduled change is undone («Keep
 * <plan>», `clearPendingChange`): that press takes nothing away, and an inbox does not need a
 * message per press.
 *
 * One template for the three shapes rather than three templates, because they differ in one
 * clause and agree in every other — the same argument `subscriptionStatusLine` makes for
 * being one function on three screens.
 *
 * `toLabel` of «Free» is what makes this a cancellation rather than a move; both other
 * sentences read the same either way, which is why there is no separate `kind` parameter to
 * get out of step with the labels.
 *
 * **Three shapes and not two, which is the whole reason `effect` is a union.** This took
 * `endsOn: string | null` at first, and that could not tell apart the two things a missing day
 * means: a change that has *already happened* (`mockCancel`'s immediate branch, a row with no
 * `planExpiresAt` to wait for) and one that is scheduled for a period end nobody may name — a
 * `grace` row, whose `planExpiresAt` is virtually always already in the past, because that
 * status is defined to ignore dates so a retrying card is not read as a lapse. Collapsed into
 * one `null`, whichever sentence was chosen was false for the other: «has been cancelled, back
 * on Free from now» over a plan still in force, or a past day named as the future. Naming the
 * past day was the version that shipped for one commit — the v3.12 bug in the one artifact a
 * reload cannot correct. `scheduledChangeDay` (`plans/subscriptionCopy.ts`) is where the rule
 * that decides `day` lives, stated once for this and for `cancelQuestion` alike.
 *
 * No shape is ever a promise of a charge, for the reason `purchaseEmail`'s `endsOn` was renamed
 * from `renewsOn`: nothing in this repository renews anything.
 */
export function planChangeEmail(input: {
  /** The plan in force right now — `PLAN_LABEL`'s spelling, resolved by the caller. */
  fromLabel: string
  /** What the account becomes: «Free» for a cancellation, a plan name for a downgrade. */
  toLabel: string
  /**
   * When it takes effect. `'now'` is done and already true of the account; `{ day }` is
   * scheduled for the end of a period already paid for, with `day: null` for the one scheduled
   * case that has no day worth naming — see the header.
   */
  effect: 'now' | { day: string | null }
}): EmailTemplate {
  const { fromLabel, toLabel, effect } = input
  const cancelling = toLabel === 'Free'
  /* `'now'` first, so `day` is only ever read on a change that has not happened yet. */
  const day = effect === 'now' ? null : effect.day

  const subject =
    effect === 'now'
      ? `Your ${fromLabel} plan has been cancelled`
      : day === null
        ? cancelling
          ? `Your ${fromLabel} plan is set to end`
          : `Your plan is set to move to ${toLabel}`
        : cancelling
          ? `Your ${fromLabel} plan ends on ${day}`
          : `Your plan moves to ${toLabel} on ${day}`

  /* The dateless scheduled sentence is `CheckoutScreen`'s own, word for word — that screen
     already had to word this exact state before its button, and two wordings of "the period you
     have been billed for, whenever that ends" is two wordings too many. */
  const what =
    effect === 'now'
      ? `${fromLabel} has been cancelled, and this account is back on Free from now.`
      : day === null
        ? `${fromLabel} stays in force until the period it has already been billed for ends. ` +
          (cancelling ? 'This account goes back to Free then.' : `This account moves to ${toLabel} then.`)
        : cancelling
          ? `${fromLabel} stays in force until ${day}. On that day this account goes back to Free.`
          : `${fromLabel} stays in force until ${day}. On that day this account moves to ${toLabel}.`

  /* The one reassurance worth repeating from /pricing's own trust note, because this is the
     moment a musician wonders about it: nothing they put in is deleted by a plan ending.

     «printable» is deliberately not in the list, here or on /pricing — see `TRUST_NOTE_REST`'s
     own comment for the whole reason. The short of it: going back to Free means
     `PLANS.free.booklet === 'no'`, so `loadBooklet` refuses, and the booklet PDF is the only
     way to print anything in this app. This message is sent precisely when the plan ends, so
     it is the one place the reader could act on the claim the same day it stopped being true. */
  const kept = 'Nothing you have put in is touched: your songs stay readable and exportable.'

  /* «before then» rather than «before that day», so the one sentence serves the named-day shape
     and the dateless one alike — after «ends on 22 September 2027» it reads the same. */
  const undo =
    effect === 'now'
      ? 'You can start a plan again whenever you want.'
      : `Changed your mind? «Keep ${fromLabel}» in Billing calls this off, any time before then.`

  const billingUrl = `https://${SITE_URL}/billing`

  const html = layout(`
    ${heading(subject)}
    ${paragraph(what)}
    ${paragraph(kept)}
    ${paragraph(undo)}
    ${button('Open Billing', billingUrl)}
  `)

  const text = `${subject}

${what}

${kept}

${undo}

${billingUrl}

${APP_NAME} — ${APP_PAYOFF}`

  return { subject, html, text }
}

/**
 * The gift notice: an operator has put a plan on somebody's account by hand, and this is what
 * that person is told about it.
 *
 * **The only template here whose subject is an argument rather than its own.** An operator
 * reviews and may rewrite it in the confirmation dialog on `/accounts/[email]` before anything
 * is sent, so the default lives where that dialog can reach it (`accounts/giftNotice.ts`,
 * `defaultGiftSubject`) and arrives here already decided. The heading below is deliberately
 * **not** that subject — unlike `planChangeEmail`, which prints its own — because a heading is
 * HTML and this subject is a person's typing; keeping them apart is what lets the subject go
 * out unescaped, which is correct for a mail header and wrong for a document.
 *
 * `personalLine` is the other half of that: the one sentence the operator may add, escaped
 * into the HTML and raw in the plain text, exactly as `feedbackEmail` treats the message a
 * reader typed. It sits after the gift and before the practical line, which is where a
 * «congratulations on the album» belongs — attached to the gift rather than to the mechanics.
 *
 * **No figure is ever named**, unlike `purchaseEmail`: a gift that says what it is worth reads
 * as an invoice, and it would also tie this copy to a listino that moves. And no clause
 * describes what happens after `endsOn` — a decision, not an omission: the message is kept
 * short and about the gift, and nothing in this repository runs on a schedule to say it later.
 *
 * The button goes to `/` and never to `/billing`. A hand-given plan lives in the `granted_*`
 * columns and `loadCheckoutStatus` reports `liveSubscription`, which ignores them — so
 * Billing tells somebody holding a gifted Premium that they have no subscription at all.
 */
export function giftEmail(input: {
  /** `PLAN_LABEL`'s spelling, resolved by the caller — this file names no plans of its own. */
  planLabel: string
  /**
   * The day the gift runs out, already written out («1 March 2027»), or null for one that
   * never does — `lifetime`, or any plan given with no end date.
   *
   * Formatted by the caller, like `purchaseEmail`'s `endsOn` and for a sharper reason than
   * consistency: the stored `granted_until` is the *end* of its day in UTC (23:59:59.999Z),
   * so handing it to `toLocaleDateString` anywhere east of Greenwich prints the day after the
   * one the operator typed and the admin screen shows.
   */
  endsOn: string | null
  /** One sentence from the operator, or null. The only person-typed text in this document. */
  personalLine: string | null
  /** Reviewed, possibly rewritten, and already clamped by the action that sends this. */
  subject: string
}): EmailTemplate {
  const { planLabel, endsOn, personalLine, subject } = input

  const gift =
    endsOn === null
      ? `We've put ${planLabel} on your account — free, and it doesn't run out.`
      : `We've put ${planLabel} on your account — free, and yours until ${endsOn}.`
  const practical = `There is nothing to set up and nothing to pay: everything ${planLabel} opens up is already on.`

  const startUrl = `https://${SITE_URL}/`

  const html = layout(`
    ${heading('A gift for you')}
    ${paragraph(gift)}
    ${personalLine === null ? '' : paragraph(escapeHtml(personalLine))}
    ${paragraph(practical)}
    ${button('Open your songbooks', startUrl)}
  `)

  const text = `A gift for you

${gift}
${personalLine === null ? '' : `\n${personalLine}\n`}
${practical}

${startUrl}

${APP_NAME} — ${APP_PAYOFF}`

  return { subject, html, text }
}

/**
 * The founder's own note, a week or so after signing up — sent by hand, one account at a
 * time, from an icon on `/accounts` (`lib/courtesy/actions.ts`), never on a schedule.
 *
 * **The only two messages in this file with no design at all**, and the reason `plainMessage`
 * exists next to `layout`. Every other template here is a document: a lockup, a card, a
 * headline, a colour. These two are meant to read as an email one person typed to another, so
 * they carry no wash, no card, no logo, no payoff footer, no heading tier — and, below that,
 * not one `style` attribute, which is what a message composed in Gmail actually looks like on
 * the wire. See the root `CLAUDE.md`'s courtesy/transactional split: "courtesy emails have a
 * face, transactional ones don't." The chrome was the last thing left contradicting it.
 *
 * **The cost is real and was accepted.** With no `font-family` declared, the message inherits
 * the client's own reading font: in Gmail — where these are read, and which is the target —
 * that is indistinguishable from something typed by hand; in Outlook desktop it may come out
 * in a serif. There is no `max-width` either, so on a wide window the lines run the width of
 * it, because Gmail sends none. Declaring a font stack would fix both and would also be the
 * first visible thing these messages did that a person writing one would not.
 *
 * **The opt-out line is in the body's own voice**, the same size and colour as everything
 * above it, rather than in the small grey type every bulk sender uses (see `plainMessage`).
 * It cannot be dropped: these two are sent under legitimate interest, Art. 6(1)(f), which the
 * Privacy Policy's §3 table and §7 right-to-object list both name — and `lib/courtesy/`'s own
 * `CLAUDE.md` carries the rest. No `List-Unsubscribe` header goes with it, deliberately:
 * Gmail draws its own "Unsubscribe" button beside the sender for mail it reads as bulk, and
 * that button would be the one thing in the window announcing a machine, after everything
 * else was taken away to avoid announcing one.
 *
 * `from`/`replyTo` are both set by the caller to `Francesco from Strumfolio <info@strumfolio.com>`
 * — a **named** sender, not only a reply-to, unlike every transactional template in this file
 * including `giftEmail`. The display name keeps "from Strumfolio" on purpose: a reader who
 * signed up a week ago does not know the name, and a bare first name from an unknown domain
 * is the shape of spam. That is a decision about how this app looks in an inbox, not a fact
 * this function has an opinion about, so it is not baked in here.
 */
export function courtesyThanksEmail(input: {
  /** Escaped by `plainMessage` for the HTML half and left raw for the text one — the
      convention this file already applies to anything it did not itself write, even a name. */
  firstName: string | null
  /** Built by the caller from `courtesyUnsubscribeToken` — never a real one in a preview. */
  unsubscribeUrl: string
}): EmailTemplate {
  const { firstName, unsubscribeUrl } = input
  const greeting = firstName === null ? 'Hi,' : `Hi ${firstName},`

  return {
    subject: 'A thank-you and a question',
    ...plainMessage(
      [
        greeting,
        "I'm Francesco, the person who builds Strumfolio. I wanted to thank you personally for signing up, and I'd love to know a bit about your music and how Strumfolio can help.",
        'What do you play? Guitar, ukulele, piano, just voice. And what do you usually play — songwriters, worship, standards, your own songs, a bit of everything.',
        "The other thing I'd love to know is where you picture using it: on stage, at rehearsal, in a lesson, or just on the sofa on a Sunday.",
        'Just reply to this email — I read it myself. One sentence is plenty.',
        'Francesco',
        'P.S. And how did you find Strumfolio? A forum, a friend, a search, a chat with an AI. It tells me where to spend my time.',
      ],
      unsubscribeUrl,
    ),
  }
}

/**
 * The second and last note, sent only once `courtesyThanksEmail` has actually gone out to the
 * same address — enforced in `lib/courtesy/actions.ts`, not here: this function has no way to
 * know what has already been sent, and "still Francesco" / "a second and last time" are only
 * true when that ordering holds. See `courtesyThanksEmail`'s own header for the rest of the
 * shared reasoning (no chrome, no declared font, the named `from`).
 */
export function courtesyCheckinEmail(input: {
  firstName: string | null
  unsubscribeUrl: string
}): EmailTemplate {
  const { firstName, unsubscribeUrl } = input
  const greeting = firstName === null ? 'Hi,' : `Hi ${firstName},`

  return {
    subject: 'Anything you need?',
    ...plainMessage(
      [
        greeting,
        "Still Francesco. Writing to you a second and last time, to ask whether there's something you need that you're not finding right now.",
        "It could be a feature you expected, a format Strumfolio doesn't read, something you couldn't work out how to do, or just an idea that came to you looking at it. Even one line is useful to me.",
        "Requests don't turn into a ticket here: whatever you tell me goes on the list of things to do. And if what you're looking for already exists, I'll point you to it.",
        'Just reply to this email — I read it myself.',
        'Francesco',
      ],
      unsubscribeUrl,
    ),
  }
}

/**
 * The "Share your feedback" sheet's one send, covering all four categories — replaces
 * `featureRequestEmail`, which only ever covered one of them.
 *
 * The category (and, for a feature request, the priority) lives in the *subject*, not only
 * the body, for the same reason `featureRequestEmail` put the plan tier there: nothing in
 * this codebase can enforce an order of answering, so what it can do is make the category
 * impossible to miss in a list of subjects. The message itself has no separate one-line
 * summary to put there instead — the mock has a single "Your message" field — so an excerpt
 * of the message stands in for it.
 */
export function feedbackEmail(input: {
  from: string
  plan: string
  category: FeedbackCategory
  priority: boolean
  message: string
  screenshotFilename: string | null
}): EmailTemplate {
  const tag = input.priority ? '[priority] ' : ''
  const categoryLabel = FEEDBACK_CATEGORY_LABEL[input.category]
  const subject = `${tag}${categoryLabel}: ${excerpt(input.message, 60)}`

  const who = `From ${input.from} — ${input.plan}${input.priority ? ', priority' : ''}`
  const attachmentLine =
    input.screenshotFilename === null ? '' : `Screenshot attached: ${input.screenshotFilename}`

  const html = layout(`
    ${heading(escapeHtml(categoryLabel))}
    ${paragraph(escapeHtml(who))}
    ${quoted(escapeHtml(input.message))}
    ${attachmentLine === '' ? '' : paragraph(escapeHtml(attachmentLine))}
  `)

  const text = `${categoryLabel}

${who}

${input.message}
${attachmentLine === '' ? '' : `\n${attachmentLine}\n`}
${APP_NAME} — ${APP_PAYOFF}`

  return { subject, html, text }
}

export function passwordResetEmail(url: string): EmailTemplate {
  const subject = `Reset your ${APP_NAME} password`

  const html = layout(`
    ${heading('Reset your password')}
    ${paragraph('Open the link below to choose a new password. The link expires in one hour.')}
    ${button('Reset password', url)}
    ${fallbackLink(url)}
    ${paragraph("If you didn't ask for this, you can ignore this email: your password stays as it is.")}
  `)

  const text = `Reset your password

Open the link below to choose a new password. The link expires in one hour.

${url}

If you didn't ask for this, you can ignore this email: your password stays as it is.

${APP_NAME} — ${APP_PAYOFF}`

  return { subject, html, text }
}
