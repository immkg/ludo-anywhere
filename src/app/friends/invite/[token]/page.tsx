import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AcceptInviteButton from "@/components/friends/AcceptInviteButton";

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

  if (!session?.user) {
    redirect(`/api/auth/signin?callbackUrl=/friends/invite/${token}`);
  }

  if (session.user.id === owner.id) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-ink-muted">That&rsquo;s your own invite link.</p>
        <Link href="/friends" className="text-sm font-semibold text-ink-muted underline">
          Go to friends
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="text-5xl">🎲</div>
      <p className="text-xl font-bold">Add {owner.name ?? "this player"} as a friend?</p>
      <AcceptInviteButton token={token} />
    </main>
  );
}
