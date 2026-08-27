import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Accepted friends on either side of the relation. `online` is intentionally
// left out here — presence only ever lives in the socket layer (see
// src/server/presence.js), never in this REST route's module graph.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const rows = await prisma.friendship.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: session.user.id }, { addresseeId: session.user.id }],
    },
    include: { requester: true, addressee: true },
  });

  const friends = rows.map((row) => {
    const friend = row.requesterId === session.user.id ? row.addressee : row.requester;
    return {
      friendshipId: row.id,
      userId: friend.id,
      name: friend.name,
      email: friend.email,
      image: friend.image,
      lastSeenAt: friend.lastSeenAt,
    };
  });

  return NextResponse.json({ friends });
}
