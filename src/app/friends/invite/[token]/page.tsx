import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AcceptInviteButton from "@/components/friends/AcceptInviteButton";

// Deliberately never redirect()s an unauthenticated visitor away from this
// page — it used to, before rendering anything, which meant a shared
// link's preview card (WhatsApp/Twitter/etc. crawlers, which don't carry a
// session cookie) either followed the redirect into a bare sign-in page or
// got nothing useful. Now the branded content always renders; only the
// call-to-action changes based on session.
export default async function InviteLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth();

  const owner = await prisma.user.findUnique({ where: { inviteToken: token } });

  if (!owner) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-ink-muted">That invite link is invalid.</p>
        <Link href="/" className="text-sm font-semibold text-ink-muted underline">
          Home
        </Link>
      </main>
    );
  }

  if (session?.user && session.user.id === owner.id) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-ink-muted">That&rsquo;s your own invite link.</p>
        <Link href="/friends" className="text-sm font-semibold text-ink-muted underline">
          Go to friends
        </Link>
      </main>
    );
  }

  const referralCampaign = await prisma.campaign.findUnique({ where: { key: "referral" } });
  const pct = referralCampaign?.active ? referralCampaign.discountPercent : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="text-5xl">🎲</div>
      <p className="text-xl font-bold">
        {owner.name ?? "A friend"} invited you to play Ludo on MyLudo
        {pct ? ` — sign up and you both get ${pct}% off` : ""}
      </p>
      {session?.user ? (
        <AcceptInviteButton token={token} />
      ) : (
        <Link
          href={`/api/auth/signin?callbackUrl=/friends/invite/${token}`}
          className="flex min-h-12 items-center justify-center rounded-2xl bg-accent px-5 text-base font-semibold text-white"
        >
          Sign up to accept
        </Link>
      )}
    </main>
  );
}
