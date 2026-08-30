# Product

## Users

Musicians — solo players and bands — reading their own repertoire of lyrics and chords
while performing or rehearsing, on a tablet or phone propped up in front of them. The
context is physical: hands are on an instrument, eyes glance down between phrases, light
ranges from a lit rehearsal room to a dark stage. Registration is open to anyone with an
email address; each account is its own private repertoire, with a small set of global
owners who administer the whole installation. There is no shared or public repertoire to
design for, only each reader's own.

## Product Purpose

Keep the text readable and the hands free while playing. Every reading control — zoom,
auto-scroll, key transposition, notation switch, capo — exists because it serves that one
job, and each is a thumb's reach away rather than buried in a settings menu. Songs are
organized into songbooks (canzonieri), each a folder for a set or a repertoire; content
edited in the app becomes visible immediately, ahead of the next static publish, and stays
available offline once published. Success looks like: a player never loses their place, on
any device, with or without a connection.

## What It Does

**A repertoire, organized.** Songs live inside songbooks — one set list, one band, one
occasion each — and a songbook splits into sections so a long repertoire stays a set of
short lists rather than one long scroll. Reordering, in both songbooks and sections, is a
drag with a finger or a keyboard, on stage as much as at a desk; search reaches every song
at once, because the first question when looking for a song is rarely which songbook it's
in.

**Reading, tuned for the stage.** Chords sit above the words they belong to, the way
printed music does. A semitone stepper transposes on a tap, always shown as the distance
from the song's own written key rather than forcing anyone to think in absolute note names;
a capo suggestion finds the fret that leaves the most chords open, so the hand plays the
easiest shape, not just the right sound. Every chord is also a button — tap it and see the
fingering, worked out from the notes that make the chord rather than looked up in an
external library, guitar on every plan and ukulele on the paid ones. Auto-scroll runs at
one of eight speeds with the screen held awake for it, and a manual scroll pauses it rather
than fighting it. Two full notations, Italian and international, switch per reader, never
per song.

**Bringing songs in, and keeping them current.** There is no catalogue to browse — every
song is one somebody pasted in, except the one songbook of public-domain traditionals a
new account is created with, so the first screen has something playable on it instead of
being empty. That songbook is ordinary from the moment it exists: editable, renamable,
deletable, and counted against the plan like any other. The importer recognizes ChordPro on sight and converts
"chords above the lyrics" copied from anywhere else, always behind a preview that stays
editable before it saves, because the conversion is a heuristic and won't always get it
right. Pasting more than one song at once splits automatically on the boundaries ChordPro
itself defines. A song already added is never finished: the visual editor keeps a chord
pinned to the syllable it belongs to while the lyrics are edited in place — split a line,
join two, drag a chord to a different beat — without ever hand-writing a bracket, and every
edit is visible on the reading screen the moment it's saved, ahead of the next deploy.

**Never without the repertoire.** Installed as a PWA, Strumfolio opens instantly with no
connection: pages a reader has actually opened are cached as they're read, not downloaded
in bulk on install. A rehearsal room with no signal, or a stage with a phone in airplane
mode, changes nothing about what's already open.

**Playing as more than one.** Strum Together turns a solo reading session into a shared
one: whoever's playing shares a link, and anyone who opens it — no account, no install —
follows the same song in the same key from their own screen, automatically, whether it's a
duo or a full room singing along.

**A private space, not a library to browse.** Every account is one person's own, created by
signing in with Google or with an email and password — nobody invited, nobody excluded. The
free plan holds a real repertoire with no time limit; paid plans lift the songbook and song
caps and add what makes sense to gate — ukulele shapes, starting a Strum Together session,
a printed booklet — never the caps on reading, editing, or playing what's already there.

## Brand Personality

Precise, warm, considered. The app already speaks this through code, not just visuals: two
themes each hand-tuned rather than one inverted from the other, an accent color reserved
first for chords so nothing else competes with the one thing that must stay unmistakable,
and a corner-radius scale built from what each shape's job is rather than an arbitrary
size. Nothing decorative ships without a stated reason. Warmth comes from the neutral
palette and the unhurried, well-explained craft — never from mascots, playfulness, or
marketing flourish.

## Anti-references

Ad-heavy, cluttered chord/tab sites (Ultimate Guitar and similar) — anything that trades
distraction-free reading for ad slots, popups, or a busy page. Also avoid generic
dark-developer-tool aesthetics (flat near-black surfaces with a single neon accent) —
Strumfolio's dark theme is warm and hand-tuned, not a default inversion.

## Design Principles

- **One job, done well.** Every control on the reading screen earns its place by serving
  legibility or hands-free playing; nothing is added because a settings menu had room.
- **Both themes are designed, not inverted.** Light and dark are each their own considered
  surface — elevation, accent, and shadow are rethought per theme, not swapped by formula.
- **The accent is the chord's color first.** Anything else that borrows the accent (a
  badge, an active control) stays deliberately quieter than the chords themselves.
- **What you save, you see.** Edits appear immediately against the database version, ahead
  of the next static publish — the reader is never staring at stale content while a
  correction sits unpublished.
- **Offline is a real mode, not a fallback.** Precached pages and the service worker are
  designed for, not patched in after the fact — a song already open must keep working with
  no connection.

## Accessibility & Inclusion

No formal WCAG target beyond the current considered-by-default bar: reduced-motion
alternatives on every animation, visible focus rings, and contrast checked across both
hand-tuned themes rather than assumed from one. Keep that bar on any new surface; raise a
flag if a specific WCAG level or user need comes up later.
