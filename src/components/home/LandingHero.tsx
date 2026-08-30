"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import posthog from "posthog-js";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import AppIconMark from "@/components/brand/AppIconMark";
import Wordmark from "@/components/brand/Wordmark";

const FEATURES = [
  {
    key: "same-device",
    label: "Same Device",
    detail: "Add multiple players and play together.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="11" width="16" height="9" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    ),
  },
  {
    key: "any-device",
    label: "Any Device",
    detail: "Invite friends to join from anywhere.",
    icon: (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/brand/icon-device.png" alt="" className="h-full w-full" />
    ),
  }
];

// The unauthenticated marketing landing page — rendered only when
// src/app/page.tsx finds no session, so unlike before this never needs to
// branch on a signed-in state or a "session still loading" flicker guard
// (the server already resolved that before choosing to render this).
export default function LandingHero() {
  const router = useRouter();

  return (
    <main className="relative mx-auto flex w-full max-w-5xl flex-col px-5 py-8 sm:px-8 sm:py-10 md:min-h-dvh md:justify-center md:px-10 md:py-12">
      <div className="flex items-center justify-between gap-3">
        <div className="hidden items-center gap-2 md:flex">
          <Chip
            icon={
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/brand/icon-users.png" alt="" className="h-full w-full" />
            }
            label="2–4 Players"
          />
          <Chip
            icon={
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/brand/icon-device.png" alt="" className="h-full w-full" />
            }
            label="Any Device"
          />
        </div>
        <Chip
          label="Sign in"
          icon={
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/brand/icon-google.png" alt="" className="h-full w-full" />
          }
          onClick={() => signIn("google")}
          className="ml-auto"
        />
      </div>

      <div className="mt-6 flex flex-col gap-8 md:mt-10 md:flex-row md:items-center md:gap-14 lg:gap-20">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-6 text-center md:items-start md:text-left lg:max-w-lg">
          <div className="flex items-center gap-2">
            <AppIconMark className="h-8 w-8" />
            <Wordmark className="text-2xl" />
          </div>

          <div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-ink sm:text-4xl md:text-5xl">
              Play Ludo
              <br />
              <span className="text-accent">Together, Anywhere</span>
            </h1>
            <p className="mt-2 max-w-[38ch] text-sm text-ink-muted sm:text-base">
              Play with friends and family on the same device or from anywhere.
            </p>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/hero-illustration.png"
            alt="Four players around a Ludo board"
            className="h-28 w-auto object-contain min-[390px]:h-36 md:hidden"
          />

          <div className="hidden w-full flex-col gap-3 md:flex">
            {FEATURES.map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent">
                  {f.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">{f.label}</p>
                  <p className="text-xs text-ink-muted">{f.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex w-full flex-col items-center gap-3 md:items-start">
            <Button
              className="w-full"
              onClick={() => {
                posthog.capture("play_now_clicked");
                router.push("/play");
              }}
            >
              <span className="flex w-full items-center justify-center gap-2 md:justify-start">
                Play Now
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              icon={
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/brand/icon-google.png" alt="" className="h-full w-full" />
              }
              subtitle="Sign in to save your players & stats"
              onClick={() => signIn("google")}
            >
              Continue with Google
            </Button>
            <div className="flex items-center gap-1.5 text-xs text-ink-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/icon-shield.png" alt="" className="h-4 w-4" />
              Secure · Fast · No spam
            </div>
          </div>

          {process.env.NODE_ENV !== "production" && (
            <Button variant="ghost" onClick={() => router.push("/test")}>
              Test mode
            </Button>
          )}
        </div>

        <div className="relative hidden shrink-0 md:flex md:w-[340px] md:justify-center lg:w-[420px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/hero-illustration.png"
            alt="Four players around a Ludo board"
            className="w-full max-w-[320px] object-contain lg:max-w-[380px]"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/star-yellow.png"
            alt=""
            aria-hidden
            className="absolute -left-2 top-4 h-7 w-7 opacity-90 lg:h-8 lg:w-8"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/cross-blue.png"
            alt=""
            aria-hidden
            className="absolute right-4 top-10 h-5 w-5 opacity-80"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/star-red.png"
            alt=""
            aria-hidden
            className="absolute bottom-8 right-0 h-6 w-6 opacity-80"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/cross-green.png"
            alt=""
            aria-hidden
            className="absolute bottom-2 left-4 h-5 w-5 opacity-80"
          />
        </div>
      </div>
    </main>
  );
}
