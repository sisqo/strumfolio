/**
 * Whether an auto-scrolling page has reached its end.
 *
 * Its own module, and tested, because this is the question the reading loop got wrong
 * twice. Both times the loop asked it the easy way — «did the last nudge move anything?»
 * — and both times the answer was right for the wrong reason:
 *
 * - A song that fits the screen never moves, so *not moving* looked like the end of a
 *   song that had not even started. The reading page makes that exact: `.song-card`
 *   carries `min-height: calc(100dvh - 4.375rem)` under a 4rem header, so a short song
 *   leaves the page precisely one screen tall and unscrollable, never a pixel over.
 * - **Under browser zoom above 100% the page moves and still reads as still.** One CSS
 *   pixel is no longer one device pixel, so a 1px `scrollBy` shifts a fraction of a CSS
 *   pixel and `scrollY` read back rounds to the value it already had. Measured on a real
 *   reader's page at their zoom: `scrollBy(0, 5)` from 1084 landed on 1088 — four pixels
 *   for five asked, and at one pixel per frame the same rounding swallows the move
 *   whole. So the very first frame that wanted a pixel stopped the song, on a page with
 *   1679 of them left to scroll.
 *
 * Hence position, never movement: the end is where we *are*, which no rounding can
 * disagree about by more than a pixel or two.
 */

/**
 * How close to the last scrollable pixel still counts as the end.
 *
 * `scrollHeight` and `clientHeight` are both integers rounded from a fractional layout,
 * so the room they describe can be off by about a pixel either way — and under zoom the
 * furthest `scrollY` the browser will actually report can sit just short of it. Two
 * pixels of slack is enough to cover both roundings and is invisible in a song: stopping
 * a hair early costs nothing, while never recognising the end would hold the wake lock
 * and leave the button lit for a scroll that cannot advance.
 */
export const END_SLACK = 2

/**
 * True when the page is at its end, false when it is mid-song **or has no end at all**.
 *
 * The `room > 0` half is not a special case bolted on: a page that cannot scroll has no
 * end to be at, and answering `true` for it is what used to stop a short song the instant
 * play was pressed. The caller keeps playing in that case, wake lock included — a song
 * that fits the screen is still a song someone is reading from.
 */
export function atScrollEnd(scrollY: number, scrollHeight: number, clientHeight: number): boolean {
  const room = scrollHeight - clientHeight
  return room > 0 && scrollY >= room - END_SLACK
}
