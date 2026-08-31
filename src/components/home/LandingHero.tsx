"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import posthog from "posthog-js";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import AppIconMark from "@/components/brand/AppIconMark";
import Wordmark from "@/components/brand/Wordmark";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { IconChat } from "@/components/friends/icons";
import { shareWithImage } from "@/lib/share";
import { trackShare } from "@/lib/socketActions";

const FEATURES = [
  {
    key: "same-device",
    label: "Same Device",
    detail: "Add multiple players and play together.",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
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
  },
];

const PRODUCT_FACTS = [
  { label: "Browser-based", detail: "Nothing to install, on any device." },
  { label: "2–4 players", detail: "Every room supports up to four players." },
  {
    label: "Any mix of devices",
    detail: "Share one screen, join separately, or both at once.",
  },
  {
    label: "No ads, ever",
    detail: "The only paid parts are optional Game Packs and subscriptions.",
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    title: "Create a room",
    detail: "Start a room for 2 to 4 players — no sign-in needed.",
  },
  {
    title: "Share the code or link",
    detail: "Every room gets a short code and a link to send around.",
  },
  {
    title: "Friends join from their own device",
    detail: "Phone, tablet, or computer — whatever they've got.",
  },
  { title: "Play", detail: "Roll, move, and race your tokens home." },
];

const MINI_FAQ = [
  {
    question: "Does MyLudo have ads?",
    answer: "No. MyLudo has no ads and never will.",
  },
  {
    question: "Do I need an account?",
    answer: "No — you can create or join a room as a guest.",
  },
  {
    question: "Can players join from different devices?",
    answer:
      "Yes, any mix of same-device and separate-device players can share one room.",
  },
];

// The unauthenticated marketing landing page — rendered only when
// src/app/page.tsx finds no session, so unlike before this never needs to
// branch on a signed-in state or a "session still loading" flicker guard
// (the server already resolved that before choosing to render this).
export default function LandingHero() {
  const router = useRouter();

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 sm:px-8 md:px-10">
        <div className="flex flex-col py-8 sm:py-10 md:min-h-dvh md:justify-center md:py-12">
          <div className="flex items-center justify-between gap-3">
            <div className="hidden items-center gap-2 md:flex">
              <Chip
                icon={
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src="/brand/icon-users.png"
                    alt=""
                    className="h-full w-full"
                  />
                }
                label="2–4 Players"
              />
              <Chip
                icon={
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src="/brand/icon-device.png"
                    alt=""
                    className="h-full w-full"
                  />
                }
                label="Any Device"
              />
            </div>
            <Chip
              label="Share MyLudo"
              icon={<IconChat className="h-full w-full" />}
              onClick={() => {
                // Guest — no personal referral link exists yet, so this
                // just shares the plain app link (same as GuestNav's
                // ShareInviteButton once useInviteLink's 401 fallback
                // kicks in), but there's no session here to even attempt
                // that fetch against, so it's simpler to build it directly.
                const url = window.location.origin;
                trackShare("invite_link_shared", { source: "landing_nav" });
                shareWithImage(`Play Ludo with me on MyLudo! ${url}`, `${url}/opengraph-image`);
              }}
              className="ml-auto"
            />
            <Chip
              label="Sign in"
              icon={
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/brand/icon-google.png"
                  alt=""
                  className="h-full w-full"
                />
              }
              onClick={() => signIn("google")}
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
                  Play with friends and family — on the same device or from
                  anywhere, no install required, no ads.
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
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  icon={
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src="/brand/icon-google.png"
                      alt=""
                      className="h-full w-full"
                    />
                  }
                  subtitle="Sign in to save your players & stats"
                  onClick={() => signIn("google")}
                >
                  Continue with Google
                </Button>
                <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/brand/icon-shield.png"
                    alt=""
                    className="h-4 w-4"
                  />
                  Secure · Fast · No ads
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
        </div>

        <section className="mt-16 border-t border-line py-12 sm:mt-20 sm:py-16">
          <h2 className="text-center text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
            Why people play MyLudo
          </h2>
          <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
            {PRODUCT_FACTS.map((fact) => (
              <div
                key={fact.label}
                className="rounded-2xl border border-line bg-surface p-4"
              >
                <h3 className="text-sm font-bold text-ink">{fact.label}</h3>
                <p className="mt-1 text-xs text-ink-muted">{fact.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-line py-12 sm:py-16">
          <h2 className="text-center text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
            How it works
          </h2>
          <ol className="mx-auto mt-8 flex max-w-3xl flex-col gap-3">
            {HOW_IT_WORKS_STEPS.map((step, index) => (
              <li
                key={step.title}
                className="flex gap-4 rounded-2xl border border-line bg-surface p-4"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-accent">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-ink">{step.title}</h3>
                  <p className="mt-1 text-sm text-ink-muted">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-center text-sm text-ink-muted">
            <Link href="/how-to-play" className="text-accent hover:underline">
              Full walkthrough
            </Link>{" "}
            &middot;{" "}
            <Link
              href="/cross-device-ludo"
              className="text-accent hover:underline"
            >
              playing across devices
            </Link>
          </p>
        </section>

        <section className="border-t border-line py-12 sm:py-16">
          <h2 className="text-center text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
            Questions
          </h2>
          <dl className="mx-auto mt-8 flex max-w-3xl flex-col gap-3">
            {MINI_FAQ.map((faq) => (
              <div
                key={faq.question}
                className="rounded-2xl border border-line bg-surface p-4"
              >
                <dt className="text-sm font-bold text-ink">{faq.question}</dt>
                <dd className="mt-1 text-sm text-ink-muted">{faq.answer}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-center text-sm text-ink-muted">
            <Link href="/faq" className="text-accent hover:underline">
              See the full FAQ
            </Link>
          </p>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
