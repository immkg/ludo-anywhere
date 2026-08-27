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

// Renames a profile in this device-login's roster. Email is immutable here —
// it's the identity key profiles are shared/looked-up by (see the upsert in
// the POST handler), so changing it would either collide with another
// profile or silently fork the identity.
export async function PATCH(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { profileId } = await params;

  const link = await prisma.userProfile.findUnique({
    where: { userId_profileId: { userId: session.user.id, profileId } },
  });
  if (!link) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 20) : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const profile = await prisma.playerProfile.update({
    where: { id: profileId },
    data: { name },
  });

  return NextResponse.json({ profile: { id: profile.id, name: profile.name, email: profile.email } });
}
