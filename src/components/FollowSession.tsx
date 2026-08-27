'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { ControlBar, type NavSteps } from '@/components/ControlBar'
import { GuestSettingsMenu } from '@/components/GuestSettingsMenu'
import { PrefsProvider, usePrefs } from '@/components/PrefsProvider'
import { SongSheet } from '@/components/SongSheet'
import { IconBroadcast, IconChevronDown, IconChevronLeft, IconChevronRight } from '@/components/icons'
import { chordTokens, parseChordPro } from '@/lib/chordpro'
import type { Song } from '@/lib/data/types'
import { DEFAULT_SONG_PREFS } from '@/lib/prefs/types'
import {
  type GuestSongbook,
  type GuestSongbookContent,
  guestListSongbooks,
  guestListSongs,
  guestLoadSong,
  guestSeriesOf,
} from '@/lib/strumTogether/guestReads'
import { pollBroadcast } from '@/lib/strumTogether/session'

/** How often a guest's device asks what the broadcast is showing now. */
const POLL_MS = 4000

/**
 * How often, and how many times, a device that was turned away keeps asking for a place.
 *
 * The arithmetic is the whole argument. A slot is held for a while after its last heartbeat,
 * so the commonest reason to be refused — a tab closed a minute ago that has not lapsed yet —
 * resolves on its own within a couple of minutes, and asking every 30 s catches the freed
 * place several times inside that window, well within one song. Leaving the four-second loop
 * running would ask seven or eight times as often for the same answer, paid for by a device
 * that is not following anything; stopping dead instead is the opposite failure, stranding
 * somebody whose place frees up ninety seconds later.
 *
 * Ten attempts is five minutes: longer than a leader takes to notice that a friend cannot get
 * in, short enough that a phone left face-down on a table stops asking somebody else's
 * database for a place nobody is waiting for. After that the screen asks nothing at all until
 * `Try again` is pressed.
 *
 * Note what this deliberately is *not*: the staleness window itself. The client is never told
 * that number — see the `'full'` branch below — because a client that knew it could be tempted
 * to schedule around it. This constant was chosen *against* it, which is a comment, not a
 * value shared between the two sides.
 */
const FULL_POLL_MS = 30_000
const FULL_ATTEMPTS = 10

/**
 * One songbook's songs, plus which of its sections this guest has opened.
 *
 * Bundled together rather than two separate pieces of state so that opening a
 * *different* songbook always starts folded the same way `SongbookSongs` does for a
 * songbook nobody has looked at yet: swapping this whole object for a new one throws
 * the old fold state away for free, instead of it lingering keyed by section ids that
 * happen not to collide with the new songbook's.
 */
interface OpenSongbook {
  slug: string
  content: GuestSongbookContent
  open: Record<number, boolean>
}

/**
 * The song on screen, and why it is there.
 *
 * A guest's own tap and the broadcaster's play are not the same kind of "showing a
 * song", and the difference is not cosmetic: only a followed song is locked to a key
 * it did not choose, and only a followed song carries that key here at all. A song the
 * guest picked keeps whatever key their own `PrefsProvider` last had for it — there is
 * no broadcast semitones value to disagree with it.
 */
type ShownSong = { data: Song; following: false } | { data: Song; following: true; semitones: number }

/**
 * `'full'` is an end state like `'ended'`, not an error: the broadcast is fine and this
 * device simply has no place on it. The render below is an if/else chain rather than an
 * exhaustive switch, so a missing branch here compiles perfectly well and falls through to
 * the songbook list with nothing in it — which is why `'full'` has its own branch beside
 * `'ended'` and not further down.
 */
type Screen = 'loading' | 'ended' | 'full' | 'songbooks' | 'songbook' | 'song'

/**
 * Whether the broadcast is currently allowed to move this guest around.
 *
 * `'suspended'` is the one thing `onUnfollow` sets and `onFollowLive`/on-song `Follow`
 * clears — everywhere else in this file only reads it, through `followStateRef` inside
 * the poll loop and directly as state everywhere else.
 */
type FollowState = 'following' | 'suspended'

