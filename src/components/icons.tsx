/**
 * The icon set, inline.
 *
 * Written as JSX rather than files in `public/`: anything added there has to be
 * picked up by the hand-rolled public scan in next.config.ts to survive offline,
 * and an icon that silently stops being precached is worse than no icon.
 */

interface IconProps {
  size?: number
  className?: string
}

function Icon({
  size = 18,
  className,
  /* Lighter than the default only for the two animals, which are drawings. */
  strokeWidth = 1.75,
  children,
}: IconProps & { strokeWidth?: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function IconSearch(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  )
}

export function IconChevronLeft(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m14 6-6 6 6 6" />
    </Icon>
  )
}

export function IconChevronRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m10 6 6 6-6 6" />
    </Icon>
  )
}

export function IconChevronDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 10 6 6 6-6" />
    </Icon>
  )
}

export function IconChevronUp(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 14 6-6 6 6" />
    </Icon>
  )
}

/** Back to where it started: a counterclockwise arrow. */
export function IconUndo(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12a8 8 0 1 0 2.5-5.8" />
      <path d="M4 4v3.5h3.5" />
    </Icon>
  )
}

/** Rebuild: a circling arrow. */
export function IconRebuild(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 12a8 8 0 1 1-2.5-5.8" />
      <path d="M20 4v3.5h-3.5" />
    </Icon>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

/** Import: a page with an arrow coming into it. */
export function IconImport(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v11" />
      <path d="m8 10 4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Icon>
  )
}

/** Paste: a clipboard, for text arriving from elsewhere rather than typed here. */
export function IconClipboard(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="7" y="4" width="11" height="16" rx="2" />
      <path d="M11 4V3h3v1" />
      <path d="M10.5 10h4M10.5 14h4" />
    </Icon>
  )
}

export function IconDownload(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v11" />
      <path d="m8 10 4 4 4-4" />
      <path d="M4 20h16" />
    </Icon>
  )
}

/** A printed booklet: paper feeding into the printer, and the page it prints. */
export function IconPrint(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 8V4h10v4" />
      <rect x="4" y="8" width="16" height="8" rx="1.5" />
      <path d="M7 13h10v7H7z" />
    </Icon>
  )
}

/** Songbooks: stacked books. */
export function IconBooks(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v14H5.5A1.5 1.5 0 0 0 4 19.5z" />
      <path d="M10 4h4.5A1.5 1.5 0 0 1 16 5.5v14H10z" />
      <path d="M18 6.5 20 7v12.5" />
    </Icon>
  )
}

/*
 * The editor's six, drawn for the redesign of that screen: the three ways of looking
 * at a song, and the commands that had to give up their words to fit one row.
 *
 * A label survives for each of them in `title` and `aria-label` — an icon alone is a
 * guess, and this app has already learnt that lesson twice.
 */

/** Source: the ChordPro underneath, in angle brackets. */
export function IconCode(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m8 8-4 4 4 4" />
      <path d="m16 8 4 4-4 4" />
      <path d="m13.5 6-3 12" />
    </Icon>
  )
}

/** Preview: the song as it will be read. */
export function IconEye(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.75" />
    </Icon>
  )
}

/** Chorus: repeat barlines, the way a score marks one. */
export function IconChorus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 4v16" />
      <path d="M8.5 4v16" />
      <circle cx="13" cy="9.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="13" cy="14.5" r="1" fill="currentColor" stroke="none" />
      <path d="M17 6.5v11" />
      <path d="M20 6.5v11" />
    </Icon>
  )
}

/** Bridge: an arch with its piers. */
export function IconBridge(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 15a9 9 0 0 1 18 0" />
      <path d="M3 15h18" />
      <path d="M8 15v4M16 15v4" />
    </Icon>
  )
}

/** Comment: something said beside the song rather than in it. */
export function IconComment(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-6.2A7 7 0 0 1 11 5h2a7 7 0 0 1 7 7z" />
    </Icon>
  )
}

/** Comment struck through: the notes are off the page entirely. */
export function IconCommentOff(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 3.5 20.5 20.5" />
      <path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-6.2A7 7 0 0 1 7.5 5.6" />
      <path d="M10.5 5h2.5a7 7 0 0 1 6.8 5.3" />
    </Icon>
  )
}

