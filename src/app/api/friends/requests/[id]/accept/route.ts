import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const friendship = await prisma.friendship.findUnique({ where: { id } });
  if (!friendship || friendship.addresseeId !== session.user.id) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (friendship.status === "accepted") return NextResponse.json({ ok: true });

  const updated = await prisma.friendship.update({
    where: { id },
    data: { status: "accepted", respondedAt: new Date() },
    include: { requester: true },
  });

  sendPushToUser(updated.requester.id, {
    title: "Friend request accepted",
    body: `${session.user.name ?? session.user.email ?? "Someone"} accepted your friend request`,
    url: "/friends",
    tag: `friend-request-accepted-${friendship.id}`,
  }).catch((err) => console.error("Push send failed (friend request accepted):", err));

  return NextResponse.json({
    friend: {
      userId: updated.requester.id,
      name: updated.requester.name,
      email: updated.requester.email,
      image: updated.requester.image,
      lastSeenAt: updated.requester.lastSeenAt,
    },
  });
}
