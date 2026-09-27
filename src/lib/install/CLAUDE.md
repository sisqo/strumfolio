# Adding the app to the home screen

Loaded when working under `src/lib/install/`; `InstallPanel.tsx` and the inline script in `app/layout.tsx` are the other two places this governs.

The hamburger's "Add to home screen" row (`src/lib/install/`, `InstallPanel.tsx`) is one row
with two behaviours, and four facts about it are easy to break from far away:

- **It is absent inside the installed app**, and that is the first thing to check when it
  looks missing rather than the cache or the deploy: `display-mode: standalone` (and iOS'
  `navigator.standalone`) means the app is already there, so the row has nothing to do. `/app-settings` answers that question directly, in `DeviceLaunchCheck`'s own line:
  «opened from the Home Screen» or «in a browser tab».
- **Three surfaces say this out loud and must agree**: the row itself, `/help` §7, and the
  public FAQ answer on installing, which is now on `/` (`app/(home)/Landing.tsx`) rather than
  on `/login`. Change one and the other two are wrong — the same rule the booklet's own
  override already lives under.
- **`beforeinstallprompt` is captured by an inline script in `app/layout.tsx`**, not by a
  listener in an effect: it fires once, and on a warm cache it fires before React hydrates,
  so an effect misses it exactly on the fastest loads. Its `preventDefault()` is required —
  without it Chromium adds its own install infobar beside our row. That call now runs on
  every page, landing pages included, so **Chromium's automatic infobar is suppressed
  site-wide**; the browser's own ⋮ → "Install app" and the desktop omnibox icon still work.
- **A visitor still has no way to install, and that is now a decision rather than an
  absence.** `SiteHeader` (blog and tools) has a hamburger, `PublicNavMenu`, and `PublicHeader` has none;
  the row *could* go in the former and deliberately does not: installing is a
  gesture for somebody who has an account, not for somebody deciding whether to get one.
  Note what this costs, since it is invisible — `preventDefault()` on
  `beforeinstallprompt` runs site-wide (above), so a visitor gets neither our row nor
  Chromium's own infobar, and on iOS there is no infobar to get. Re-open the question by
  putting the row in the public menu, not by weakening that `preventDefault()`.
