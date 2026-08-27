import type { Metadata, Viewport } from "next";
import "./globals.css";
import SocketProvider from "@/components/SocketProvider";
import AuthProvider from "@/components/AuthProvider";

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
    <html lang="en">
      <body className="min-h-dvh" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <AuthProvider>
          <SocketProvider>{children}</SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
