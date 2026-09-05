---
name: Strumfolio
description: A private, warm reading app for a musician's own lyrics and chords
colors:
  chord-terracotta: "#97490f"
  chord-terracotta-soft: "#f4e7d9"
  chord-amber: "#f0b268"
  chord-amber-soft: "#2a2118"
  paper-bg: "#f6f5f2"
  paper-surface: "#ffffff"
  paper-surface-raised: "#edebe5"
  paper-surface-nested: "#f1efe9"
  ink: "#16181d"
  ink-muted: "#5c626c"
  ink-faint: "#8d939c"
  paper-line: "#dcdad4"
  paper-line-soft: "#e6e3dc"
  night-bg: "#101216"
  night-surface: "#181b21"
  night-surface-raised: "#21252c"
  night-surface-nested: "#1d2027"
  night-ink: "#eceef1"
  night-ink-muted: "#99a0aa"
  night-ink-faint: "#5f666f"
  night-line: "#2b2f37"
  night-line-soft: "#262a32"
  danger: "#9d2820"
  danger-soft: "#fbe7e4"
  danger-night: "#ff9a90"
  danger-night-soft: "#2f1a18"
  success: "#1a7a42"
  success-soft: "#e1f3e6"
  success-night: "#6fd88f"
  success-night-soft: "#17281c"
  plan-standard: "#4a6b7c"
  plan-standard-soft: "#e8eef2"
  plan-standard-night: "#9fbccb"
  plan-standard-night-soft: "#1b262d"
  plan-plus: "#8a6a52"
  plan-plus-soft: "#f0e9e2"
  plan-plus-night: "#cdb096"
  plan-plus-night-soft: "#292019"
  plan-premium: "#97490f"
  plan-premium-soft: "#f4e7d9"
  plan-premium-night: "#f0b268"
  plan-premium-night-soft: "#2a2118"
  plan-lifetime: "#7a3f6b"
  plan-lifetime-soft: "#efe3ef"
  plan-lifetime-night: "#d1a3c4"
  plan-lifetime-night-soft: "#2a1f28"
typography:
  screen-title:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  section-title:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  hero-title:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 5vw, 3.875rem)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.04em"
  body:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    letterSpacing: "0.08em"
  chord:
    fontFamily: "Outfit, system-ui, sans-serif"
    fontSize: "0.7em"
    fontWeight: 500
    lineHeight: 1.4
  tab:
    fontFamily: "Geist Mono, monospace"
    fontSize: "0.8em"
    lineHeight: 1.5
rounded:
  xs: "0.6875rem"
  sm: "0.875rem"
  md: "1rem"
  lg: "1.125rem"
  panel: "1.25rem"
  xl: "1.375rem"
  2xl: "1.625rem"
  pill: "999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.375rem"
  xl: "1.75rem"
components:
  button-primary:
    backgroundColor: "{colors.chord-terracotta}"
    textColor: "#fffaf4"
    rounded: "{rounded.pill}"
    padding: "0.5rem 1.125rem"
  button-primary-hover:
    backgroundColor: "{colors.chord-terracotta}"
  button-secondary:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0.5rem 1.125rem"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
  card:
    backgroundColor: "{colors.paper-surface}"
    rounded: "{rounded.xl}"
    padding: "1.375rem"
  card-nested:
    backgroundColor: "{colors.paper-bg}"
    rounded: "{rounded.xl}"
  field:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0.875rem 1rem"
  badge:
    backgroundColor: "{colors.chord-terracotta-soft}"
    textColor: "{colors.chord-terracotta}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.625rem"
  toggle-track-off:
    backgroundColor: "{colors.paper-surface-raised}"
    rounded: "{rounded.pill}"
  toggle-track-on:
    backgroundColor: "{colors.chord-terracotta}"
    rounded: "{rounded.pill}"
  toggle-thumb:
    backgroundColor: "{colors.paper-surface}"
    rounded: "{rounded.pill}"
---

# Design System: Strumfolio

## 1. Overview

**Creative North Star: "The Warm Stage Sheet"**

