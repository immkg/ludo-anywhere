"use client";

import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-10 px-6 py-10">
      <div className="text-center">
        <div className="text-6xl">🎲</div>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Ludo</h1>
        <p className="mt-2 text-ink-muted">
          Create a room or join one with a code. 2 to 4 players, any mix of devices.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Button onClick={() => router.push("/create")}>Create room</Button>
        <Button variant="secondary" onClick={() => router.push("/join")}>
          Join room
        </Button>
      </div>
    </main>
  );
}