/** Comment with a plus: tapping a word or a chord will write one. */
export function IconCommentAdd(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 12.5V12a7 7 0 0 0-7-7h-2a7 7 0 0 0-7 7v3.8L8 19h5" />
      <path d="M18 15.5v6M15 18.5h6" />
    </Icon>
  )
}

/** Tab: strings, and a fret marked on two of them. */
export function IconTab(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      <path d="M9 4v4M15 8v4" />
    </Icon>
  )
}

/** Remove line: two lines closing over the gap where one was. */
export function IconRemoveLine(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 17h16" />
      <path d="M9 12h6" />
    </Icon>
  )
}

/** Two bars: what a finger takes hold of to move a row. */
export function IconGrip(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 9h14M5 15h14" />
    </Icon>
  )
}

/** A password: a key. */
export function IconKey(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2 20 3" />
      <path d="M16.5 6.5 19 9" />
    </Icon>
  )
}

/** A single reader: head and shoulders — `/profile`, never the plural `IconUsers`. */
export function IconUser(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" />
    </Icon>
  )
}

/** Settings: a gear, short teeth around a hub. */
export function IconSettings(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={2.25}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 8V6M12 16v2M8 12H6M16 12h2M14.83 9.17 16.24 7.76M14.83 14.83 16.24 16.24M9.17 14.83 7.76 16.24M9.17 9.17 7.76 7.76" />
    </Icon>
  )
}

/** Who may enter: two people, the second half-behind the first. */
export function IconUsers(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20v-1.2a4.2 4.2 0 0 1 4.2-4.2h3.6a4.2 4.2 0 0 1 4.2 4.2V20" />
      <path d="M16.4 5.4a3.2 3.2 0 0 1 0 5.2" />
      <path d="M17.6 14.8a4.2 4.2 0 0 1 3.4 4.1V20" />
    </Icon>
  )
}

/** The tuner: a tuning fork. */
export function IconTuningFork(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 3v7a3 3 0 0 0 6 0V3" />
      <path d="M12 13v8" />
    </Icon>
  )
}

/** Leaves the app: an arrow out of a box. */
export function IconExternal(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 4h6v6" />
      <path d="M20 4l-8 8" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </Icon>
  )
}

export function IconMenu(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  )
}

export function IconExit(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 8l-4 4 4 4" />
      <path d="M6 12h9" />
    </Icon>
  )
}

export function IconPlay({ size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path d="M8 5.5a1 1 0 0 1 1.52-.85l9 6.5a1 1 0 0 1 0 1.7l-9 6.5A1 1 0 0 1 8 18.5z" />
    </svg>
  )
}

export function IconPause({ size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect x="7" y="5" width="3.5" height="14" rx="1.25" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1.25" />
    </svg>
  )
}

/*
 * The two ends of the speed slider.
 *
 * A turtle and a hare rather than a minus and a plus, because the slider has no
 * unit to put on it: "20 pixels per second" means nothing to someone holding a
 * guitar, and slower-than-this and faster-than-that is the whole of what the
 * control does.
 */
export function IconTurtle(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.5}>
      <path d="M3.5 14.5a7 5.5 0 0 1 14 0" />
      <path d="M3.5 14.5h14" />
      <path d="M6 14.5v3M15 14.5v3" />
      <path d="M17.5 13.6c1.7 0 2.9-1 2.9-2.3" />
      <path d="M10.5 9.2v5.3M7 11.4l1.2 3.1M14 11.4l-1.2 3.1" />
    </Icon>
  )
}

export function IconHare(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.5}>
      <ellipse cx="9.6" cy="6.6" rx="1.4" ry="3.8" transform="rotate(-14 9.6 6.6)" />
      <ellipse cx="13.4" cy="6.6" rx="1.4" ry="3.8" transform="rotate(14 13.4 6.6)" />
      <path d="M8.2 13.2a3.6 3.6 0 0 1 6.6 1.6c1.4.6 2.4 1.9 2.4 3.4H6.6c-1 0-1.8-.8-1.8-1.8 0-1.6 1.4-2.9 3.4-3.2z" />
      <path d="M13.2 12.4h.01" />
    </Icon>
  )
}

/** The reading panel: two faders, as on a mixing desk. */
export function IconSliders(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
      <circle cx="16" cy="8" r="2.25" />
      <circle cx="10" cy="16" r="2.25" />
    </Icon>
  )
}

