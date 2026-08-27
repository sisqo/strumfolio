import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist_Mono, Outfit } from 'next/font/google'

import { OfflineSync } from '@/components/OfflineSync'
import { RoleProvider } from '@/components/RoleProvider'
import { StrumTogetherProvider } from '@/components/StrumTogetherProvider'
import { APP_NAME, APP_PAYOFF, SITE_URL } from '@/lib/brand'
import { LAUNCH_SCREENS, launchMedia, launchUrl } from '@/lib/launchScreens'
import { STATUS_BAR_ID, THEME_KEY } from '@/lib/theme'

import './globals.css'

/*
 * Outfit reads the app, Geist Mono reads the ChordPro.
 *
 * The variables are named for the job rather than the typeface, because the sheet
 * and the editor both depend on the app font being one thing: the editor positions
 * chords by measuring a hidden copy of the words, so the copy and the input have to
 * be set in the same family, and a name like `--font-sans` is the thing they share.
 *
 * No `axes` option here, unlike the DM Sans this replaced: Outfit's variable font
 * ships weight only, with no optical-size axis to ask for by name.
 */
const sans = Outfit({
  variable: '--font-sans',
  subsets: ['latin'],
})

const mono = Geist_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  /**
   * Lets every relative URL in this app's metadata (the OG/Twitter images below,
   * and any page that adds its own) resolve against the real domain instead of
   * `localhost` in development — Next.js otherwise warns at build and would ship
   * a broken image URL in production. Safe to hardcode: unlike `AUTH_URL`, nothing
   * here depends on which domain actually served the request.
   */
  metadataBase: new URL(`https://${SITE_URL}`),
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: `${APP_PAYOFF}. Lyrics and chords for your repertoire, with transposition, notation and auto-scroll.`,
  applicationName: APP_NAME,
  openGraph: {
    title: APP_NAME,
    description: APP_PAYOFF,
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/brand/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: APP_NAME,
    description: APP_PAYOFF,
    images: ['/brand/og-image.png'],
  },
  /**
   * Declared rather than left to convention.
   *
   * `/favicon.ico` would be found by guesswork anyway, but only the tags say which
   * size is which — and iOS picks the touch icon from the tag first, not from its
   * own implicit `/apple-touch-icon.png` root probe, which is why that file can
   * live under `/brand/icons/` instead of at the root without breaking iOS. The
   * SVG is listed first since browsers that support it prefer it over the `.ico`
   * regardless of order, per the brand asset drop's own `head-snippet.html`. All
   * of `public/brand/` is exempted from the session guard in `middleware.ts`,
   * which is what lets the install prompt show an icon on a locked app.
   */
  icons: {
    icon: [
      { url: '/brand/icons/favicon.svg', type: 'image/svg+xml' },
      { url: '/brand/icons/icon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/brand/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: [{ url: '/brand/icons/apple-touch-icon.png', sizes: '180x180' }],
  },

  /**
   * The launch screen iOS paints while the web view boots, once this app has been added to the
   * Home Screen — the blank that `manifest.ts`' `background_color` fills on Android and cannot
   * fill here. Not a splash added in front of the launch: it is shown during a boot that was
   * happening anyway, so it costs nothing but the bytes.
   *
   * `capable` is what puts it in standalone in the first place, and `statusBarStyle` is
   * `black-translucent` so the launch image runs under the status bar rather than stopping short
   * of it with a bar of another colour above it.
   *
   * Generated from, and matched against, one list — see `src/lib/launchScreens.ts` on why the
   * images and these tags must not be two lists, and on what portrait-only leaves uncovered.
   */
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: 'black-translucent',
    startupImage: LAUNCH_SCREENS.map((screen) => ({ url: launchUrl(screen), media: launchMedia(screen) })),
  },
}

/**
 * Puts the reader's theme on the page before anything is painted.
 *
 * Inline and synchronous, as the first thing in the body: it cannot come from the
 * bundle, because by the time the bundle runs the page has already been painted in
 * the wrong theme and the reader has seen it flash. These pages are statically
 * generated and served from a precache, so there is no server render that could
 * know the answer either — this script is the only place it can be applied in time.
 *
 * Twin of `showThemeChoice` in lib/theme.ts, which does the same on a change and
 * carries the explanation of why the attribute is removed rather than set to
 * "auto". The key and the id are imported so at least those two strings cannot
 * drift.
 *
 * Every screen follows the reader's own stored choice now, `/login` included:
 * see `PLAN.md`/git history for the version that forced it light regardless — that
 * was a stand-in for a switch this page had no way to reach, and it stopped being
 * necessary the day `ThemeToggle` gave every screen one.
 */
const themeScript = `try{var c=localStorage.getItem('${THEME_KEY}');if(c==='light'||c==='dark'){var r=document.documentElement;r.dataset.theme=c;var b=getComputedStyle(r).getPropertyValue('--bg').trim();if(b){var m=document.createElement('meta');m.id='${STATUS_BAR_ID}';m.name='theme-color';m.content=b;document.head.prepend(m)}}}catch(e){}`

export const viewport: Viewport = {
  // No maximumScale or user-scalable: pinch zoom is an accessibility escape
  // hatch and the font stepper is not a substitute for it.
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f5f2' },
    { media: '(prefers-color-scheme: dark)', color: '#101216' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />

        {/*
          * Here rather than in each page: one answer about who is looking, asked once and
          * kept across navigations. It gates what the screens offer, never what the server
          * allows — see RoleProvider.
          *
          * StrumTogetherProvider nests inside it for the same reason RoleProvider itself sits
          * here rather than lower: its two consumers, the menu and the reading bar, share
          * no closer ancestor than this — see its own comment.
          */}
        <RoleProvider>
          <StrumTogetherProvider>{children}</StrumTogetherProvider>
        </RoleProvider>
        {/*
          * Silent and stateless from the outside — see OfflineSync's own doc comment.
          * Mounted once here rather than per-page so a client-side navigation between
          * songs does not restart it.
          */}
        <OfflineSync />
        <Analytics />
      </body>
    </html>
  )
}
