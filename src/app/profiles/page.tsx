import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import ProfileManager from "@/components/lobby/ProfileManager";

export default async function ProfilesPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Manage players</h1>
        <Link href="/" className="text-sm font-semibold text-ink-muted underline">
          Home
        </Link>
      </div>
      <p className="text-ink-muted">
        Players added here are shared by email — the same player picked from
        any signed-in device counts as the same person for history and the
        leaderboard.
      </p>
      <ProfileManager />
    </main>
  );
}
