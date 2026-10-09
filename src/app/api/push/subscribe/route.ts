import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Body shape of PushSubscription.toJSON() from the browser's Push API.
type SubscriptionBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body: SubscriptionBody = await request.json();
  const { endpoint, keys } = body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userId: session.user.id,
      userAgent: request.headers.get("user-agent") ?? undefined,
    },
    update: {
      p256dh: keys.p256dh,
      auth: keys.auth,
      userId: session.user.id,
      lastSeenAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { endpoint }: { endpoint?: string } = await request.json();
  if (!endpoint) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });

  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: session.user.id } });

  return NextResponse.json({ ok: true });
}
