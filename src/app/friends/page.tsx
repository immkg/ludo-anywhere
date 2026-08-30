import { auth } from "@/lib/auth";
import { getPendingRequestCount, getDisplayName } from "@/lib/nav-data";
import AuthenticatedNav from "@/components/nav/AuthenticatedNav";
import GuestNav from "@/components/nav/GuestNav";
import SignInTeaser from "@/components/nav/SignInTeaser";
import FriendsPageClient from "@/components/friends/FriendsPageClient";

export default async function FriendsPage() {
  const session = await auth();
  if (!session?.user) {
    return (
      <GuestNav>
        <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-4 pb-10 pt-6 sm:gap-7 sm:px-6 sm:pt-8 lg:px-10 lg:pt-10">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Friends</h1>
            <p className="mt-1 text-sm text-ink-muted sm:text-base">Play with people you know.</p>
          </div>
          <SignInTeaser
            title="Play with friends"
            subtitle="Sign in to add friends, see who's online, and invite them straight into your games."
            source="friends"
          />
        </main>
      </GuestNav>
    );
  }

  const pendingRequestCount = await getPendingRequestCount(session.user.id);

  return (
    <AuthenticatedNav
      displayName={getDisplayName(session.user)}
      email={session.user.email ?? null}
      userImage={session.user.image ?? null}
      pendingRequestCount={pendingRequestCount}
    >
      <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-4 pb-10 pt-6 sm:gap-7 sm:px-6 sm:pt-8 lg:px-10 lg:pt-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Friends</h1>
            <p className="mt-1 text-sm text-ink-muted sm:text-base">Play with people you know.</p>
          </div>
          {/* Decorative only — sized in %, so it scales down cleanly on
              mobile instead of needing separate offsets per breakpoint,
              and never grows tall enough to push content below the fold. */}
          <div
            className="relative h-14 w-20 shrink-0 sm:h-16 sm:w-24 md:h-20 md:w-28 lg:h-24 lg:w-32"
            aria-hidden
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/pawn-red.png"
              alt=""
              className="absolute left-0 top-[14%] h-[45%] w-[45%] -rotate-6 object-contain"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/pawn-green.png"
              alt=""
              className="absolute left-[30%] top-0 h-[55%] w-[55%] rotate-3 object-contain"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/pawn-blue.png"
              alt=""
              className="absolute left-[58%] top-[16%] h-[45%] w-[45%] rotate-12 object-contain"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/dice.png"
              alt=""
              className="absolute left-[32%] top-[48%] h-[38%] w-[38%] -rotate-12 object-contain"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/star-yellow.png" alt="" className="absolute left-[6%] top-0 h-[14%] w-[14%] object-contain" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/star-blue.png" alt="" className="absolute right-[2%] top-[26%] h-[14%] w-[14%] object-contain" />
          </div>
        </div>
        <FriendsPageClient />
      </main>
    </AuthenticatedNav>
  );
}