Strumfolio reads like a sheet of paper laid on top of an app: warm, matte, unhurried,
inset from the edges of the screen so the song itself — not the chrome around it — is
the thing the eye lands on. Nothing here is decorative by default; every token exists
because a specific reading condition demanded it. Light and dark are each their own
considered surface, hand-tuned rather than one inverted from the other, because a
tablet propped on an amp in a dark room and the same tablet at a kitchen table in
daylight are both real, both designed for on purpose. The one color that is allowed to
be loud — the chord accent, terracotta in light and amber in dark — is loud for exactly
one reason: it marks the thing a player's eye must never mistake for a lyric. Everything
else that borrows it (a badge, an active control) stays visibly quieter than the chords
themselves, on purpose.

(See PRODUCT.md's Anti-references for what this system is built against; the design
consequence is that depth here comes from a warm neutral palette and a considered surface
ladder, not from gradients, glow, or noise — see the Don'ts below for the specifics.)

**Key Characteristics:**
- Warm off-white paper in light, near-black (not pure black) in dark — never a cold or clinical neutral.
- One accent color, reserved first for chords; everything else that uses it is deliberately quieter.
- A corner-radius scale keyed to each shape's job, not its size — nested shapes are always rounder than their container.
- Elevation is a shadow in light, a border in dark — the mechanism changes per theme, the meaning (this is raised off the page) doesn't.
- Pills are the one shape reserved for actions (buttons); nothing else in the app is pill-shaped.

## 2. Colors

A warm, restrained palette: one reserved accent, everything else a step on a paper-to-ink neutral ramp that inverts (not flips) between light and dark.

### Primary
- **Chord Terracotta** (`#97490f`, light theme): the chord color, first and only. Marks every chord name and shape on the sheet; a diluted 35% mix marks the chorus rule; a soft 10%-strength tint (`#f4e7d9`) backs badges, active nav states, and capo notices. Also the brand mark's tile color (Brown, in the logo asset drop's own naming) — the app's accent and Strumfolio's logo are one and the same color, not a coincidence to reconcile.
- **Chord Amber** (`#f0b268`, dark theme): the same job in the dark palette — warmer and lighter than the light theme's terracotta so it still reads against near-black, with its own soft tint (`#2a2118`). Same note as above: the logo's dark-background tile (Orange, `#f1b369`) is a hair off this value, close enough that the brand mark (`IconNote`) inherits `--accent` directly rather than carrying its own fixed color.

### Neutral
- **Paper** (`#f6f5f2` bg / `#ffffff` surface / `#edebe5` raised / `#f1efe9` nested, light): the four-step surface ladder — page, card, recessed control, and nested-card-on-white — that everything else in the app sits on.
- **Night** (`#101216` bg / `#181b21` surface / `#21252c` raised / `#1d2027` nested, dark): the same ladder, independently tuned rather than a formulaic inversion of Paper.
- **Ink** (`#16181d` light / `#eceef1` dark): primary text. **Muted** (`#5c626c` / `#99a0aa`): secondary text, captions. **Faint** (`#8d939c` / `#5f666f`): labels, placeholders, disabled state.
- **Line** (`#dcdad4` light / `#2b2f37` dark): hairline dividers. Doubles as `--edge`, the border color that exists only in dark mode (transparent in light, where elevation is a shadow instead).

### Named Rules
**The Chord-First Rule.** The accent color's primary job is marking chords. Any other use of it — a badge, an active nav pill, a status dot — must read as visibly quieter than a chord on the sheet. If a new UI element competes with the sheet's own chords for attention, it is using the accent wrong.

**The Two Designed Themes Rule.** Dark mode is not `light mode, inverted`. Every color pair in the frontmatter was chosen independently for its own theme; changing one value in light does not imply a formulaic change in dark.

### The Favorite Star — a declared exception to the Chord-First Rule

The star that marks a song as a favorite (`PLAN-favorites.md`) is drawn in the accent:
filled and `--accent` beside the title of a song that is one, filled and `--accent` on that
song's row in every list, and `--accent` on `--accent-soft` on the pill that filters the
lists down to them. Everywhere else it is a `--muted` outline, or nothing at all.

