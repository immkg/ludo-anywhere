import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPendingRequestCount, getDisplayName } from "@/lib/nav-data";
import AuthenticatedNav from "@/components/nav/AuthenticatedNav";
import ProfileManager from "@/components/lobby/ProfileManager";

export default async function ProfilesPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const pendingRequestCount = await getPendingRequestCount(session.user.id);

  return (
    <AuthenticatedNav
      displayName={getDisplayName(session.user)}
      email={session.user.email ?? null}
      userImage={session.user.image ?? null}
      pendingRequestCount={pendingRequestCount}
    >
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold">Players</h1>
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
    </AuthenticatedNav>
  );
}
