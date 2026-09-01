import type { Metadata, Viewport } from "next";
import "./globals.css";
import SocketProvider from "@/components/SocketProvider";
import AuthProvider from "@/components/AuthProvider";
import ThemeProvider from "@/components/ThemeProvider";
import CosmeticsProvider from "@/components/CosmeticsProvider";
import PosthogProvider from "@/components/PosthogProvider";
import RouteTracker from "@/components/RouteTracker";
import JsonLd from "@/components/seo/JsonLd";

// Runs before hydration so the `.dark` class (and thus every --color-* var)
// is correct on first paint — an effect in ThemeProvider would flash light
// then repaint dark. Defaults to light, matching ThemeProvider's default,
// only following the OS when the user has explicitly chosen "auto".
const NO_FLASH_THEME_SCRIPT = `(function(){try{var s=localStorage.getItem("ludo:theme");var m=s==="light"||s==="dark"||s==="auto"?s:"light";var d=m==="dark"||(m==="auto"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(d)r.classList.add("dark");r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

const SITE_URL = "https://www.myludo.life";
const SITE_NAME = "MyLudo";
const TITLE = "MyLudo — Play Ludo Online, No Install, No Ads";
const DESCRIPTION =
  "Create a room and play Ludo with 2–4 players across any mix of phones, tablets, and computers. No install required, no ads, ever — just a link and a game.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s | MyLudo",
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "ludo online",
    "play ludo with friends",
    "multiplayer ludo",
    "ludo game online",
    "ludo without ads",
    "cross device ludo",
    "online board games",
    "myludo",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

// maximumScale/userScalable previously disabled pinch-zoom site-wide, which
// fails WCAG 1.4.4 (reflow) for low-vision users — the game canvas has its
// own controls that don't need it, so there's no reason to block it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Required for env(safe-area-inset-*) to resolve to anything but 0 —
  // without it the body's bottom padding and AccountSheet's inset both
  // silently no-op. Matters most on the Android TWA build, which draws
  // edge-to-edge behind the system status/gesture bars.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf6ef" },
    { media: "(prefers-color-scheme: dark)", color: "#16130f" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
        <JsonLd />
      </head>
      <body
        className="min-h-dvh"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ThemeProvider>
          <CosmeticsProvider>
            <PosthogProvider>
              <RouteTracker />
              <AuthProvider>
                <SocketProvider>{children}</SocketProvider>
              </AuthProvider>
            </PosthogProvider>
          </CosmeticsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
