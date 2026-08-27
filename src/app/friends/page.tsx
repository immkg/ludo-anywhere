import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import FriendsPageClient from "@/components/friends/FriendsPageClient";

export default async function FriendsPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Friends</h1>
        <Link href="/" className="text-sm font-semibold text-ink-muted underline">
          Home
        </Link>
      </div>
      <FriendsPageClient />
    </main>
  );
}
