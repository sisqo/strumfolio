'use client'

import { Fragment, useEffect, useState } from 'react'
import QRCode from 'qrcode'

import {
  IconBroadcast,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconCopy,
  IconHare,
  IconPause,
  IconPlay,
  IconSliders,
} from '@/components/icons'
import { PhoneFrame } from '@/components/PhoneFrame'
import { audienceSentence, PLANS } from '@/lib/plans/types'
import { followUrl } from '@/lib/strumTogether/link'

/**
 * Strum Together, staged: a leader mid-broadcast with two phones scanning in beside them —
 * the third moving picture on `/login`, after `EditorPhone` and `ReaderPhone`, and built the
 * same way for the same reason: real classes (`.song-chips`, `.song-sheet`, `.sheet-*`,
 * `.notice`, `.rd-bar`) inside three `PhoneFrame`s rather than a screenshot, so none of it can
 * fall out of date on its own. One twenty-second loop, no clock of its own — every percentage
 * lives in the matching `st-*` keyframe in globals.css.
 *
 * **What the loop shows, in order**: the leader taps Strum Together and the link/QR sheet
 * opens; a phone scans in from the left and, once the scan locks, settles in behind the
 * leader, joined; a second scans in from the right the same way; the sheet closes; the leader
 * taps play, and all three screens start scrolling in step. Reduced motion rests on the
 * *outcome* — both joined, the sheet closed, mid-playback, scrolled to the payoff line — not
 * the opening frame; see the shared comment above `.strum-stage-device.is-left` in
 * globals.css for why this demo differs from `ReaderPhone`'s own choice there.
 *
 * **Narrow screens drop the second follower, not both.** Below 560px only the leader and the
 * left follower are drawn, at a scale that keeps them worth looking at; the leader's own count
 * and the sheet's "N devices following" hold at one to match, so the picture never claims a
 * phone it is not showing. All three are still rendered — which one is on stage is a CSS
 * question, since the count is CSS too and the two have to agree.
 *
 * **Left unlabelled on purpose**: the sheet music itself is section-less here because the real
 * `SongSheet` never prints a "Chorus"/"Verse" heading either (`.sheet-section.is-chorus` only
 * changes a border, not text) — a label the app never shows is not one this demo invents.
 *
 * **Two numbers this demo could have gotten wrong, checked against `lib/plans/types.ts`
 * rather than typed**: the follower count reads through `audienceSentence` at the cap the app
 * itself calls not worth naming (`PLANS.premium.devices`), so it only ever says "N devices
 * following" and never invents a plan's own cap on a page that sells no plan; and the
 * follower's own Capo differs from the leader's on purpose, not as a slip — `broadcastTranspose`
 * (`strumTogether/session.ts`) carries the key across, never the capo, which is exactly what
 * lets a follower keep whatever capo their own instrument is already wearing.
 */

/** A stand-in token — never a real broadcast, so the link and QR are illustrative only. */
const DEMO_TOKEN = '8f2c1a9d'

const CHORUS = [
  '[C]Strumfolio, take it anywhere',
  "[G]No wifi, no worries, I don't care",
  '[Am]Every song I love, one tap away',
  '[F]Transpose it, [C]play it, my way',
]

const VERSE_2 = [
  '[C]Two chairs and a kitchen table',
  '[G]Everybody on the same page',
  '[Am]One phone leads, the rest just follow',
  '[F]Same page, same key, nobody lost',
  '[C]Sing it once and sing it louder',
  '[G]Kitchen light until the morning',
]

/** Six spokes, 60° apart — the play button's confirmation burst, see `.st-burst-spoke` in
 *  globals.css for the rest of the effect. */
const BURST_ANGLES = [0, 60, 120, 180, 240, 300]

/**
 * "N devices following", at every count the loop passes through — read once from `PLANS`
 * rather than typed three times, the same rule `PromoPanel`'s own doc comment states for why:
 * a cap that changes has to change this with it, and this page sells no plan to name one for.
 */
const SHEET_COUNT = [0, 1, 2].map((n) => audienceSentence(n, PLANS.premium.devices))

interface DemoWord {
  chord: string | null
  text: string
}

/** `[Chord]word` shorthand, expanded into the words `SheetLine` below draws — a plainer cousin
 *  of `ReaderPhone`'s own `wordsOf`, with one chord per word rather than a written/raised pair,
 *  since nothing here changes key. */
function wordsOf(line: string): DemoWord[] {
  const words: DemoWord[] = []
  let pending: string | null = null

  for (const piece of line.split(/(\[[^\]]+\])/)) {
    if (piece === '') continue

    const chord = /^\[([^\]]+)\]$/.exec(piece)
    if (chord !== null) {
      pending = chord[1]
      continue
    }

    for (const text of piece.split(' ')) {
      if (text === '') continue
      words.push({ chord: pending, text })
      pending = null
    }
  }

  return words
}

