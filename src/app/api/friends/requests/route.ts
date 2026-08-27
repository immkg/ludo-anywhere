import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const [incoming, outgoing] = await Promise.all([
    prisma.friendship.findMany({
      where: { addresseeId: session.user.id, status: "pending" },
      include: { requester: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.friendship.findMany({
      where: { requesterId: session.user.id, status: "pending" },
      include: { addressee: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    incoming: incoming.map((r) => ({
      id: r.id,
      userId: r.requester.id,
      name: r.requester.name,
      email: r.requester.email,
      image: r.requester.image,
    })),
    outgoing: outgoing.map((r) => ({
      id: r.id,
      userId: r.addressee.id,
      name: r.addressee.name,
      email: r.addressee.email,
      image: r.addressee.image,
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const addresseeId = typeof body?.addresseeId === "string" ? body.addresseeId : "";
  if (!addresseeId) return NextResponse.json({ error: "Missing addresseeId" }, { status: 400 });
  if (addresseeId === session.user.id) {
    return NextResponse.json({ error: "You can't friend yourself" }, { status: 400 });
  }

  const addressee = await prisma.user.findUnique({ where: { id: addresseeId } });
  if (!addressee) return NextResponse.json({ error: "That player couldn't be found" }, { status: 404 });

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: session.user.id, addresseeId },
        { requesterId: addresseeId, addresseeId: session.user.id },
      ],
    },
  });
  if (existing?.status === "accepted") {
    return NextResponse.json({ error: "You're already friends" }, { status: 400 });
  }
  if (existing?.status === "pending") {
    return NextResponse.json({ error: "A request is already pending" }, { status: 400 });
  }

  const friendship = await prisma.friendship.create({
    data: { requesterId: session.user.id, addresseeId },
  });

  return NextResponse.json({ requestId: friendship.id });
}
