import type { Metadata, Viewport } from "next";
import "./globals.css";
import SocketProvider from "@/components/SocketProvider";
import AuthProvider from "@/components/AuthProvider";

export const metadata: Metadata = {
  title: "Ludo Multiplayer",
  description: "Create a room or join one and play Ludo with friends, on any device.",
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
