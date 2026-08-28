"use client";

import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import AccountBar from "@/components/auth/AccountBar";
import AppIconMark from "@/components/brand/AppIconMark";
import Wordmark from "@/components/brand/Wordmark";

export default function HomePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const signedIn = !!session?.user;
  const resolved = status !== "loading";

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-sm flex-col gap-8 px-6 py-10">
      {!signedIn && resolved && (
        <Chip
          label="Sign in"
          icon={
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/brand/icon-google.png" alt="" className="h-full w-full" />
          }
          onClick={() => signIn("google")}
          className="absolute right-6 top-6"
        />
      )}

      <div className="mt-6 flex flex-col items-center text-center">
        <AppIconMark className="h-16 w-16" />
        <div className="mt-3">
          <Wordmark />
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          One table. Any number of phones.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/hero-illustration.png"
          alt="Four players around a Ludo board"
          className="mt-6 hidden w-full max-w-[280px] [@media(min-height:680px)]:block"
        />
      </div>

      {signedIn && (
        <div className="flex flex-col gap-3">
          <Button
            icon={
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/brand/icon-users.png" alt="" className="h-full w-full" />
            }
            subtitle="Set up a room and invite others"
            onClick={() => router.push("/create")}
          >
            Create Room
          </Button>
          <Button
            variant="secondary"
            icon={
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/brand/icon-join.png" alt="" className="h-full w-full" />
            }
            subtitle="Enter a room code to join"
            onClick={() => router.push("/join")}
          >
            Join Room
          </Button>
        </div>
      )}

      {!signedIn && resolved && (
        <Button
          variant="secondary"
          icon={
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/brand/icon-google.png" alt="" className="h-full w-full" />
          }
          subtitle="Sign in to save your players & stats"
          onClick={() => signIn("google")}
        >
          Continue with Google
        </Button>
      )}

      {signedIn && <AccountBar />}

      {process.env.NODE_ENV !== "production" && (
        <Button variant="ghost" onClick={() => router.push("/test")}>
          Test mode
        </Button>
      )}
    </main>
  );
}
