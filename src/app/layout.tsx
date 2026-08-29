import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import SocketProvider from "@/components/SocketProvider";
import AuthProvider from "@/components/AuthProvider";
import ThemeProvider from "@/components/ThemeProvider";

// Runs before hydration so the `.dark` class (and thus every --color-* var)
// is correct on first paint — an effect in ThemeProvider would flash light
// then repaint dark. Defaults to light, matching ThemeProvider's default,
// only following the OS when the user has explicitly chosen "auto".
const NO_FLASH_THEME_SCRIPT = `(function(){try{var s=localStorage.getItem("ludo:theme");var m=s==="light"||s==="dark"||s==="auto"?s:"light";var d=m==="dark"||(m==="auto"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(d)r.classList.add("dark");r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

// Traffic-source analytics (Umami Cloud, myludo.life site). The website id
// isn't a secret — it's already visible in every page's HTML — so it's
// hardcoded rather than threaded through an env var. Gated to production so
// `npm run dev` traffic doesn't pollute real visitor stats.
const UMAMI_WEBSITE_ID = "524c74cf-e122-4629-a2a3-a9c75790f6f8";

const SITE_URL = "https://www.myludo.life";
const SITE_NAME = "MyLudo";
const DESCRIPTION =
  "Play Ludo online with friends and family. Create a room or join one with a code — 2 to 4 players, any mix of devices, no app to install.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "MyLudo — Play Ludo Online with Friends",
    template: "%s | MyLudo",
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "ludo online",
    "play ludo with friends",
    "multiplayer ludo",
    "ludo game online",
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
    title: "MyLudo — Play Ludo Online with Friends",
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "MyLudo — Play Ludo Online with Friends",
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf6ef" },
    { media: "(prefers-color-scheme: dark)", color: "#16130f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {process.env.NODE_ENV === "production" && (
          <Script
            src="https://cloud.umami.is/script.js"
            data-website-id={UMAMI_WEBSITE_ID}
            strategy="afterInteractive"
          />
        )}
        <ThemeProvider>
          <AuthProvider>
            <SocketProvider>{children}</SocketProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
