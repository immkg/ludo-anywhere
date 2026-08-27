"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Button from "@/components/ui/Button";
import AccountBar from "@/components/auth/AccountBar";

export default function HomePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const signedIn = !!session?.user;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-10 px-6 py-10">
      <div className="text-center">
        <div className="text-6xl">🎲</div>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Ludo</h1>
        <p className="mt-2 text-ink-muted">
          Create a room or join one with a code. 2 to 4 players, any mix of devices.
        </p>
      </div>

      <AccountBar />

      {signedIn && (
        <div className="flex flex-col gap-3">
          <Button onClick={() => router.push("/create")}>Create room</Button>
          <Button variant="secondary" onClick={() => router.push("/join")}>
            Join room
          </Button>
        </div>
      )}

      {!signedIn && status !== "loading" && (
        <p className="text-center text-sm text-ink-muted">
          Sign in with Google to create or join a room.
        </p>
      )}

      {process.env.NODE_ENV !== "production" && (
        <Button variant="ghost" onClick={() => router.push("/test")}>
          Test mode
        </Button>
      )}
    </main>
  );
}
