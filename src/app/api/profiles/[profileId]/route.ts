import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Removes the profile from this device-login's own roster only — the
// underlying PlayerProfile (and its history) isn't deleted, since other
// device-logins may still reference the same profile by email.
export async function DELETE(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { profileId } = await params;

  const profile = await prisma.playerProfile.findUnique({ where: { id: profileId } });
  if (profile?.email === session.user.email?.toLowerCase()) {
    return NextResponse.json({ error: "You can't remove your own profile" }, { status: 400 });
  }

  await prisma.userProfile.deleteMany({ where: { userId: session.user.id, profileId } });

  return NextResponse.json({ ok: true });
}