export function IconPencil(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5z" />
      <path d="m13.5 7 3.5 3.5" />
    </Icon>
  )
}

export function IconTrash(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
    </Icon>
  )
}

/** Billing: a receipt, its bottom edge torn, two lines of print. */
export function IconReceipt(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3h12v17l-2-1.3L14 20l-2-1.3L10 20l-2-1.3L6 20z" />
      <path d="M9 8h6M9 12h6" />
    </Icon>
  )
}

/** Light: a sun, circle and rays. */
export function IconSun(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M4 12H1.5M22.5 12H20M5.6 5.6 3.9 3.9M20.1 20.1l-1.7-1.7M18.4 5.6l1.7-1.7M3.9 20.1l1.7-1.7" />
    </Icon>
  )
}

/** Dark: a crescent moon. */
export function IconMoon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </Icon>
  )
}

/** Auto: a circle half-filled, following the system rather than choosing for it. */
export function IconThemeAuto(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function IconCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 13 4.5 4.5L19 7" />
    </Icon>
  )
}

export function IconClose(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  )
}

/** A wrapped box with its bow: a plan somebody was given, on the `/accounts` list. */
export function IconGift(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10.5v8a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-8" />
      <rect x="2.5" y="7" width="19" height="3.5" rx="1.5" />
      <path d="M12 7v13" />
      <path d="M12 7H9a2 2 0 1 1 0-4c2 0 3 4 3 4z" />
      <path d="M12 7h3a2 2 0 1 0 0-4c-2 0-3 4-3 4z" />
    </Icon>
  )
}

export function IconInfo(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.75h.01" />
    </Icon>
  )
}

export function IconOffline(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 3l18 18" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M5 13a9 9 0 0 1 3.5-2.2" />
      <path d="M15.5 10.8A9 9 0 0 1 19 13" />
      <path d="M2 9.5A13 13 0 0 1 7 6.4" />
      <path d="M17 6.4a13 13 0 0 1 5 3.1" />
      <path d="M12 20h.01" />
    </Icon>
  )
}

/**
 * Installable, and readable without a network: a phone with the repertoire already on it.
 *
 * Not `IconOffline` — that one is drawn as a warning, a crossed signal, and every one
 * of its uses in the app is inside a notice saying something is disabled. This is the
 * opposite claim, so it needed a glyph of its own: a device with a check, nothing
 * crossed out.
 */
export function IconOnStage(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 19h3" />
      <path d="m9 11 2.3 2.3L15 9" />
    </Icon>
  )
}

/**
 * Strum together: a signal going out both ways from one centre, so every device can
 * follow the same one.
 *
 * Redrawn from an earlier mark that radiated upward from a dot at the foot of
 * the glyph — this one is symmetric left and right instead, matching the redesigned
 * reading bar and header pill it now sits in alongside the menu entry it already had.
 * One glyph, one meaning, in both places.
 */
export function IconBroadcast(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <path d="M8.4 8.9a4.6 4.6 0 0 0 0 6.2" />
      <path d="M15.6 8.9a4.6 4.6 0 0 1 0 6.2" />
      <path d="M5.4 5.6a9.2 9.2 0 0 0 0 12.8" />
      <path d="M18.6 5.6a9.2 9.2 0 0 1 0 12.8" />
    </Icon>
  )
}

/** Whoever presses play leads: the same mark as the control itself, ringed like a badge. */
export function IconLeads(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 8.8a1 1 0 0 1 1.5-.87l3.8 2.2a1 1 0 0 1 0 1.74l-3.8 2.2a1 1 0 0 1-1.5-.87z" fill="currentColor" stroke="none" />
    </Icon>
  )
}

/** Every screen, in sync: two devices held the same way. */
export function IconDevices(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="7" width="9" height="14" rx="2" />
      <rect x="11" y="3" width="9" height="14" rx="2" />
    </Icon>
  )
}

/** Just a link away: two linked loops. */
export function IconLink(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.5 14.5l5-5" />
      <path d="M11 7.5l1-1a3.5 3.5 0 1 1 5 5l-1.2 1.2" />
      <path d="M13 16.5l-1 1a3.5 3.5 0 1 1-5-5l1.2-1.2" />
    </Icon>
  )
}

