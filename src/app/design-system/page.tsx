import type { Metadata } from 'next'

import { notFound } from 'next/navigation'

import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TokenValue } from '@/components/TokenValue'
import { TopBar } from '@/components/TopBar'
import { IconCheck, IconClose, IconInfo, IconSearch } from '@/components/icons'
import * as Icons from '@/components/icons'
import { auth } from '@/auth'
import { isOwner } from '@/lib/allowlist'

export const metadata: Metadata = { title: 'Design system' }

/** The owner check depends on the request session, same as `/emails` and `/pages`. */
export const dynamic = 'force-dynamic'

const ICON_NAMES = Object.keys(Icons).filter((name) => name.startsWith('Icon')) as (keyof typeof Icons)[]

const NEUTRAL_TOKENS: { name: string; note: string }[] = [
  { name: '--bg', note: 'The page itself.' },
  { name: '--surface', note: 'A card.' },
  { name: '--surface-2', note: 'Recessed fill — grouped controls, slider tracks, inset panels.' },
  { name: '--surface-3', note: 'A row inside a card.' },
  { name: '--ink', note: 'Primary text.' },
  { name: '--muted', note: 'Secondary text, captions.' },
  { name: '--faint', note: 'Decorative glyphs and disabled controls only — never real text.' },
  { name: '--line', note: "Hairline dividers. Doubles as --edge, dark mode's border color." },
]

const ACCENT_TOKENS: { name: string; note: string }[] = [
  { name: '--accent', note: 'The chord color, first and only — see the Chord-First Rule below.' },
  { name: '--accent-soft', note: 'A soft tint: badges, active nav states, capo notices.' },
  { name: '--on-accent', note: 'Text on an accent fill.' },
  { name: '--danger', note: 'Errors, destructive actions.' },
  { name: '--danger-soft', note: 'Error backgrounds.' },
  { name: '--success', note: 'Confirmations.' },
  { name: '--success-soft', note: 'Success backgrounds.' },
]

const PLAN_BADGES: { plan: string; className: string; colorVar: string }[] = [
  { plan: 'Standard', className: 'plan-badge-standard', colorVar: '--plan-standard' },
  { plan: 'Plus', className: 'plan-badge-plus', colorVar: '--plan-plus' },
  { plan: 'Premium', className: 'plan-badge-premium', colorVar: '--plan-premium' },
  { plan: 'Lifetime', className: 'plan-badge-lifetime', colorVar: '--plan-lifetime' },
]

const AVATAR_TOKENS = ['--avatar-0', '--avatar-1', '--avatar-2', '--avatar-3', '--avatar-4', '--avatar-5']

const RADIUS_TOKENS: { name: string; note: string }[] = [
  { name: '--r-xs', note: 'A button inside a grouped control; the brand mark.' },
  { name: '--r-sm', note: 'An icon button.' },
  { name: '--r-md', note: 'A row inside a card.' },
  { name: '--r-lg', note: 'A field; a cluster on the reading bar.' },
  { name: '--r-panel', note: 'A popover.' },
  { name: '--r-xl', note: 'A card.' },
  { name: '--r-2xl', note: 'The reading bar itself.' },
  { name: '--r-pill', note: 'Every button — the one shape reserved for actions.' },
]

const SHADOW_TOKENS: { name: string; note: string }[] = [
  { name: '--shadow-1', note: 'A resting card, separated from the page. None in dark.' },
  { name: '--shadow-2', note: 'A card that leads somewhere, lifted further. None in dark.' },
  { name: '--shadow-float', note: 'The reading control bar — floats over the song in both themes.' },
  { name: '--shadow-panel', note: 'A popover: menu, reading panel, chord shape.' },
]

/**
 * Not shadows, and not colours in the palette's sense either: what goes *over* the page
 * while something is open on top of it. They earn a section of their own here because they
 * are the one pair of tokens that points in opposite directions in the two themes, which is
 * a thing to look at rather than to read about — toggle the theme on this page and the
 * specimens below invert.
 */
const VEIL_TOKENS: { name: string; note: string }[] = [
  { name: '--veil', note: 'Behind a panel that hangs off a control: menu, reading panel, speed popover.' },
  { name: '--dim', note: 'Behind a dialog that interrupts: upgrade modal, sample songbook, a chord shape.' },
]

