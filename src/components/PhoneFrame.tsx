/**
 * A phone, drawn rather than photographed: the milled band, the black rim inside it,
 * the island, the status bar and the home indicator — and, in the screen, whatever the
 * caller stands there.
 *
 * `/login` puts two of these side by side with the copy that explains them
 * (`EditorPhone`, `ReaderPhone`), and the reason it is a drawing rather than a
 * screenshot is the same reason `EditorDemo` is: what goes in the screen is the app's
 * own markup and the app's own classes, so it cannot fall out of date. The frame is the
 * only part of either band that is a picture of a thing, and it is the only part that
 * has nothing to do with the product.
 *
 * The screen is 360×720 — the size the design mock's own device is, and a real phone's
 * viewport — and everything inside it is laid out at that width. What that costs is
 * documented where it bites: a rule keyed to the *viewport* rather than to this box
 * resolves against the browser window, not against the phone, which is why the reading
 * demo draws its own bar instead of borrowing `.control-*` (see `.rd-bar`).
 *
 * Nothing here is announced: the chrome is `aria-hidden`, and each screen carries its
 * own single `role="img"` and label for what it is showing.
 *
 * `fitClassName` adds a modifier alongside `.phone-fit`'s own — its only caller is
 * `StrumTogetherStage`, which stands two or three of these side by side and so cannot
 * take `.phone-fit`'s solo-phone scale breakpoints (tuned for one phone filling the
 * column). `.phone-fit.is-stage` in globals.css outguns the bare selector on
 * specificity alone, which is what lets a second scale schedule coexist with the
 * first without touching it.
 */
export function PhoneFrame({
  children,
  fitClassName,
}: {
  children: React.ReactNode
  fitClassName?: string
}) {
  return (
    <div className={fitClassName === undefined ? 'phone-fit' : `phone-fit ${fitClassName}`}>
      <div className="phone-frame">
        {/* Volume rocker, mute switch and the side button — the four notches that read
            as a phone rather than as a rounded rectangle. */}
        <span className="phone-key is-mute" aria-hidden />
        <span className="phone-key is-up" aria-hidden />
        <span className="phone-key is-down" aria-hidden />
        <span className="phone-key is-side" aria-hidden />

        <div className="phone-rim">
          <div className="phone-device">
            <span className="phone-island" aria-hidden />

            <div className="phone-status" aria-hidden>
              <span className="phone-status-half">
                <span className="phone-clock">9:41</span>
              </span>

              <span className="phone-status-half">
                <svg width="19" height="12" viewBox="0 0 19 12" aria-hidden>
                  <rect x="0" y="7.5" width="3.2" height="4.5" rx="0.7" fill="currentColor" />
                  <rect x="4.8" y="5" width="3.2" height="7" rx="0.7" fill="currentColor" />
                  <rect x="9.6" y="2.5" width="3.2" height="9.5" rx="0.7" fill="currentColor" />
                  <rect x="14.4" y="0" width="3.2" height="12" rx="0.7" fill="currentColor" />
                </svg>

                <svg width="17" height="12" viewBox="0 0 17 12" aria-hidden>
                  <path
                    d="M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z"
                    fill="currentColor"
                  />
                  <path
                    d="M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z"
                    fill="currentColor"
                  />
                  <circle cx="8.5" cy="10.5" r="1.5" fill="currentColor" />
                </svg>

                <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden>
                  <rect
                    x="0.5"
                    y="0.5"
                    width="23"
                    height="12"
                    rx="3.5"
                    stroke="currentColor"
                    strokeOpacity="0.35"
                    fill="none"
                  />
                  <rect x="2" y="2" width="20" height="9" rx="2" fill="currentColor" />
                  <path
                    d="M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z"
                    fill="currentColor"
                    fillOpacity="0.4"
                  />
                </svg>
              </span>
            </div>

            <div className="phone-screen">{children}</div>

            <span className="phone-home" aria-hidden />
          </div>

          {/* The two passes of glass over the whole face: a diagonal sheen, then the
              hairline and the vignette that stop the screen from looking pasted on. */}
          <span className="phone-gloss" aria-hidden />
          <span className="phone-edge" aria-hidden />
        </div>
      </div>
    </div>
  )
}
