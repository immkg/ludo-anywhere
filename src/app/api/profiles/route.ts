import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const links = await prisma.userProfile.findMany({
    where: { userId: session.user.id },
    include: { profile: true },
    orderBy: { profile: { name: "asc" } },
  });

  return NextResponse.json({
    profiles: links.map((l) => ({ id: l.profile.id, name: l.profile.name, email: l.profile.email })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 20) : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  // Reusing an existing profile (same email, e.g. a family member already
  // added from another device) intentionally keeps the existing name rather
  // than overwriting it with whatever this device typed.
  const profile = await prisma.playerProfile.upsert({
    where: { email },
    update: {},
    create: { name, email },
  });

  await prisma.userProfile.upsert({
    where: { userId_profileId: { userId: session.user.id, profileId: profile.id } },
    update: {},
    create: { userId: session.user.id, profileId: profile.id },
  });

  return NextResponse.json({ profile: { id: profile.id, name: profile.name, email: profile.email } });
}
