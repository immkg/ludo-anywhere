"use client";

import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="p-6 flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Ludo Multiplayer 🎲</h1>

      <button
        className="bg-blue-500 text-white p-2 rounded"
        onClick={() => router.push("/lobby")}
      >
        Create Room
      </button>

      <button
        className="bg-green-500 text-white p-2 rounded"
        onClick={() => router.push("/join")}
      >
        Join Room
      </button>
    </main>
  );
}