Declared rather than drifted, on three terms that keep the substance of the rule intact.
It is **a single glyph and never an area** — 14px in a row, 19px beside a title — so it
cannot mass into something a reader's eye lands on before the sheet. It is lit **only when
the value is not the default**, which is the same licence the key and capo badges in
`SongControls` already take on this very screen: an unstarred song's star is `--muted` and
competes with nothing. And **the fill, not the colour, is what carries the meaning** —
outline against solid — so the control still reads correctly with the hue removed. The one
screen where the rule's substance is really at stake is the song sheet, and there exactly
one star exists, in the header row above the words, beside two controls already there.

Unlike the plan badges below, this introduces **no second colour family**: it is the app's
own accent, used on one more kind of thing.

### Plan Badges — a declared exception to the Chord-First Rule

`/accounts` (the operator screen, `PLAN.md` v3.7, redrawn after `Accounts.dc.html` in v4.4)
is the one place in the app with a second color family: a warm ramp, one color per paid
plan, cool to warm in the order the plans are sold — a grey-blue `plan-standard`, a brown
`plan-plus`, `plan-premium` on the brand terracotta itself (the accent's own two values, kept
as a separate token because "the app's color" and "one plan's name" must be able to move
apart), a plum `plan-lifetime` — each with its own `-soft`/`-night`/`-night-soft` pair. Free
and "No plan" both stay on the neutral ink ramp (`surface-raised` and `surface-nested`
respectively) since there is nothing bought to name; the row's Status column, not a color,
tells them apart. `danger`/`danger-soft` is reused only for "Awaiting choice", the residual
row that shows a paid badge while its owner has not passed the plan gate. The same ramp
colors the row's monogram avatar, so the two marks on a row tell one story. This is a **declared**
exception to the Chord-First Rule above, not a drift from it: the rule exists to stop a UI
element from competing with the chords on the song sheet for a reader's attention, and an
operator's account list has no sheet and no chords on it to compete with — the letter of "one
accent color" bends here, the substance it protects does not. Nowhere else in the app gains a
second color family from this; a plan name shown anywhere a reader (rather than an operator)
looks — the account menu's own badge, `/pricing`, `/billing` — stays on the single existing
accent, exactly as before.

## 3. Typography

