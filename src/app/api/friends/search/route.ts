import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Exact, case-insensitive email match only — no partial/prefix search — so
// this can't be used to enumerate the user directory, only to find someone
// whose email you already know.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase() || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.id === session.user.id) return NextResponse.json({ user: null });

  return NextResponse.json({ user: { userId: user.id, name: user.name, image: user.image } });
}