/** A chord's shape on the neck: four strings, three frets, two fingers down. */
export function IconChordShape(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 4v16M11 4v16M15 4v16M19 4v16" />
      <path d="M5 8h16M5 12h16M5 16h16" />
      <circle cx="11" cy="8" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function IconPublish(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 20V8" />
      <path d="m7 13 5-5 5 5" />
      <path d="M5 4h14" />
    </Icon>
  )
}

/**
 * The brand mark: Strumfolio's actual note glyph, traced from the vector logo
 * (`svg/note.svg` in the brand asset drop) rather than a generic icon-set note.
 * The viewBox keeps the glyph's real proportions (taller than wide); the default
 * `preserveAspectRatio` centers it inside the `size`×`size` box every caller
 * already assumes, so nothing at any call site has to change for the shape to
 * no longer be square.
 */
export function IconNote({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 119 179"
      fill="none"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path
        d="M21.9 178.0C8.0 175.6 -1.3 164.3 0.5 152.1C3.6 131.3 31.8 113.6 53.1 119.1L59.0 120.7L59.0 60.3L59.0 0.0L65.3 0.0L71.6 0.0L73.7 7.3C76.8 17.6 82.1 25.1 94.9 37.0C110.9 52.0 117.2 62.2 118.6 75.2C119.8 87.0 114.5 102.7 106.2 112.0C101.0 117.9 99.8 116.7 102.6 108.3C110.2 85.9 102.4 65.4 82.7 55.5C70.6 49.5 71.8 44.9 72.1 98.2C72.4 143.9 72.3 144.6 70.1 150.2C65.9 160.9 57.5 169.2 45.6 174.5C41.1 176.5 29.1 179.3 27.0 178.9C26.7 178.8 24.4 178.4 21.9 178.0Z"
        fill="currentColor"
      />
    </svg>
  )
}

/**
 * A shield: the administration menu, and only that. Deliberately a new drawing rather than
 * reusing one already in the bar — `IconSettings` and `IconKey` are spoken for inside the
 * user menu, and `IconSliders` is the reading bar's own controls button, so borrowing either
 * would give one glyph two meanings on the same screen. A shield over a narrower reading
 * (`IconUsers`) because what sits behind it is not only accounts.
 */
export function IconShield(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3l7 3v5.6c0 4.2-2.9 7.4-7 8.4-4.1-1-7-4.2-7-8.4V6l7-3z" />
    </Icon>
  )
}

/** Two accounts, swapped: the account switcher. */
export function IconSwitchAccount(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8h13l-3-3" />
      <path d="M20 16H7l3 3" />
    </Icon>
  )
}

/** Two overlapping sheets: copying a songbook into another account. */
export function IconCopy(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Icon>
  )
}

/** A four-point sparkle: the feedback sheet's "Feature request" card. */
export function IconSparkle(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 13.7 8l4.5 1.7-4.5 1.7L12 15.9l-1.7-4.5L5.8 9.7 10.3 8z" />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </Icon>
  )
}

/** A bug, legs and all: the feedback sheet's "Bug report" card. */
export function IconBug(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="8" y="7.5" width="8" height="11" rx="4" />
      <path d="M9.5 8.2a2.5 2.5 0 0 1 5 0" />
      <path d="M8 11H4.8M16 11h3.2M8 15H5.2M16 15h2.8M9.5 18.6 7.8 21M14.5 18.6 16.2 21M9.5 7.6 8 5.2M14.5 7.6 16 5.2" />
    </Icon>
  )
}

/** A head in thought: the feedback sheet's "Improvement" card. */
export function IconIdea(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.2 16.5a6 6 0 1 1 5.6 0" />
      <path d="M9.5 19.5h5M10.5 22h3" />
    </Icon>
  )
}

/** A padlock: a plan-gated control, locked for a plan that refuses it. */
export function IconLock(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </Icon>
  )
}

/** A picture frame: attaching a screenshot to a piece of feedback. */
export function IconImage(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="m5 16 4.2-4.2 3 3L15 12l4 4" />
      <circle cx="15" cy="9.5" r="1.3" fill="currentColor" stroke="none" />
    </Icon>
  )
}

/** A plain arrow: the feedback sheet's Send button, once there is something to send. */
export function IconArrowRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12h13" />
      <path d="m12 7 5 5-5 5" />
    </Icon>
  )
}

/** Google's mark, in its own colours, as the sign-in button expects. */
export function IconGoogle({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}
