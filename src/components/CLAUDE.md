# Components

Loaded when working under `src/components/`.

## The reading bar's motion

Added 2026-09-26: a press on every control, play and pause turning into each other, the panels
rising out of the bar, a song stepped to arriving from the side of the arrow, a progress line
while it scrolls and a cue for the next song when it ends. What is not visible from the result:

- **The next and previous songs are prefetched in full** (`prefetch` on `Step`'s `Link`). The
  route is `force-dynamic`, so the default prefetch fetched nothing and every step waited a whole
  server render with no answer on screen. That is two extra renders per song opened; measured
  locally, a step went from ~6 s to under 100 ms once they had landed. A step taken before they
  land shows `StepPending`'s line and fades the song being left (`body:has(…)`, after 150 ms).
  A full prefetch expires after five minutes (`staleTimes.static`) and the bar never leaves the
  viewport to trigger another, so `PrevNext` remounts the arrows every minute: the router
  refetches only an expired entry, so the remount is cheap.
- **There is deliberately no `loading.tsx` under `songs/[slug]`.** A skeleton would have replaced
  the reading bar the reader's thumb is on, and it would have needed `requireAccount` and
  `requirePlanChoice` moved into a layout (see `src/lib/auth/CLAUDE.md`).
- **The direction crosses the navigation in a module variable** (`lib/stepDirection.ts`), and
  `SheetEntrance` is keyed on the slug, which is the only reason a follower's in-place swap
  animates at all. With no direction the song rises instead (opened from a list, the back
  button, a broadcast), and **a hard load does not animate at all**: `useSyncExternalStore`'s
  server snapshot is what tells hydration from a client mount, so the server's markup and the
  first client render agree and words already painted never blink.
- **The end of a song is a count, not a flag** (`useAutoScroll`'s `endings`): the Next arrow's
  glow is keyed on it, and `PrevNext` marks a shown one as seen when it remounts the arrows for
  the prefetch, or the glow would replay every minute. An «Up next» card under the words was
  built the same day and removed on the owner's request: the arrow's glow is the whole cue, by
  decision. `tapFeedback` buzzes on Android and does nothing on an
  iPhone, which has no `navigator.vibrate`.
- **`:active` works on iOS because React listens for `touchstart` on its root.** Safari applies
  the state only where a touch listener exists, and React 19 registers one (passive) for every
  event it supports on the container it renders into — so every page has it, songbook lists and
  editor included, with nothing of ours to keep. Checked in `react-dom-client.production.js`
  (`listenToAllSupportedEvents`), not on a phone. The press uses the `scale` property, and the panels
  use `transform`, so neither collides with `.speed-popover`'s own `translate`.