const DO_RULES = [
  'reserve the accent (Chord Terracotta / Chord Amber) for chords first; anything else using it must read quieter than a chord on the sheet.',
  'design light and dark as two independent, hand-tuned surfaces — never assume a dark value by formula from its light counterpart.',
  'use a shadow for elevation in light and a border (--edge) in dark; never both on the same surface.',
  'size every corner radius by the shape’s job (how nested it is), not by the shape’s absolute size.',
  'keep the pill shape exclusive to actionable buttons — a card, a field, a badge, none of those are pills.',
  'provide a prefers-reduced-motion: reduce alternative for every animation.',
  'hit a 2.75rem (44px) minimum control size anywhere a control is tapped repeatedly mid-performance.',
]

const DONT_RULES = [
  'build anything resembling the ad-heavy, cluttered chord/tab site aesthetic — no ad slots, no popups, no competing calls to action around the reading surface.',
  'default to a generic flat-dark developer-tool look (near-black surface, single neon accent) — this dark theme is warm and hand-tuned, not a formulaic inversion.',
  'use a side-stripe as a decorative colored accent anywhere outside the sheet’s own chorus/bridge indent.',
  'give a disabled primary button a faded/opacity treatment — drop the fill to the flat disabled state instead.',
  'let a translucent or blurred surface sit over the song sheet — use a solid page-colored background instead.',
  'introduce a second display font or a bold weight above 600 outside chord names.',
]

