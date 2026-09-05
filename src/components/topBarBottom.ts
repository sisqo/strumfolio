/**
 * How far down the viewport `TopBar` reaches. It is sticky, so anything measuring what the
 * screen actually shows — the drag of a row, which scrolls the page when the pointer nears
 * an edge — has to count the strip under it as hidden rather than as the top of the list.
 */
export function topBarBottom(): number {
  return document.querySelector('.top-bar')?.getBoundingClientRect().bottom ?? 0
}
