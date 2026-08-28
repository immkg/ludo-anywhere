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
      <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 pb-10 pt-6 sm:gap-7 sm:px-6 sm:pt-8 lg:px-10 lg:pt-10">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Players</h1>
          <p className="mt-1 text-sm text-ink-muted sm:text-base">
            People who play from your devices.
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Players are shared by email, so the same person keeps their history
            and leaderboard stats wherever they play.
          </p>
        </div>
        <ProfileManager />
      </main>
    </AuthenticatedNav>
  );
}