/** The demo frame every specimen below sits in: a bordered box on either the page's own color or a card's, so a shadow or a border reads the way it would in the real app rather than floating on nothing. */
function Well({ tone = 'bg', children }: { tone?: 'bg' | 'surface'; children: React.ReactNode }) {
  return (
    <div className="specimen">
      <div
        className="flex min-h-[7rem] items-center justify-center p-6"
        style={{ background: tone === 'bg' ? 'var(--bg)' : 'var(--surface)' }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * A global-owner-only reference for this app's design language: every color, radius, shadow
 * and component class this app ships, rendered through the real token or the real class
 * rather than a hand-typed copy of either — so nothing here can say something the stylesheet
 * has stopped saying. `DESIGN.md` is the living prose source this page renders alongside;
 * `notFound()` rather than a role notice, the same reasoning as every other owner-only page
 * in this app (`/accounts`, `/emails`, `/pages`): "this does not exist" and "this is not
 * yours" should look identical from outside.
 */
export default async function DesignSystemPage() {
  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) notFound()

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="design-system" />

      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-3 sm:px-8">
        <header className="max-w-[42rem]">
          <h1 className="screen-title">Design system</h1>
          <p className="brand-lede-note mt-2">
            Every color, radius, shadow and component class this app ships, live off the real token or the real
            class — never a hand-typed copy of either. Toggle the theme in the header and every specimen below
            follows it. <code className="brand-code">DESIGN.md</code> in the repo is this page&rsquo;s prose twin, kept
            in sync by hand.
          </p>
        </header>

        <div className="notice mt-6 max-w-[42rem]">
          <IconInfo size={17} />
          <span>
            <code className="brand-code">DESIGN.md</code>&rsquo;s frontmatter names tokens by design intent (
            <code className="brand-code">chord-terracotta</code>, <code className="brand-code">paper-surface</code>
            …); the CSS custom properties below are what actually ships and are what this page renders throughout.
          </span>
        </div>

        {/* ---- Colors ------------------------------------------------ */}

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Colors</h2>
          <p className="brand-text">
            One reserved accent and a neutral paper-to-ink ramp that inverts — not flips — between light and dark:
            every value was chosen independently for its own theme, never computed from the other.
          </p>

          <ul className="swatch-grid">
            {ACCENT_TOKENS.map((token) => (
              <li key={token.name} className="swatch">
                <span className="swatch-chip" style={{ background: `var(${token.name})` }} aria-hidden />
                <span className="swatch-name font-mono">{token.name}</span>
                <span className="swatch-hex">
                  <TokenValue name={token.name} />
                </span>
                <span className="brand-note">{token.note}</span>
              </li>
            ))}
          </ul>

          <h3 className="brand-subhead">Neutral ramp</h3>
          <ul className="swatch-grid">
            {NEUTRAL_TOKENS.map((token) => (
              <li key={token.name} className="swatch">
                <span
                  className="swatch-chip"
                  style={{ background: `var(${token.name})` }}
                  aria-hidden
                />
                <span className="swatch-name font-mono">{token.name}</span>
                <span className="swatch-hex">
                  <TokenValue name={token.name} />
                </span>
                <span className="brand-note">{token.note}</span>
              </li>
            ))}
          </ul>

          <h3 className="brand-subhead">Plan badges — a declared exception</h3>
          <p className="brand-text">
            A warm ramp, one colour per paid plan — cool grey-blue to the brand terracotta for Premium — lives only
            on <code className="brand-code">/accounts</code>, the operator screen, which has no song sheet and no
            chords to compete with. Free and No plan stay on the ink ramp; the row&rsquo;s Status column tells them
            apart. Everywhere a reader (rather
            than an operator) sees a plan name — the account menu, <code className="brand-code">/pricing</code>,{' '}
            <code className="brand-code">/billing</code> — stays on the single accent-colored{' '}
            <code className="brand-code">.badge</code> shown further down.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {PLAN_BADGES.map((plan) => (
              <span key={plan.className} className={`badge ${plan.className}`}>
                {plan.plan}
              </span>
            ))}
            <span className="badge plan-badge-unchosen">Awaiting choice</span>
            <span className="badge plan-badge-none">No plan</span>
            <span className="badge plan-badge-free">Free</span>
          </div>

          <h3 className="brand-subhead">Avatar palette</h3>
          <p className="brand-text">
            Six colors, deterministic per email (<code className="brand-code">avatarColorIndex</code>) — not
            redefined for dark mode, unlike everything else here, since a color picked per person isn&rsquo;t part
            of the page&rsquo;s own palette the way the accent is.
          </p>
          <ul className="swatch-grid">
            {AVATAR_TOKENS.map((name) => (
              <li key={name} className="swatch">
                <span className="avatar avatar-lg" style={{ background: `var(${name})` }} aria-hidden>
                  ··
                </span>
                <span className="swatch-name font-mono mt-2">{name}</span>
                <span className="swatch-hex">
                  <TokenValue name={name} />
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- Typography ---------------------------------------------- */}

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Typography</h2>
          <p className="brand-text">
            A single geometric sans, Outfit, carries every voice in the app — from a hero headline to a field
            label — so nothing in the interface competes with the song itself. Geist Mono appears only where
            alignment is literal: tablature.
          </p>

          <div className="card-stack mt-4">
            <div className="card p-5">
              <p className="landing-hero-title">Sing anywhere.</p>
              <p className="brand-note mt-2">
                Hero — <code className="brand-code">.landing-hero-title</code>. The one headline on the public
                page.
              </p>
            </div>
            <div className="card p-5">
              <p className="screen-title">Songs</p>
              <p className="brand-note mt-2">
                Screen title — <code className="brand-code">.screen-title</code>. The name of the current screen.
              </p>
            </div>
            <div className="card p-5">
              <p className="section-title">Colors</p>
              <p className="brand-note mt-2">
                Section title — <code className="brand-code">.section-title</code>. One step down, for a section
                inside a screen.
              </p>
            </div>
            <div className="card p-5">
              <p className="text-[1rem] leading-[1.5]">
                Default reading text, capped by each container&rsquo;s own max-width.
              </p>
              <p className="brand-note mt-2">Body — 400 weight, 1rem, line-height 1.5.</p>
            </div>
            <div className="card p-5">
              <span className="group-label">Group label</span>
              <p className="brand-note mt-2">
                Label — <code className="brand-code">.group-label</code> / <code className="brand-code">.field-label</code>. The
                only uppercase, tracked text in the system.
              </p>
            </div>
            <div className="card p-5">
              <span>
                <span className="sheet-word">
                  <span className="sheet-chord">G</span>
                </span>{' '}
                Sun is up, sky is blue
              </span>
              <p className="brand-note mt-2">
                Chord — <code className="brand-code">.sheet-chord</code>. Smaller and lighter than the lyric
                underneath it on purpose: a chord you read instead of singing is sized wrong.
              </p>
            </div>
            <div className="card p-5">
              <pre className="sheet-tab">{'e|--0---1---3---|\nB|--1---1---0---|'}</pre>
              <p className="brand-note mt-2">
                Tab — <code className="brand-code">.sheet-tab</code>. Geist Mono, the only place this app uses a
                second typeface.
              </p>
            </div>
          </div>
        </section>

        {/* ---- Radius ---------------------------------------------------- */}

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Corner radius</h2>
          <p className="brand-text">
            Sized by the shape&rsquo;s job — how nested it sits — never by the shape&rsquo;s own size: a button
            inside a cluster is rounder than the card that cluster sits in, which is rounder again than the field
            beside it.
          </p>
          <div className="icon-grid">
            {RADIUS_TOKENS.map((token) => (
              <div key={token.name} className="icon-cell">
                <Well>
                  <div
                    className="h-16 w-16"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--line)',
                      borderRadius: `var(${token.name})`,
                    }}
                  />
                </Well>
                <h3 className="icon-cell-name font-mono">{token.name}</h3>
                <p className="brand-note">
                  {token.note} <TokenValue name={token.name} />
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Veils ------------------------------------------------------- */}

        {/*
          * Before Elevation rather than after: both answer "how does one surface separate
          * from another", and a veil is the answer when the two are a panel and the whole
          * page rather than a card and the paper under it.
          */}
        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Veils</h2>
          <p className="brand-text">
            A veil mutes what is behind it — it takes contrast away from the page so the thing in front reads
            first. Which means it darkens in light and <em>lightens</em> in dark: muting is moving the ground
            towards the text, and the text is dark on light and light on dark. It is also the only direction that
            does anything, since dark’s page is nearly black and a dark veil over it is invisible. Toggle the
            theme in the header and these two invert.
          </p>
          <div className="icon-grid">
            {VEIL_TOKENS.map((token) => (
              <div key={token.name} className="icon-cell">
                <Well>
                  {/* The specimen is the veil over a line of type, because what it acts on is
                      legibility rather than a surface: half the sample is veiled, half is not. */}
                  <div
                    className="relative flex h-16 w-24 items-center justify-center overflow-hidden"
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--edge)',
                      borderRadius: 'var(--r-lg)',
                    }}
                  >
                    <span className="text-sm font-medium">Aa Bb</span>
                    <span
                      className="absolute inset-y-0 end-0 w-1/2"
                      style={{ background: `var(${token.name})` }}
                    />
                  </div>
                </Well>
                <h3 className="icon-cell-name font-mono">{token.name}</h3>
                <p className="brand-note">{token.note}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Elevation --------------------------------------------------- */}

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Elevation</h2>
          <p className="brand-text">
            A shadow in light, a border in dark — never both on one surface. Toggle the theme in the header: the
            two resting shadows drop to none and <code className="brand-code">--edge</code> takes over; the two
            that float keep a real shadow in both themes, because something genuinely lifted over the song has to
            read as lifted regardless of theme.
          </p>
          <div className="icon-grid">
            {SHADOW_TOKENS.map((token) => (
              <div key={token.name} className="icon-cell">
                <Well>
                  <div
                    className="h-16 w-24"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--edge)',
                      borderRadius: 'var(--r-lg)',
                      boxShadow: `var(${token.name})`,
                    }}
                  />
                </Well>
                <h3 className="icon-cell-name font-mono">{token.name}</h3>
                <p className="brand-note">{token.note}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Components ---------------------------------------------- */}

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Buttons</h2>
          <p className="brand-text">
            One shape, a full pill, reserved exclusively for actions — nothing else in the app is pill-shaped.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="btn">
              Secondary
            </button>
            <button type="button" className="btn btn-primary">
              Primary
            </button>
            <button type="button" className="btn btn-primary" disabled>
              Primary, disabled
            </button>
            <button type="button" className="btn btn-quiet">
              Quiet
            </button>
            <button type="button" className="btn btn-ink">
              Ink
            </button>
            <button type="button" className="btn btn-danger">
              Danger
            </button>
            <button type="button" className="btn btn-sm">
              Small
            </button>
          </div>
          <div className="card mt-3 inline-flex p-3">
            <button type="button" className="btn is-inset">
              Inset, on a card
            </button>
          </div>
        </section>

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Cards &amp; panels</h2>
          <p className="brand-text">
            The surfaces alternate: the page is warm, a card on it is white, anything recessed inside that card is
            warm again, and a control inside that is white once more.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="card p-5">
              <p className="text-sm text-muted">
                <code className="brand-code">.card</code> — resting, shadow-1.
              </p>
              <div className="card mt-3 p-3">
                <p className="text-sm text-muted">
                  <code className="brand-code">.card .card</code> — nested, drops to --bg.
                </p>
              </div>
            </div>
            <div className="card card-lead p-5">
              <p className="text-sm text-muted">
                <code className="brand-code">.card-lead</code> — shadow-2, leads somewhere.
              </p>
            </div>
          </div>
          <div className="panel mt-4 p-4">
            <p className="text-sm text-muted">
              <code className="brand-code">.panel</code> — recessed, page-colored, no shadow.
            </p>
          </div>
        </section>

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Notices</h2>
          <div className="card-stack mt-4 max-w-lg">
            <div className="notice">
              <IconInfo size={17} />
              <span>Default — a hairline edge and a resting shadow.</span>
            </div>
            <div className="notice notice-accent">
              <IconInfo size={17} />
              <span>Accent — a soft accent tint, no shadow.</span>
            </div>
            <div className="notice notice-error">
              <IconClose size={17} />
              <span>Error.</span>
            </div>
            <div className="notice notice-success">
              <IconCheck size={17} />
              <span>Success.</span>
            </div>
          </div>
        </section>

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Badges</h2>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="badge">12</span>
            <span className="count-badge">3</span>
          </div>
        </section>

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Fields</h2>
          <div className="mt-4 flex max-w-sm flex-col gap-4">
            <div>
              <label className="field-label" htmlFor="ds-email">
                Email
              </label>
              <input
                id="ds-email"
                className="form-field mt-1"
                type="email"
                placeholder="you@example.com"
                readOnly
              />
            </div>
            <div className="search-field">
              <IconSearch size={16} />
              <input className="form-field" placeholder="Search songs" readOnly />
            </div>
            <textarea className="form-field" rows={3} placeholder="Notes" readOnly />
          </div>
        </section>

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Chips</h2>
          <div className="chip-row mt-4">
            <span className="chip">Rock</span>
            <span className="chip is-on">Selected</span>
            <span className="chip is-empty">Empty</span>
          </div>
        </section>

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Segmented control</h2>
          <p className="brand-text">One recessed track holding related buttons; the active one gets a solid accent fill.</p>
          <div className="segment mt-4 inline-flex">
            <button type="button" className="segment-button is-on">
              A
            </button>
            <button type="button" className="segment-button">
              B
            </button>
            <button type="button" className="segment-button" disabled>
              C
            </button>
          </div>
        </section>

        {/* ---- Icons ---------------------------------------------------- */}

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Icons</h2>
          <p className="brand-text">
            Every icon this app draws, inline as JSX (<code className="brand-code">components/icons.tsx</code>) —
            never a file, so nothing here needs its own precache entry.
          </p>
          <div className="icon-grid">
            {ICON_NAMES.map((name) => {
              const IconComponent = Icons[name]
              return (
                <div key={name} className="icon-cell">
                  <Well tone="surface">
                    <IconComponent size={22} />
                  </Well>
                  <h3 className="icon-cell-name font-mono">{name}</h3>
                </div>
              )
            })}
          </div>
        </section>

        {/* ---- Guidelines ------------------------------------------------ */}

        <section className="mt-14 sm:mt-16">
          <h2 className="section-title">Guidelines</h2>

          <div className="card-stack mt-4 max-w-2xl">
            <div className="notice notice-accent">
              <IconInfo size={17} />
              <span>
                <strong>The Chord-First Rule.</strong> The accent&rsquo;s primary job is marking chords. Any other
                use of it — a badge, an active nav pill, a status dot — must read as visibly quieter than a chord
                on the sheet.
              </span>
            </div>
            <div className="notice">
              <IconInfo size={17} />
              <span>
                <strong>The Two Designed Themes Rule.</strong> Dark mode is not light mode, inverted. Every color
                pair in <code className="brand-code">globals.css</code>&rsquo;s two theme blocks was chosen
                independently for its own theme.
              </span>
            </div>
            <div className="notice">
              <IconInfo size={17} />
              <span>
                <strong>The Shadow-Or-Border Rule.</strong> A surface never gets both a shadow and a visible border
                for depth. Light separates by shadow with a transparent edge; dark separates by a hairline edge
                with no shadow — except the two surfaces that genuinely float over content.
              </span>
            </div>
            <div className="notice">
              <IconInfo size={17} />
              <span>
                <strong>The One Voice Rule.</strong> Outfit, in weight 400 or 500, for everything except
                tablature. No second display font, no bold above 600 outside chord names.
              </span>
            </div>
          </div>

          <h3 className="brand-subhead">Do</h3>
          <ul className="rule-list">
            {DO_RULES.map((rule) => (
              <li key={rule}>
                <strong>Do</strong> {rule}
              </li>
            ))}
          </ul>

          <h3 className="brand-subhead">Don&rsquo;t</h3>
          <ul className="rule-list">
            {DONT_RULES.map((rule) => (
              <li key={rule}>
                <strong>Don&rsquo;t</strong> {rule}
              </li>
            ))}
          </ul>
        </section>

        <Footer />
      </main>
    </PrefsProvider>
  )
}
