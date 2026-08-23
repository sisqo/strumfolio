/**
 * The four emails Resend sends: verification, welcome and password reset (PLAN.md, v3.2
 * point 8), and the purchase thank-you added with the checkout's own flow. Each returns
 * `{ subject, html, text }` — plain data, no `sendEmail` call inside — so the flows that own
 * the actual send (registration, verification, password recovery, `mockPurchase`) decide the
 * recipient themselves.
 *
 * Colors are the light half of `globals.css`'s palette, copied as hex rather than
 * `var(--x)`: most webmail clients strip `<style>` blocks and custom properties along
 * with them, and there is no dark mode to switch between in an inbox anyway.
 */

import { APP_NAME, APP_PAYOFF, SITE_URL } from '@/lib/brand'
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
 * The chrome every email shares: the wash and the card go on a wrapper `<div>`, not on
 * `<body>` — Gmail and most other webmail rewrite or drop a message's own `<body>` tag
 * and whatever is styled directly on it.
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

function button(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;margin:4px 0 20px;padding:13px 26px;background:${ACCENT};color:${ON_ACCENT};font-size:15px;font-weight:600;text-decoration:none;border-radius:999px;">${label}</a>`
}

function fallbackLink(url: string): string {
  return `<p style="margin:0;color:${MUTED};font-size:12px;line-height:1.5;word-break:break-all;">
    Or copy and paste this link into your browser:<br />
    <a href="${url}" style="color:${ACCENT};">${url}</a>
  </p>`
}

export function verificationEmail(url: string): EmailTemplate {
  const subject = `Verify your email for ${APP_NAME}`

  const html = layout(`
    ${heading('Verify your email')}
    ${paragraph('Click the button below to verify your email address and finish setting up your account. This link expires in 24 hours.')}
    ${button('Verify email', url)}
    ${fallbackLink(url)}
  `)

  const text = `Verify your email

Click the link below to verify your email address and finish setting up your account. This link expires in 24 hours.

${url}

${APP_NAME} — ${APP_PAYOFF}`

  return { subject, html, text }
}

/**
 * `planClause` only while `SONGBOOK_PLANS=on` — the mandatory plan-choice gate
 * (`(home)/page.tsx`, PLAN.md v3.7) only actually redirects anyone when that flag is on, so a
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
    ${paragraph(`Your account is ready. Import the songs you already have, build your songbooks, and take them with you — on stage, in rehearsal, even offline.${planClause}`)}
  `)

  const text = `Welcome to ${APP_NAME}

Your account is ready. Import the songs you already have, build your songbooks, and take them with you — on stage, in rehearsal, even offline.${planClause}

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
  /** The next renewal as a plain day, or null for a plan that never renews. */
  renewsOn: string | null
}): EmailTemplate {
  const { planLabel, amount, cycle, renewsOn } = input
  const subject = `Your ${planLabel} plan is active — thanks`

  /* «€9.49 per month», «€149, once», or nothing at all if there is no figure to name. */
  const paidClause =
    amount === null
      ? 'Your payment went through.'
      : cycle === null
        ? `We've received your payment of ${euro(amount)}.`
        : `We've received your payment of ${euro(amount)} for the first ${cycle}.`
  const renewalClause =
    renewsOn === null
      ? 'There is nothing to renew — it stays yours, for good.'
      : `It renews on ${renewsOn}, and you can change or cancel it any time before then.`

  const startUrl = `https://${SITE_URL}/`
  const billingUrl = `https://${SITE_URL}/billing`

  const html = layout(`
    ${heading(`Thanks — you're on ${planLabel}`)}
    ${paragraph(`${paidClause} ${planLabel} is active on your account right now. ${renewalClause}`)}
    ${paragraph('Next: make a songbook, put your first songs in it, and take it with you — on stage, in rehearsal, even with no signal.')}
    ${button('Start your songbook', startUrl)}
    ${paragraph(`Your payment history and this plan's settings are in <a href="${billingUrl}" style="color:${ACCENT};">Billing</a>.`)}
  `)

  const text = `Thanks — you're on ${planLabel}

${paidClause} ${planLabel} is active on your account right now. ${renewalClause}

Next: make a songbook, put your first songs in it, and take it with you — on stage, in rehearsal, even with no signal.

${startUrl}

Your payment history and this plan's settings are in Billing: ${billingUrl}

${APP_NAME} — ${APP_PAYOFF}`

  return { subject, html, text }
}

export function passwordResetEmail(url: string): EmailTemplate {
  const subject = `Reset your ${APP_NAME} password`

  const html = layout(`
    ${heading('Reset your password')}
    ${paragraph("Click the button below to choose a new password. If you didn't request this, you can safely ignore this email — your password won't change.")}
    ${button('Reset password', url)}
    ${fallbackLink(url)}
  `)

  const text = `Reset your password

Click the link below to choose a new password. If you didn't request this, you can safely ignore this email — your password won't change.

${url}

${APP_NAME} — ${APP_PAYOFF}`

  return { subject, html, text }
}