function SheetLine({ line }: { line: string }) {
  return (
    <p className="sheet-line">
      {wordsOf(line).map((word, index) => (
        <Fragment key={index}>
          {index > 0 && ' '}
          <span className="sheet-word">
            <span className="sheet-part">
              <span className="sheet-chord" aria-hidden>
                {word.chord ?? ' '}
              </span>
              <span className="sheet-lyric">{word.text}</span>
            </span>
          </span>
        </Fragment>
      ))}
    </p>
  )
}

/** The "● Live" pill — a plain one on a follower's header, a counting one on the leader's. */
function LiveBadge({ leader }: { leader: boolean }) {
  return (
    <span className={leader ? 'st-live-badge is-leader' : 'st-live-badge'}>
      <span className="st-live-dot" aria-hidden />
      Live
      {leader && (
        <>
          <span className="st-live-sep" aria-hidden>
            ·
          </span>
          <span className="st-live-count">
            <span className="st-count-0">0</span>
            <span className="st-count-1">1</span>
            <span className="st-count-2">2</span>
          </span>
        </>
      )}
    </span>
  )
}

/** The play button's tap ripple and its bigger confirmation burst — the same radar-ping
 *  language `StrumToggle`'s own live pill already uses for "broadcasting", reused here
 *  rather than invented fresh. Purely decorative: `demo-transient` on every piece. */
function PlayBurst() {
  return (
    <>
      <span className="st-tap demo-transient" aria-hidden>
        <span className="st-tap-ring is-play" />
      </span>
      <span className="st-tap demo-transient" aria-hidden>
        <span className="st-burst-ring" />
        <span className="st-burst-ring is-second" />
        {BURST_ANGLES.map((deg) => (
          <span key={deg} className="st-burst-spoke-wrap" style={{ rotate: `${deg}deg` }}>
            <span className="st-burst-spoke" />
          </span>
        ))}
      </span>
    </>
  )
}