/** What the broadcast is showing right now, regardless of whether this guest follows it. */
interface LiveNow {
  songSlug: string
  semitones: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isSectionOpen(songbook: OpenSongbook, sectionId: number): boolean {
  // Closed unless the guest opened it, or it is the only section there is — the same
  // two defaults `SongbookSongs` uses, minus the "arrived from a song" exception, which
  // needs a URL fragment this screen has no equivalent of.
  return songbook.open[sectionId] ?? songbook.content.sections.length === 1
}

/**
 * The whole guest side of Strum Together: everything that opens when someone with no
 * account follows a broadcaster's link.
 *
 * Three things a guest can be looking at, and the broadcast can end any of them without
 * asking:
 *
 * 1. **Browsing** — the songbooks, then one songbook's songs, read exactly like a
 *    signed-in visitor would, through `guestListSongbooks`/`guestListSongs`/
 *    `guestLoadSong` instead of the mutable layer a session would unlock.
 * 2. **Following** — the broadcaster played something, so this screen is showing it, at
 *    the broadcaster's key, whether or not that is what this guest was doing a moment
 *    ago. `Unfollow` suspends this: the guest is free to browse again and the broadcast
 *    stops overriding what is on screen, until `Follow` — on the song itself, or on
 *    `LiveNowBanner` from anywhere else — picks it back up. Suspending is this guest's
 *    own choice alone; it does not touch the broadcast itself or any other guest on it.
 * 3. **Ended** — the token no longer answers to a live broadcast, whether because it
 *    expired, was replaced by a fresh one, or never was one. Every guest action reports
 *    this the same way (`null`), so this screen reacts to it the same way everywhere:
 *    stop, and say so plainly.
 * 4. **Full** — the broadcast is live and this device has no place on it: as many devices
 *    as it can carry are already following. Not an error and not an eviction — nothing in
 *    this feature ever takes a place away from a device that holds one, so the only two
 *    ways to see this screen are never having had a place and having let one go quiet.
 *    It waits a while for one to free up, then stops asking and offers to try again — except
 *    when the server says the broadcast can admit nobody at all, where waiting cannot work
 *    and is not offered. See `fullState`.
 *
 * The order the loop below does things in is part of 4: the poll comes *first*, and the
 * songbook list is only read once a poll has answered `ok`. A device that is being turned
 * away must not get a flash of a repertoire it is not being let into, and it should cost one
 * request rather than four.
 *
 * What ties 1 and 2 together is a poll every few seconds, compared against *what is
 * currently on screen* rather than against whatever the previous poll said — see the
 * comment on `reconcile` below for why that is the one comparison that gets both "the
 * broadcast already had something playing before I opened this link" and "a guest who
 * happens to be reading the very song being broadcast, on their own" right without
 * writing either case down as a rule of its own. The same poll always updates `live`
 * too, suspended or not — a guest who has stopped following still needs to know what
 * there is to come back to.
 *
 * Everything above shares one `PrefsProvider`, mounted once at the very top rather than
 * once per song: a guest who turns on dark mode or switches to ukulele partway through
 * one song should not have it forgotten the moment the broadcast moves to the next one.
 * `GuestSettingsMenu` is where that reaches the guest — the one thing besides reading
 * itself this screen lets them touch.
 */
export function FollowSession({ token }: { token: string }) {
  const [screen, setScreen] = useState<Screen>('loading')
  const [songbooks, setSongbooks] = useState<GuestSongbook[]>([])
  const [songbook, setSongbook] = useState<OpenSongbook | null>(null)
  const [song, setSong] = useState<ShownSong | null>(null)
  const [followState, setFollowState] = useState<FollowState>('following')
  const [live, setLive] = useState<LiveNow | null>(null)
  const [liveMeta, setLiveMeta] = useState<{ title: string; artist: string | null } | null>(null)

  /*
   * Two pieces rather than three `'full' | 'full-stopped' | 'full-closed'` screens: `screen`
   * says what is on the screen and `fullState` says why it is still there — the same split
   * `ShownSong` already makes between what is showing and why.
   *
   * `'waiting'` is still asking and expects a place to appear; `'stopped'` has spent its
   * attempts; `'closed'` is the server saying this broadcast cannot admit *anybody*, so
   * waiting is not a thing that can work and the copy must not pretend otherwise. The third
   * one is a state, not a screen, precisely because the two people reading them are in the
   * same position — outside a live broadcast, with nothing to do but ask the person who
   * shared the link — and only the sentence differs.
   *
   * `rejoin` is a nonce whose only job is to be in the poll effect's dependency array:
   * bumping it tears the loop down and starts a fresh one, which resets its attempt counter
   * for free rather than by hand.
   */
  const [fullState, setFullState] = useState<'waiting' | 'stopped' | 'closed'>('waiting')
  const [rejoin, setRejoin] = useState(0)

  /**
   * Every song this guest has ever loaded, by slug — filled in wherever `guestLoadSong`
   * already succeeds (opening one, following one, jumping to the live one), never
   * fetched for its own sake. The one thing it buys: `LiveNowBanner` can usually show a
   * title without a request of its own, and `followLive` can usually jump without
   * waiting on one.
   */
  const songCacheRef = useRef<Map<string, Song>>(new Map())

  /*
   * What the poll loop below reads to decide whether the broadcast disagrees with the
   * screen. It has to be a ref: the loop is one closure started once, in the effect
   * below, and by the time a poll several seconds later needs to ask "what is showing
   * right now", a tap may have changed `screen`/`song` since the closure was made. A
   * plain read of the state variables there would answer with whatever they were when
   * the effect ran, not with whatever is actually on screen.
   */
  const shownRef = useRef<{ screen: Screen; song: ShownSong | null }>({ screen: 'loading', song: null })
  useEffect(() => {
    shownRef.current = { screen, song }
  }, [screen, song])

  /** Same reasoning as `shownRef`, for the one other thing the poll loop needs to read fresh: whether this guest has suspended following since the loop's closure was made. */
  const followStateRef = useRef<FollowState>('following')
  useEffect(() => {
    followStateRef.current = followState
  }, [followState])

  /**
   * Same reasoning again, this time for `followLive` below rather than the poll loop:
   * once its own fetch is in flight, `live` may move on to a different song before it
   * resolves, and a plain closure over the state would never see that — only a ref
   * synced on every render does.
   */
  const liveRef = useRef<LiveNow | null>(null)
  useEffect(() => {
    liveRef.current = live
  }, [live])

  /**
   * Sidesteps setting state on a component that is no longer here — used only by the
   * tap handlers below, whose awaited reads can outlive a guest navigating away mid
   * flight. The poll loop keeps its own flag instead of this one; see its own comment
   * for why the two must not be the same flag.
   */
  const goneRef = useRef(false)
  useEffect(() => {
    goneRef.current = false
    return () => {
      goneRef.current = true
    }
  }, [])

  useEffect(() => {
    /*
     * Local to this one run of the effect, deliberately not the ref above. In
     * development, StrictMode mounts this effect, tears it down, and mounts it again
     * before settling — and a flag shared with the tap handlers, reset to `false` every
     * time the effect body runs, would un-cancel the *first* run's loop the instant the
     * second run started, leaving two loops polling the same broadcast forever instead
     * of one. A variable closed over by this call alone cannot be reset by any other
     * call: only this run's cleanup ever sets it, and only this run's loop ever reads
     * it, so the first run's loop stays cancelled no matter how many more follow it.
     */
    let cancelled = false

    /**
     * Reconciles one poll's answer against whatever is currently on screen.
     *
     * `live` is set unconditionally, first, whether or not this guest is following —
     * it is the one thing a suspended guest still needs, so `LiveNowBanner` and a
     * paused `FollowedSong` both know what `Follow` would jump to. Everything after
     * that only runs while `followStateRef.current` still says `'following'`; suspended,
     * this function's whole job ends the moment `live` is set.
     */
    async function reconcile(songSlug: string | null, semitones: number): Promise<void> {
      setLive(songSlug === null ? null : { songSlug, semitones })

      if (followStateRef.current === 'suspended') return

      // Nothing playing yet — the broadcast has opened but nobody has pressed play, or
      // (per this token's own rules) never will again under this token. Either way,
      // there is nothing here to force the guest onto, so leave them to browse.
      if (songSlug === null) return

      const shown = shownRef.current
      const displayedSlug = shown.screen === 'song' && shown.song !== null ? shown.song.data.slug : null

      if (songSlug !== displayedSlug) {
        /*
         * Different from what is on screen — including "nothing", which is what a
         * guest browsing the songbooks or a songbook's songs is showing, and including
         * the very first poll this loop ever makes, if the broadcast already had a
         * song going before this guest opened the link at all. Either way the answer is
         * the same: fetch it and switch into following mode, overwriting whatever the
         * guest was doing. The broadcaster's play always wins over ordinary browsing;
         * the one thing that holds it off is this guest's own choice to suspend, above.
         */
        const loaded = await guestLoadSong(token, songSlug)
        if (cancelled) return

        if (loaded === null) {
          setScreen('ended')
          return
        }

        songCacheRef.current.set(loaded.slug, loaded)
        setSong({ data: loaded, following: true, semitones })
        setScreen('song')
        return
      }

      /*
       * The same song is already on screen. If that is because this guest is following
       * it, the key may still have moved — push it along, with no re-fetch, since the
       * song's own words have not changed.
       *
       * If instead it is on screen because the guest happened to browse to the very
       * song the broadcast is playing on their own, or because they suspended following
       * on this exact song a moment ago, this branch does nothing: nothing above just
       * made that switch, and nothing here promotes either case into following mode.
       * That guest keeps reading it their own way, unlocked, until the broadcast
       * actually changes to something else — the one event that still sweeps them
       * along regardless, per the check above.
       */
      if (shown.song !== null && shown.song.following && shown.song.semitones !== semitones) {
        setSong({ data: shown.song.data, following: true, semitones })
      }
    }

    /*
     * One loop, and the only caller of `pollBroadcast` anywhere: the poll is what admits this
     * device, keeps its place and reports what is playing, all in the one request the guest
     * was already making every few seconds. There is deliberately no separate "join" call to
     * make first — the poll has to be able to answer `full` regardless, for the phone that
     * held a place, locked its screen long enough to lose it, and wakes up to a broadcast
     * that has filled up since. Two calls that can both refuse a device is two calls that
     * can disagree about whether it is in.
     *
     * The songbook list is read *inside* the loop, once, after the first `ok` — see the
     * component's own doc comment for why admission comes first. `admitted` is loop-local
     * like `cancelled`, so a manual `Try again` re-reads the list: that is one extra request
     * for a list which may be minutes stale by then, and it must not be "fixed" by hoisting
     * the flag into a ref, which would leave a readmitted guest reading a list from before
     * they were turned away.
     */
    async function run(): Promise<void> {
      let admitted = false
      /*
       * Loop-local for exactly the reason `cancelled` is, and the mistake to avoid is the
       * same one: a ref would survive StrictMode's mount/unmount/mount and carry the first
       * run's attempt count into the second, so a device would give up after fewer tries
       * than the constant says — in development only, which is the worst place to learn it.
       *
       * Not reset when a poll succeeds, which is a choice and not an oversight: this counts
       * the slow retries one mount is willing to pay for, not the ones per refusal. A device
       * that got in, went quiet long enough to lose its place and was then turned away has
       * whatever budget it had not already spent — and the alternative, resetting on every
       * success, lets a device that flaps in and out retry for as long as the tab is open,
       * which is the unbounded cost the whole `'full'` branch exists to avoid. `Try again`
       * is the deliberate way to buy five more minutes, and it is a person pressing it.
       */
      let fullAttempts = 0

      // Polling starts right away, not after the first four-second wait: a broadcast
      // that already had a song going before this link was opened should not leave its
      // guest looking at the songbook list for a beat first.
      while (!cancelled) {
        let poll
        try {
          poll = await pollBroadcast(token)
        } catch {
          // A dropped request is not the same answer as a refusal or an expired token — it
          // is not an answer at all. Only an explicit `{ ok: false }` with a reason moves
          // this screen anywhere; a throw leaves it exactly where it is and tries again next
          // tick, rather than telling a guest with a flaky connection that the link is over.
          await sleep(POLL_MS)
          continue
        }
        if (cancelled) return

        if (!poll.ok) {
          if (poll.reason === 'expired') {
            setScreen('ended')
            return
          }

          /*
           * Refused. The four-second loop stops here — that is what bounds a device with no
           * place to the cost of one slow retry rather than a join attempt every four
           * seconds forever, and it stops a refused device racing guests who are actually
           * waiting for the next place to free up. `song` and `followState` are left
           * untouched on purpose: when a retry does succeed, `reconcile` compares the live
           * song against what is on *screen*, reads this screen as showing nothing, and
           * therefore follows the broadcast properly with no readmission path of its own.
           */
          setScreen('full')

          /*
           * `closed` stops even the slow retries, because the server has said this broadcast
           * admits nobody at all rather than nobody *more*: ten more asks over five minutes
           * would each get the same answer, and the screen would spend that time promising a
           * place that cannot appear. The `Try again` button is still there — a person
           * pressing it is a person who has just talked to whoever shared the link, and
           * something may genuinely have changed.
           */
          if (poll.reason === 'closed') {
            setFullState('closed')
            return
          }

          fullAttempts += 1
          if (fullAttempts >= FULL_ATTEMPTS) {
            setFullState('stopped')
            return
          }
          await sleep(FULL_POLL_MS)
          continue
        }

        if (!admitted) {
          let list
          try {
            list = await guestListSongbooks(token)
          } catch {
            // Same rule as the poll's own catch: not an answer, so not a verdict. Try again
            // on the next tick, and in the meantime this guest keeps looking at `Loading…`
            // rather than at a link declared over.
            await sleep(POLL_MS)
            continue
          }
          if (cancelled) return

          if (list === null) {
            setScreen('ended')
            return
          }

          setSongbooks(list)
          setScreen('songbooks')
          admitted = true
        }

        await reconcile(poll.songSlug, poll.semitones)
        if (cancelled) return

        await sleep(POLL_MS)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
    /*
     * `rejoin` is here so that `Try again` restarts this whole effect: a fresh loop, a fresh
     * `fullAttempts`, and one more poll straight away rather than after another 30 s wait.
     */
  }, [token, rejoin])

  /*
   * `pollBroadcast` only ever answers with a slug and a key, never a title — so
   * `LiveNowBanner` needs its own way to learn one, for a song this guest may never
   * have opened. Hoisted out of the effect below the same way `token` is hoisted in
   * `NavMenu`'s matching effect: `live?.songSlug` written out in the dependency array
   * would repeat the same optional chain the body already has to do, twice, with two
   * chances to drift apart.
   */
  const liveSlug = live?.songSlug
  useEffect(() => {
    if (liveSlug === undefined) {
      setLiveMeta(null)
      return
    }

    const cached = songCacheRef.current.get(liveSlug)
    if (cached !== undefined) {
      setLiveMeta({ title: cached.title, artist: cached.artist })
      return
    }

    setLiveMeta(null)
    let cancelled = false
    void guestLoadSong(token, liveSlug).then((loaded) => {
      if (cancelled || loaded === null) return
      songCacheRef.current.set(loaded.slug, loaded)
      setLiveMeta({ title: loaded.title, artist: loaded.artist })
    })
    return () => {
      cancelled = true
    }
  }, [token, liveSlug])

  async function openSongbook(slug: string): Promise<void> {
    const content = await guestListSongs(token, slug)
    if (goneRef.current) return

    if (content === null) {
      setScreen('ended')
      return
    }

    setSongbook({ slug, content, open: {} })
    setScreen('songbook')
  }

  async function openSong(slug: string): Promise<void> {
    const loaded = await guestLoadSong(token, slug)
    if (goneRef.current) return

    if (loaded === null) {
      setScreen('ended')
      return
    }

    songCacheRef.current.set(loaded.slug, loaded)
    setSong({ data: loaded, following: false })
    setScreen('song')
  }

  /**
   * What the reading bar's own prev/next capsule calls — `openSong`, plus suspending
   * first if this guest was following. Without the suspend, `reconcile`'s own rule
   * ("the broadcaster's play always wins over ordinary browsing") would read the very
   * next poll as this guest still following, see a song that disagrees with what the
   * broadcast is showing, and pull them straight back to it — undoing a tap that,
   * unlike drifting to the songbook list for a moment, was a deliberate choice to read
   * something else.
   */
  async function stepToSong(slug: string): Promise<void> {
    followStateRef.current = 'suspended'
    setFollowState('suspended')
    await openSong(slug)
  }

  function toggleSection(sectionId: number): void {
    if (songbook === null) return
    setSongbook({ ...songbook, open: { ...songbook.open, [sectionId]: !isSectionOpen(songbook, sectionId) } })
  }

  /**
   * Stops the broadcast from moving this guest anywhere, without leaving the song
   * being shown right now — see `FollowState`'s own doc comment for what this does and
   * does not affect. A no-op unless the reason this song is on screen is that it is
   * being followed; there is nothing to suspend on a song the guest opened themselves.
   *
   * Drops `semitones` from `song` on the way — harmless, since `PrefsProvider` above it
   * keeps `key={song.data.slug}` unchanged and so is never remounted: the key this guest
   * was just following stays exactly where `PushBroadcastKey` last left it, now simply
   * theirs to move.
   */
  function unfollow(): void {
    if (song === null || !song.following) return
    setSong({ data: song.data, following: false })
    setFollowState('suspended')
  }

  /**
   * Jumps to whatever the broadcast is showing right now and resumes following it —
   * the one way back in, from anywhere, once suspended. Reuses the song already on
   * screen without a request when that happens to already be the live one — the same
   * song the `Follow` shown next to `LiveNowBanner`'s own copy of this handler would
   * otherwise have to re-fetch.
   *
   * `followStateRef` flips synchronously, before the fetch below can even start:
   * otherwise, if the leader changes song while this is still awaiting one, the poll
   * loop reads the ref as still `'suspended'` and holds off on its own account, and
   * nothing else is watching in the meantime. Flipping it here hands the loop
   * responsibility for this guest immediately. `liveRef` is read again once the fetch
   * settles for the same reason — the plain `live` captured above is whatever was live
   * when this was called, not whatever is live now that it has actually finished. If
   * the two disagree, the fetch answered a question that is no longer being asked. That
   * is not treated as an error: the poll loop, now free to act, has either already
   * caught the change itself or will on its next tick, so this simply steps aside.
   */
  async function followLive(): Promise<void> {
    if (live === null) return

    followStateRef.current = 'following'
    setFollowState('following')

    const target = live
    const loaded =
      screen === 'song' && song !== null && song.data.slug === target.songSlug
        ? song.data
        : songCacheRef.current.get(target.songSlug) ?? (await guestLoadSong(token, target.songSlug))
    if (goneRef.current) return

    if (liveRef.current === null || liveRef.current.songSlug !== target.songSlug) return

    if (loaded === null) {
      setScreen('ended')
      return
    }

    songCacheRef.current.set(loaded.slug, loaded)
    setSong({ data: loaded, following: true, semitones: liveRef.current.semitones })
    setScreen('song')
  }

  let content: React.ReactNode

  if (screen === 'loading') {
    content = <p className="mt-8 text-center text-sm text-muted">Loading…</p>
  } else if (screen === 'ended') {
    content = (
      <p className="mt-8 text-center text-sm text-muted">
        This link has ended. Ask whoever shared it for a new one.
      </p>
    )
  } else if (screen === 'full') {
    /*
     * Not a word about plans, prices, tiers or upgrades, and that is a decision rather than
     * brevity: this guest has no account, no plan and no way to act on somebody else's
     * billing, and naming the leader's plan to a stranger tells a friend what their friend
     * pays for. «Only so many devices can follow this broadcast at once» is true, is the
     * whole of what they can do anything about, and works for both people who reach this
     * screen — the one who never got in, and the one whose place went quiet while their
     * phone was locked. That second case is why it must not say «you could not join», and
     * why nothing here says «you were disconnected»: nobody is ever evicted.
     *
     * It also must not coach the way around itself. No «try a private window», no «use
     * another browser», no «clear your cookies» — a deterrent that ships with its own bypass
     * in the copy is not a deterrent, and the identity behind this refusal is exactly that:
     * a cookie, deterring casual link-forwarding, not stopping anybody who is trying.
     *
     * And nothing offers to browse the repertoire while waiting, tempting as it is: the
     * token is still a perfectly good read credential, so only this screen's own ordering
     * keeps a refused device off the shelf. Offering it would make the refusal ambiguous —
     * «am I in or not?» — and spend three reads on a device that is explicitly not
     * following.
     *
     * No `role="alert"` and no icon, matching `'ended'`: a full broadcast is the plan
     * working, not a fault, so it must not interrupt a screen reader, and `IconBroadcast`
     * here would decorate the refusal with the mark this app uses for the one thing this
     * device is not part of.
     *
     * `'closed'` gets its own two sentences and this is the point of the state existing: the
     * waiting copy promises that a place frees up, and there are broadcasts for which that is
     * provably false — one whose plan has lapsed under it keeps playing, deliberately, with a
     * cap that now admits nobody, and no device closing its link changes that. So the promise
     * is dropped rather than reworded, «full» is not claimed of a broadcast that may be empty,
     * and the one true instruction is kept. Still not a word about plans: the reason this
     * device cannot get in is somebody else's billing, which is exactly what the person who
     * shared the link can be asked about and this screen cannot.
     *
     * «a couple of minutes after another device closes the link», not «as soon as»: a place is
     * held for a while past its last heartbeat so that a phone whose screen locked for one
     * song keeps it, which means a closed tab frees nothing immediately. The number itself
     * stays off the client — see `FULL_POLL_MS` — but the shape of it has to be in the
     * sentence, or a guest watching nothing happen for two minutes concludes this is broken.
     */
    content = (
      <div className="mt-8 text-center">
        <p className="text-sm">
          {fullState === 'closed' ? "This broadcast isn't taking followers." : 'This broadcast is full.'}
        </p>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-[1.45] text-muted">
          {fullState === 'waiting' &&
            'Only so many devices can follow this broadcast at once. Leave this open for a few minutes — a place frees up a couple of minutes after another device closes the link.'}
          {fullState === 'stopped' && 'Still full. Ask whoever shared the link, then try again.'}
          {fullState === 'closed' &&
            'It cannot take another device at the moment, so waiting will not help. Ask whoever shared the link.'}
        </p>
        {fullState !== 'waiting' && (
          <button
            type="button"
            className="btn btn-sm mt-4"
            onClick={() => {
              setFullState('waiting')
              setRejoin((value) => value + 1)
            }}
          >
            Try again
          </button>
        )}
      </div>
    )
  } else {
    /*
     * Whether a guest who has suspended following still needs telling what the
     * broadcast is showing. Excluded the one time it would just repeat what
     * `FollowedSong`'s own `Follow` already says on this same screen — see
     * `LiveNowBanner`'s doc comment for why that overlap is the one case to avoid.
     */
    const showBanner =
      followState === 'suspended' &&
      live !== null &&
      !(screen === 'song' && song !== null && song.data.slug === live.songSlug)
    const banner = showBanner && (
      <LiveNowBanner title={liveMeta?.title ?? null} onFollow={() => void followLive()} />
    )

    if (screen === 'song' && song !== null) {
      content = (
        <>
          {banner}
          <FollowedSong
            token={token}
            song={song}
            isLive={live !== null && song.data.slug === live.songSlug}
            backLabel={songbook?.content.songbookName ?? 'Songbook'}
            onBack={() => setScreen('songbook')}
            onUnfollow={unfollow}
            onFollowLive={() => void followLive()}
            onStepTo={(slug) => void stepToSong(slug)}
          />
        </>
      )
    } else if (screen === 'songbook' && songbook !== null) {
      const total = songbook.content.sections.reduce((count, section) => count + section.songs.length, 0)

      content = (
        <>
          {banner}
          <div>
            <button type="button" className="back-link mb-4" onClick={() => setScreen('songbooks')}>
              <IconChevronLeft size={16} />
              <span>All songbooks</span>
            </button>

            <header className="mb-[1.125rem]">
              <h1 className="screen-title">{songbook.content.songbookName}</h1>
            </header>

            {total === 0 ? (
              <p className="panel p-3.5 text-sm text-muted">No songs in this songbook.</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted">
                  {total} {total === 1 ? 'song' : 'songs'}
                  {songbook.content.sections.length > 1 && ` · ${songbook.content.sections.length} sections`}
                </p>

                <ul className="card-stack">
                  {songbook.content.sections.map((section) => {
                    const open = isSectionOpen(songbook, section.id)

                    return (
                      <li key={section.id} className="card p-2">
                        <button
                          type="button"
                          className="row w-full text-left"
                          onClick={() => toggleSection(section.id)}
                          aria-expanded={open}
                        >
                          {open ? (
                            <IconChevronDown size={18} className="text-faint" />
                          ) : (
                            <IconChevronRight size={18} className="text-faint" />
                          )}
                          <span className="min-w-0 flex-1 truncate font-medium">{section.name}</span>
                          <span className="count-badge">{section.songs.length}</span>
                        </button>

                        {open &&
                          (section.songs.length === 0 ? (
                            <p className="px-[0.875rem] pb-2 pt-1 text-sm text-muted">
                              No songs in this section.
                            </p>
                          ) : (
                            <ul>
                              {section.songs.map((entry) => (
                                <li key={entry.slug}>
                                  <button
                                    type="button"
                                    className="row w-full text-left"
                                    onClick={() => void openSong(entry.slug)}
                                  >
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate">{entry.title}</span>
                                      {entry.artist !== null && (
                                        <span className="mt-0.5 block truncate text-[0.8125rem] text-muted">
                                          {entry.artist}
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ))}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        </>
      )
    } else {
      // screen === 'songbooks'
      content = (
        <>
          {banner}
          <div>
            <header className="mb-[1.125rem]">
              <h1 className="screen-title">Strum Together</h1>
              <p className="mt-2 text-sm leading-[1.45] text-muted">
                Browse the repertoire while you wait. The moment the broadcast plays a
                song, this screen switches to it, at the same key, on its own.
              </p>
            </header>

            {songbooks.length === 0 ? (
              <p className="mt-8 text-center text-sm text-muted">No songbook yet.</p>
            ) : (
              <ul className="row-list card">
                {songbooks.map((entry) => (
                  <li key={entry.slug}>
                    <button
                      type="button"
                      className="row w-full text-left"
                      onClick={() => void openSongbook(entry.slug)}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
                      <span className="count-badge">{entry.count}</span>
                      <IconChevronRight size={18} className="text-faint" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )
    }
  }

  return (
    <PrefsProvider persist={false} songSlug={null}>
      <header className="top-bar">
        <div className="top-bar-inner">
          <span className="flex-1" />
          <GuestSettingsMenu />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">{content}</main>
    </PrefsProvider>
  )
}

/**
 * What the broadcast is showing right now, for a guest who has suspended following and
 * wandered off elsewhere — the only way, otherwise, to know there is anything to rejoin.
 * `FollowSession` never renders this at the same time as `FollowedSong`'s own copy of
 * `Follow`: the two would say the same thing about the same song, right on top of each
 * other, so `showBanner` there excludes exactly that overlap.
 */
function LiveNowBanner({ title, onFollow }: { title: string | null; onFollow: () => void }) {
  return (
    <p className="notice notice-accent mb-4">
      <IconBroadcast size={16} />
      <span className="flex-1 truncate">{title === null ? 'Live now' : `Live now: ${title}`}</span>
      <button type="button" className="btn btn-sm shrink-0" onClick={onFollow}>
        Follow
      </button>
    </p>
  )
}

/**
 * One song, read either on the guest's own terms or on the broadcaster's.
 *
 * No `PrefsProvider` of its own: it shares the one `FollowSession` mounts once at the
 * top, so zoom, notation and instrument survive from one song to the next instead of
 * resetting — see that provider's own comment for why. Capo and scroll speed still need
 * to start fresh on every new song, since those are properties of *this* song rather
 * than of this guest in general; the effect below resets exactly those two and nothing
 * else. Semitones needs no such reset: `PushBroadcastKey`, just below, already forces it
 * to whatever the broadcast says the moment a followed song starts.
 *
 * The back link stays hidden while `following`: reaching it on its own would not
 * suspend anything, so the very next poll would read the screen as "different from what
 * the broadcast is showing" and undo it by following the same song straight back.
 * `onUnfollow` is the one thing that actually suspends — once it has, back is safe to
 * offer, and `isLive` decides whether `onFollowLive` is offered beside it: there is
 * nothing to rejoin on a song the broadcast is not actually showing.
 */
function FollowedSong({
  token,
  song,
  isLive,
  backLabel,
  onBack,
  onUnfollow,
  onFollowLive,
  onStepTo,
}: {
  token: string
  song: ShownSong
  /** Whether this exact song is what the broadcast is showing right now. */
  isLive: boolean
  /** The songbook `onBack` leads to. */
  backLabel: string
  onBack: () => void
  /** Suspends following without leaving this song — see `FollowedSong`'s own doc comment. */
  onUnfollow: () => void
  /** Resumes following, at whatever the broadcast is showing right now. */
  onFollowLive: () => void
  /** Suspends following (if following) and opens another song by slug — the reading
   *  bar's own prev/next capsule, wired to `stepToSong`. */
  onStepTo: (slug: string) => void
}) {
  const parsed = useMemo(() => parseChordPro(song.data.body), [song.data])
  const { setCapo, setScrollSpeed } = usePrefs()
  const [steps, setSteps] = useState<NavSteps | null>(null)

  useEffect(() => {
    setCapo(DEFAULT_SONG_PREFS.capo)
    setScrollSpeed(DEFAULT_SONG_PREFS.scrollSpeed)
    window.scrollTo(0, 0)
    /*
     * Tied to the slug alone, deliberately: `setCapo`/`setScrollSpeed` are new closures
     * every time this guest's prefs change — including from this very effect — so
     * putting them in the dependency array would run this again after every reset, not
     * just after a new song. `updateSong`'s own no-op check is what keeps that from
     * looping: once capo and speed are already at their defaults, calling this again
     * changes nothing and asks for nothing further. `FollowedSong` never unmounts between
     * songs — it swaps state in place instead of routing — so nothing else would ever
     * scroll a follower back to the top when the broadcast moves on.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.data.slug])

  /*
   * Read fresh for every song shown, regardless of how it got on screen — browsed to,
   * or swept in by the broadcast, which never populates `songbook` at all (see
   * `reconcile`). Cleared first rather than left showing the previous song's arrows for
   * a beat, the same reasoning `useStrumTogether`'s own audience count uses.
   */
  useEffect(() => {
    let cancelled = false
    setSteps(null)
    void guestSeriesOf(token, song.data.slug).then((series) => {
      if (cancelled) return
      setSteps(
        series === null
          ? null
          : {
              previous: series.previous,
              next: series.next,
              position: series.position,
              total: series.total,
            },
      )
    })
    return () => {
      cancelled = true
    }
  }, [token, song.data.slug])

  return (
    <>
      {song.following && <PushBroadcastKey semitones={song.semitones} />}

      {song.following ? (
        <p className="notice notice-accent mb-4">
          <IconBroadcast size={16} />
          <span className="flex-1">Following the broadcast — the key changes with it, live.</span>
          <button type="button" className="btn btn-sm shrink-0" onClick={onUnfollow}>
            Unfollow
          </button>
        </p>
      ) : (
        <div className="mb-4 flex items-center justify-between gap-3">
          <button type="button" className="back-link" onClick={onBack}>
            <IconChevronLeft size={16} />
            <span className="truncate">{backLabel}</span>
          </button>

          {isLive && (
            <button type="button" className="btn btn-sm shrink-0" onClick={onFollowLive}>
              <IconBroadcast size={16} />
              Follow
            </button>
          )}
        </div>
      )}

      <header className="mb-4">
        <h1 className="text-[1.6875rem] font-medium leading-[1.12] tracking-[-0.03em]">
          {song.data.title}
        </h1>

        {/*
          * The artist and where this song sits in the songbook, on one line — the same
          * shape `SongReader`'s own header has always had, and this screen gained the
          * second half of it when the reading bar's count went away below `sm` (see
          * `PrevNext`). It matters most for the reader who cannot act on it: a follower
          * is shown inert arrows while the broadcast chooses, and «3 of 12» is the whole
          * of what tells them where the leader has got to. Either half can be missing —
          * a song with no artist, a song reached by broadcast with no songbook behind it
          * — so the separator belongs to the position rather than sitting between two
          * things that may not both be there.
          */}
        {(song.data.artist !== null || steps !== null) && (
          <p className="mt-2.5 text-base text-muted">
            {song.data.artist}
            {steps !== null && (
              <>
                {song.data.artist !== null && <span className="text-faint"> · </span>}
                {steps.position} of {steps.total}
              </>
            )}
          </p>
        )}
      </header>

      <SongSheet song={parsed} />

      <div className="bar-spacer" />

      {/*
        * `broadcastEnabled={false}` keeps this bar's play/key controls purely local: this
        * screen must never call `broadcastPlay`/`broadcastTranspose`, whether or not the
        * browser showing the link happens to also be signed in somewhere else.
        * `semitonesLocked` is the other half, and about this screen specifically: while
        * following, it disables the key stepper so a guest cannot fight a value that
        * would only be pushed straight back by the next poll.
        */}
      <ControlBar
        songSlug={song.data.slug}
        chords={chordTokens(parsed)}
        semitonesLocked={song.following}
        broadcastEnabled={false}
        steps={steps}
        stepsLocked={song.following}
        onStepTo={onStepTo}
      />
    </>
  )
}

/**
 * The one bridge between a broadcast and this screen's own copy of the key.
 *
 * `PrefsProvider` has no idea a broadcast exists — it only ever holds whatever
 * `setSemitones` last told it. So the followed key has to be pushed in from outside,
 * which is what this does: once on mount, and again every time the poll's semitones
 * changes while this song stays followed.
 *
 * Mounted only inside `FollowSession`'s `persist={false}` provider, so this push stays
 * in memory for this guest's session alone — it never reaches a local cache, and never
 * queues a save to the database under whichever account, if any, happens to be signed
 * into the browser showing the link.
 */
function PushBroadcastKey({ semitones }: { semitones: number }) {
  const { setSemitones } = usePrefs()

  useEffect(() => {
    setSemitones(semitones)
  }, [semitones, setSemitones])

  return null
}