**Display / Body Font:** Outfit (with `system-ui, sans-serif` fallback)
**Label/Mono Font:** Geist Mono (chords' tab blocks and monospaced values only)

**Character:** A single geometric sans carries every weight of voice in the app, from a hero headline to a field label — restrained rather than a display/body pairing, so nothing in the interface competes for attention with the song itself. Geist Mono appears only where alignment is literal (tablature), never as a stylistic accent.

### Hierarchy
- **Hero** (500, `clamp(2.5rem, 5vw, 3.875rem)`, line-height 1, letter-spacing -0.04em): the one headline on the public page — the payoff, not the app name.
- **Screen title** (500, 1.875rem, line-height 1.1, letter-spacing -0.03em): the name of the current screen. Lighter weight than a bold heading would be, so it sits next to a song's own words rather than shouting over them.
- **Section title** (500, 1.1875rem, line-height 1.2, letter-spacing -0.02em): one step down from screen title, for a section inside a screen.
- **Body** (400, 1rem, line-height 1.5): default reading text, capped implicitly by each container's own max-width (the sheet caps at 48rem).
- **Label** (500, 0.6875rem, letter-spacing 0.08em, uppercase, faint color): group labels over control clusters and form fields — the only uppercase, tracked text in the system, and it never appears anywhere else.
- **Chord** (500, 0.7em relative to its lyric line, letter-spacing 0): deliberately smaller and lighter than the lyric underneath it — a chord you read instead of sing is a chord sized wrong.

### Named Rules
**The One Voice Rule.** Outfit, in weight 400 or 500, for everything except tablature. No second display font, no bold (600+) outside chord names and a handful of emphatic labels.

**The one place this rule does not reach: the printed booklet.** `lib/booklet/document.tsx` sets
its PDF in Standard-14 **Helvetica** and **Courier**, not Outfit and Geist Mono — a standing,
accepted divergence rather than an oversight, and the only artifact the app ships that is not in
its own typeface. Two reasons, both about PDFs rather than about design: `react-pdf`'s
`Font.register` cannot read the woff2 that `next/font` self-hosts, so using Outfit means
committing a separate `.ttf` and keeping it in step with the screen font; and every size in that
file is tuned to Helvetica's advance widths, which the booklet's pagination *measures against*
(`paginateSong` finds page breaks by rendering real PDFs and counting pages), so a font swap
moves where pages break rather than only how they read. The visible cost, worth knowing before
anybody compares a print-out with a screen: Standard-14 has only normal and bold, no 500, so a
booklet's headings are heavier than the same headings here. The file's own header carries the
full argument.

## 4. Elevation

A hybrid system, deliberately not carried over between themes by formula. In light mode, elevation is a shadow: `--shadow-1` separates a resting card from the warm page behind it, `--shadow-2` lifts a card that leads somewhere, `--shadow-float` lifts the floating control bar over the song, and `--shadow-panel` lifts a popover above everything else. In dark mode, all four of those collapse to `none` except the two that float — a shadow is invisible against a near-black page, so separation there comes from `--edge`, a hairline border that exists only in dark. The two floating shadows (bar, panel) keep a real shadow in both themes, darkened for dark mode, because something genuinely lifted over the song has to read as lifted regardless of theme.

### Shadow Vocabulary
- **Resting card** (`--shadow-1`: `0 1px 2px rgb(22 24 29 / 5%)`; `none` in dark): a card at rest against the page.
- **Leading card** (`--shadow-2`: adds `0 10px 24px -18px rgb(22 24 29 / 40%)`; `none` in dark): a card that leads somewhere, lifted further.
- **Floating bar** (`--shadow-float`: `0 8px 30px -8px rgb(22 24 29 / 25%)` light, `0 10px 34px -10px rgb(0 0 0 / 70%)` dark): the reading control bar, which floats over the song in both themes.
- **Panel** (`--shadow-panel`: `0 12px 34px -10px rgb(22 24 29 / 28%)` light, `0 14px 40px -12px rgb(0 0 0 / 75%)` dark): any popover — menu, reading panel, chord shape.

### Veil Vocabulary
What goes over the page while something is open on top of it. Two weights of one idea, and the idea is *muting* rather than darkening: a veil takes contrast away from what is behind it so the thing in front reads first.

- **Panel veil** (`--veil`: `rgb(22 24 29 / 22%)` light, `rgb(255 255 255 / 16%)` dark): behind anything that hangs off a control — the hamburger, the account menu, the reading panel, the speed popover.
- **Dialog dim** (`--dim`: `rgb(10 11 14 / 45%)` light, `rgb(255 255 255 / 34%)` dark): behind anything that interrupts rather than hangs — the upgrade modal, the sample-songbook modal, a chord shape.

### Named Rules
**The Shadow-Or-Border Rule.** A surface is never given both a shadow and a visible border for depth. Light separates by shadow with a transparent edge; dark separates by a hairline edge with no shadow, except the two surfaces that genuinely float over content, which keep a (darkened) shadow in both themes.

**The Veil-Inversion Rule.** A veil darkens in light and *lightens* in dark. Muting means moving the ground towards the text, and the text is dark on light and light on dark — so the same veil cannot be the same colour in both themes. It is also the only direction that does anything: dark's page is `#101216`, and the 22% black that mutes a light page is invisible over it. The dark percentages are not the light ones scaled; each pair is picked so the contrast between the page and its own text falls by the same amount in both themes — roughly 16:1 down to 10:1 for a panel, and to 5.5:1 for a dialog. Same shape as the Shadow-Or-Border Rule: one meaning, two mechanisms, neither derived from the other by formula.

## 5. Components

### Buttons
- **Shape:** full pill (`border-radius: 999px`) — the one shape in the app reserved exclusively for actions; nothing else is pill-shaped.
- **Primary:** solid Chord Terracotta/Amber fill, `on-accent` text, no border, `0.5rem 1.125rem` padding, 2.75rem minimum height. Disabled state drops the fill entirely (to a flat recessed gray) rather than fading it — a disabled primary should read as "not ready," not "nearly ready."
- **Secondary (default `.btn`):** white/surface fill with a hairline edge and a resting shadow.
- **Quiet / Ghost:** transparent fill, muted text, no border, no shadow.
- **Ink (destructive-confirm):** solid near-black fill — the one dark solid control in the app, reserved for the confirmed step of a delete.
- **Hover/Focus:** background shifts toward `surface-2` (secondary) or a darker accent mix (primary); focus-visible gets a 2px accent-colored outline with 2px offset, everywhere in the app.

### Cards / Containers
- **Corner Style:** `1.375rem` (xl) for a standalone card; `1rem` (md) for a row inside one; `1.625rem` (2xl) reserved for the single largest surface, the control dock.
- **Background:** white/surface at the first level; drops back to the page color (`bg`) the moment a card is nested inside another card or the song sheet, so two white surfaces never touch and read as one.
- **Shadow Strategy:** see Elevation — `--shadow-1` at rest, `--shadow-2` for a card that leads somewhere.
- **Border:** `--edge` (transparent in light, hairline in dark) on every card, control-bar, and panel.
- **Page width — two measures, and a third only for prose:** `70rem` for the wide public pages (`/login` via `.landing-width`, `/pricing`, and the blog/tools shell via `--site-width`), `48rem` (`max-w-3xl`) for every screen inside the app and for the legal pages. The third measure is `45rem`, the blog's reading column, and it is the one width answering to the line length of a thousand words instead of to the page — a new page width, on the other hand, has to earn itself, because one that misses an existing width by a few pixels reads as a misalignment and not as a decision.
- **Every bar is the same box:** a 1rem gutter, 0.75rem above and below, the mark 1.375rem tall at the left. Only the cap changes from page to page (`--top-bar-width` on `TopBar`/`PublicHeader`, `--site-width` on the blog's `SiteHeader`), so two pages of the same width put the mark on the same pixel and a visitor crossing between them sees the bar stand still. **A bar answers to the bar on the page it links to, not to the column underneath itself** — it is the one part of a page ever seen in motion. Where a page's content gutter is wider than 1rem (the blog's 2.5rem, `/pricing`'s 2rem), the bar's contents sit slightly outside the column, which is the price of the rule and cheaper than the jump. The one width where the rule bends is a phone under 40rem on the blog's bar, which carries five things rather than three and drops its mark to 1.125rem to keep both of its doors.

### Inputs / Fields
- **Style:** white/surface fill (or page-colored when nested inside a card, matching the card ladder), hairline `--edge` border, `1.125rem` (lg) radius, resting shadow. 16px minimum font size, specifically to stop iOS auto-zooming a field on focus.
- **Focus:** border-color transition only (150ms ease) — no glow, no layout shift.
- **Placeholder:** faint-colored, never lighter than the app's own contrast floor.

### Toggle
- **Shape:** a pill-shaped track (`rounded.pill`, `2.75rem × 1.5rem`) with a circular thumb that slides — the one control in the app that reads on/off as motion rather than a checkmark.
- **Off:** track fills `paper-surface-raised` (the same recessed tone a segmented control's track uses), thumb white/surface with a resting shadow, sitting at the track's near edge.
- **On:** track fills solid Chord Terracotta/Amber, thumb slides to the far edge — same fill as a primary button, so "on" reads with the app's one accent color rather than a second one invented for switches.
- **Built on a real `<input type="checkbox" role="switch">`**, styled rather than replaced with a custom button — focus-visible, labelling and keyboard toggling stay the browser's, not reinvented; `role="switch"` only changes what a screen reader calls it.
- **When to reach for it instead of a bare checkbox:** a choice whose consequence reaches past the screen it's on — what ends up saved, shown to somebody else, or printed (the notification switches in `AppSettingsForm`; `/booklet`'s own-key-and-capo option). A page-local filter with nothing to persist, like the ones on `/accounts`, stays a plain unstyled checkbox on purpose; giving every checkbox this weight would flatten the distinction rather than sharpen it.

### Navigation
- **Top bar:** solid page-colored background (not translucent — the sheet beneath it is a white card, and a blur would show lyrics through the header). Sticky, `z-index: 40`.
- **Icon buttons:** 2.5rem square, `sm` radius, raised (white fill + hairline edge) in the header, recessed (page-colored fill) on a card — a control never gets the same treatment as the surface it sits on.
- **Segmented control:** grouped buttons in one recessed track (`surface-2` background); the active segment gets a solid accent fill, everything else stays flat.

### Song chips
A wrapping row of small recessed pills under the song title, one per thing this reading of this song is set to: key (a stepper whose badge is also the way back to the written key), capo, sharps-or-flats, and how much of a chord the sheet draws. 2.25rem tall, `sm` radius, `surface-3` fill, muted label plus a badge or a word for the value — **accent-soft for a value that is a distance from home, solid accent for one that is a thing clamped to the neck**, and never a second hue: the accent belongs to the chords (see Do's and Don'ts). The two that open a menu carry a chevron and hang their panel off the *row*, full-width and capped, never off the chip itself.

They exist because a control whose value is worth reading cannot live behind a button. Before this row the app had a separate line under the title whose only job was to say in words what a shut panel was hiding.

### The Reading Control Bar (signature component)
A floating pill-shaped dock (`--r-2xl`, `--shadow-float`) pinned above the safe-area inset, holding only what's touched mid-song (play/pause, speed, the Strum Together toggle) with the two genuinely set-and-forgotten choices (instrument, text size) tucked behind one button that opens a panel above the dock. Key, capo, accidentals and chord display used to be in that panel and are now the chips above.

**One row from `sm` up, two below it** — and the two-row version is not the old one coming back. What was replaced was two rows of small controls stacked at every width, which split awkwardly on a 390px phone; what a phone has now is one panel of two rows sized *up* rather than down: Previous and Next above, the mid-song controls below, nothing under 48px, the ones a hand reaches for at 58px, and a 78px play circle straddling the seam between the rows, cut out of both by a ring in the bar's own colour. Play is the largest thing in the app on purpose — it is the one control that is a destination rather than a nudge. Above `sm` all of it collapses back to the single row, with the two capsules (dock, prev/next) the wider screen has room for.

### The Visual Editor (signature component)

Chords are edited exactly where they are read: a hidden copy of the line's words, in the
same font, carries zero-width anchors between the letters, and each chord chip hangs from
its anchor — the browser does the measuring, so a chip never drifts, in either theme, at
any width. Chip type is the reader's own (500 weight) — one voice, both sides of the same
sheet. **The ghost must never be widened to make room for a chip**: two that would collide
lift into a second lane with a hairline leader back to their letter, never by pushing the
words apart.

A tap snaps a new chord to the nearest syllable, not the raw letter under the finger — a
hand's precision, not a stylus's; dragging a chip moves it letter by letter for the rare
correction that needs it. Naming a chord opens a bar *under* the line rather than a popover
*over* it, since the line's own horizontal scroll clips vertically on purpose — every
control on that bar sits at the same 44px floor as the reading control bar.

### The blog (`/blog`)

Drawn from the `Blog.dc.html` handoff and the one surface in Strumfolio that is a **page**
rather than a screen: the shell's own 70rem for the index and its hero band, 720px for the
words. The mock draws that band at 1100px on a 1280px canvas and it ships at 70rem instead —
the width `/login` and `/pricing` already had, since twenty pixels of difference between two
pages one bar links together reads as a misalignment rather than as a choice. It
keeps `SiteHeader` (mark, a «Blog» capsule, Pricing, a Sign in capsule) rather than
`PublicHeader` — same bar box as everywhere else, different contents — a visitor arriving from a search is deciding neither between reading and
paying, so the bar names the section and offers both doors instead of spending its one CTA
on a single one. Its foot is the same shared `Footer` every internal page prints (© year,
version, commit hash, then Privacy/Terms/Cookies/Content copyright/Changelog/Blog/Tools),
not a lighter one of its own — `SiteHeader` and `Footer` are both `messo a comune`, shared
with `/tools`, and `PublicHeader` stays reserved for the pages built to sell (`/login`,
`/pricing`).

The index divides into three shapes that only appear once they can be filled: one wide
featured card, a row of three, then a compact «Earlier» list. Each article carries exactly one
**category** — small caps in the accent, a capsule on the featured card and plain type
everywhere else.

**Article prose.** 17px on a 1.72 line height, in `--blog-prose`, an ink some twenty levels
softer than the app's own: this is the one place somebody reads for several minutes rather
than glancing between phrases. The opening paragraph is set at 19px in full ink. Spacing is
always a *top* margin, so two blocks never sum their margins. Headings are 25px and 19px at
500 — the app's restrained weight. Two elements are the blog's alone: the two-row chord
table (what the room hears above what the hand holds, the played row in the accent) and the
single pulled-out line on a warm tint behind an accent rule.

The closing panel, `PromoPanel`, used to be a third and no longer is — it replaced the old
dark-band CTA and is shared with `/tools` now, so it belongs to no single surface. Its
theming isn't near-black in both themes either: `--promo-bg` is a warm cream tint on the
same paper family in light, close enough to the page to read as a step away rather than a
different material, and drops to a genuine near-black only in dark, where a shadow-only step
would disappear against a page that's already near-black.

A chord written in an article is the accent on `accent-soft`, in mono, and is the one element
on a blog page marked `translate="no"`: the article itself is deliberately translatable — the
blog exists to be found by musicians who may not read English easily — and an `A` rewritten as
`La` mid-sentence is the one thing that must not follow. Chord names are spelled the way the
app spells them (`F#m`, `Bb`), not with typographic ♯ and ♭: an article teaching somebody what
their own sheet says has to print what the sheet actually prints.

The mock is drawn in light only. The dark theme is written by hand against the night tokens,
because both themes here are designed rather than inverted.

## 6. Do's and Don'ts

### Do:
- **Do** reserve the accent (Chord Terracotta / Chord Amber) for chords first; anything else using it must read quieter than a chord on the sheet.
- **Do** design light and dark as two independent, hand-tuned surfaces — never assume a dark value by formula from its light counterpart.
- **Do** use a shadow for elevation in light and a border (`--edge`) in dark; never both on the same surface.
- **Do** size every corner radius by the shape's job (how nested it is), not by the shape's absolute size.
- **Do** keep the pill shape exclusive to actionable buttons — a card, a field, a badge, none of those are pills.
- **Do** provide a `prefers-reduced-motion: reduce` alternative for every animation (the rolling hero counters already do this). Note what that setting actually does here: `globals.css` ends with a blanket `animation-duration: 0.01ms !important` over every element, so under it an animation does not play slowly — it does not play at all.
- **Do** hit a 2.75rem (44px) minimum control size anywhere a control is tapped repeatedly mid-performance (control bar, segmented buttons).

### Don't:
- **Don't** build anything resembling the ad-heavy, cluttered chord/tab site aesthetic (Ultimate Guitar and similar) — no ad slots, no popups, no competing calls to action around the reading surface.
- **Don't** default to a generic flat-dark developer-tool look (near-black surface, single neon accent) — Strumfolio's dark theme is warm and hand-tuned, not a formulaic inversion.
- **Don't** use a side-stripe (`border-left`/`border-right` > 1px) as a decorative colored accent — the sheet's own chorus/bridge indent is the one place this app uses one that way, a diluted accent tint rather than a flat color bar. The editor's focused-line marker (`.editor-line.is-focused`) is a second, narrower exception: a functional focus indicator, not a decoration, earning the same pass a browser's own focus ring would. The blog's pulled quote (`.blog-quote`, a solid 3px accent rule on `--blog-quote-bg`) is a third: it marks the one line an article is remembered by, the same job the sheet's own indent does for a chorus.
- **Don't** give a disabled primary button a faded/opacity treatment — drop the fill to the flat disabled state instead.
- **Don't** let an `animation … forwards` decide whether something is *visible*. Because of the blanket rule above, under «reduce motion» the animation collapses to nothing and `forwards` pins the element at its **last** frame — so anything whose keyframes end at `opacity: 0` is never seen at all by that reader, on a setting that is common on a phone. The favourite star's confirmation was written this way first and caught in review before it shipped: the element is now opaque at rest, an animation only brings it *in*, and going away is a class the component adds. Motion is what reduces; the message does not.
- **Don't** let a translucent or blurred surface sit over the song sheet — the top bar tried this and it let lyrics show through; use a solid page-colored background instead.
- **Don't** introduce a second display font or a bold weight above 600 outside chord names — Outfit at 400/500 carries the whole system.