function LeaderScreen({ qr, link }: { qr: string | null; link: string }) {
  return (
    <div
      className="strum-demo"
      role="img"
      aria-label="The leader's screen: Strum Together opens a link and a QR code, two phones join one after the other, and pressing play sends the song scrolling on every screen at once."
    >
      <div className="rd-head">
        <div className="rd-head-row">
          <span className="icon-button">
            <IconChevronLeft size={20} />
          </span>

          <span className="rd-head-title">
            <span className="rd-head-name">Never Lose The Chord</span>
            <span className="rd-head-place">The Strumfolio Sessions · 1 of 9</span>
          </span>

          <LiveBadge leader />
        </div>

        <div className="song-chips">
          <span className="song-chip is-group">
            <span className="song-chip-step">−</span>
            <span className="song-chip-value">
              Key <span className="song-chip-badge">+0</span>
            </span>
            <span className="song-chip-step">+</span>
          </span>

          <span className="song-chip">
            Capo <strong>0</strong>
          </span>
        </div>
      </div>

      <div className="rd-body">
        <div className="rd-scroll">
          <div className="st-scroll">
            <div className="song-sheet">
              <section className="sheet-section is-chorus">
                {CHORUS.map((line) => (
                  <SheetLine key={line} line={line} />
                ))}
              </section>

              <section className="sheet-section is-verse">
                {VERSE_2.map((line) => (
                  <SheetLine key={line} line={line} />
                ))}
              </section>
            </div>
          </div>
        </div>
      </div>

      <div className="rd-bar">
        <span className="rd-step is-previous">
          <IconChevronLeft size={22} />
          Previous
        </span>

        <span className="rd-step is-next">
          Next
          <IconChevronRight size={22} />
        </span>

        <span className="rd-strum st-strum">
          <IconBroadcast size={23} />
          <span className="st-tap demo-transient" aria-hidden>
            <span className="st-tap-ring is-bc" />
          </span>
        </span>

        <span className="rd-play">
          <span className="st-play-icon">
            <IconPlay size={30} />
          </span>
          <span className="st-pause-icon">
            <IconPause size={30} />
          </span>
          <PlayBurst />
        </span>

        <span className="rd-tools">
          <span className="rd-tool is-speed">
            <IconHare size={24} />
            <span className="rd-speed-step">3</span>
          </span>
          <span className="rd-tool">
            <IconSliders size={24} />
          </span>
        </span>
      </div>

      <div className="st-scrim demo-transient" />

      <div className="st-sheet demo-transient">
        <div className="st-sheet-head">
          <IconBroadcast size={18} />
          <span className="st-sheet-title">Strum Together</span>
          <span className="st-sheet-close">
            <IconClose size={16} />
          </span>
        </div>

        <p className="st-sheet-text">
          Whoever opens the link follows the song and the key you&apos;re reading it in, live —
          no account needed on their side.
        </p>

        <div className="st-sheet-body">
          <span className="st-sheet-qr">
            {qr !== null && (
              // eslint-disable-next-line @next/next/no-img-element -- decorative data URL, illustrative only, never a real broadcast
              <img src={qr} alt="" aria-hidden width={72} height={72} />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="st-sheet-link">{link}</p>
            <span className="st-sheet-copy">
              <IconCopy size={14} />
              Copy link
            </span>
          </div>
        </div>

        <p className="st-sheet-count">
          <span className="st-count-0">{SHEET_COUNT[0]}</span>
          <span className="st-count-1">{SHEET_COUNT[1]}</span>
          <span className="st-count-2">{SHEET_COUNT[2]}</span>
        </p>

        <span className="st-sheet-stop">
          <IconBroadcast size={16} />
          Stop broadcasting
        </span>
      </div>
    </div>
  )
}

function FollowerScreen({ side, qr }: { side: 'left' | 'right'; qr: string | null }) {
  return (
    <div
      className="strum-demo"
      role="img"
      aria-label="A follower's screen: scanning the leader's QR code, then reading the same song and key live, with nothing installed and no account."
    >
      <div className={`st-scan is-${side} demo-transient`}>
        <div className="st-scan-frame">
          <span className={`st-scan-lock is-${side}`} aria-hidden />
          <span className="st-scan-qr">
            {qr !== null && (
              // eslint-disable-next-line @next/next/no-img-element -- decorative data URL, illustrative only
              <img src={qr} alt="" aria-hidden width={132} height={132} />
            )}
          </span>
          <span className={`st-scan-line is-${side}`} aria-hidden />
        </div>
        <p className="st-scan-text">
          Scanning the leader&apos;s code
          <small>No app, no account.</small>
        </p>
      </div>

      <div className="rd-head">
        <div className="rd-head-row">
          <span className="rd-head-title">
            <span className="rd-head-name">Never Lose The Chord</span>
            <span className="rd-head-place">Following Marco</span>
          </span>

          <LiveBadge leader={false} />
        </div>

        <div className="song-chips">
          <span className="song-chip">
            Key <strong>+0</strong>
          </span>
          <span className="song-chip">
            Capo <strong>2</strong>
          </span>
          <span className="song-chip">
            Chords <strong>names</strong>
          </span>
        </div>
      </div>

      <div className="rd-body">
        <div className="rd-scroll">
          <div className="st-scroll-follow">
            <div className="song-sheet">
              <section className="sheet-section is-chorus">
                {CHORUS.map((line) => (
                  <SheetLine key={line} line={line} />
                ))}
              </section>

              <section className="sheet-section is-verse">
                {VERSE_2.map((line) => (
                  <SheetLine key={line} line={line} />
                ))}
              </section>
            </div>
          </div>
        </div>
      </div>

      <p className="notice st-banner">
        <IconBroadcast size={16} />
        <span className="flex-1">Marco is leading — the key changes with it, live.</span>
        <span className="btn btn-sm shrink-0">Unfollow</span>
      </p>
    </div>
  )
}

export function StrumTogetherStage() {
  /*
   * A data URL, generated once on mount from a demo token that is never a real broadcast —
   * the same call `StrumTogetherPanel` makes for a real one (`QRCode.toDataURL`), on the same
   * reasoning: it is a string already in memory, not a file for `next/image` to fetch. Both
   * followers scan the same image, since they are following the same illustrative link.
   */
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(followUrl(DEMO_TOKEN))
      .then((dataUrl) => {
        if (!cancelled) setQr(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setQr(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const link = `strumfolio.com/follow/${DEMO_TOKEN}`

  return (
    <div className="strum-stage">
      <div className="strum-stage-row">
        <div className="strum-stage-device is-follower is-left">
          <PhoneFrame fitClassName="is-stage is-follower">
            <FollowerScreen side="left" qr={qr} />
          </PhoneFrame>
        </div>

        <div className="strum-stage-device is-leader">
          <PhoneFrame fitClassName="is-stage">
            <LeaderScreen qr={qr} link={link} />
          </PhoneFrame>
        </div>

        <div className="strum-stage-device is-follower is-right">
          <PhoneFrame fitClassName="is-stage is-follower">
            <FollowerScreen side="right" qr={qr} />
          </PhoneFrame>
        </div>
      </div>
    </div>
  )
}
