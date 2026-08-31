import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_CONTEXTS = ["GAME_FINISHED", "LEFT_EARLY", "GENERAL"];

// Open to guests too (userId is optional on Feedback) — a guest's opinion
// of the game is just as useful as a signed-in player's.
export async function POST(request: Request) {
  const session = await auth();

  const body = await request.json().catch(() => null);
  const context = body?.context;
  if (!VALID_CONTEXTS.includes(context)) {
    return NextResponse.json({ error: "Invalid context" }, { status: 400 });
  }
  const rating = typeof body?.rating === "number" && body.rating >= 1 && body.rating <= 5 ? body.rating : null;
  const comment = typeof body?.comment === "string" && body.comment.trim() ? body.comment.trim().slice(0, 2000) : null;
  const gameId = typeof body?.gameId === "string" ? body.gameId : null;

  if (rating === null && !comment) {
    return NextResponse.json({ error: "Nothing to submit" }, { status: 400 });
  }

  await prisma.feedback.create({
    data: { userId: session?.user?.id ?? null, gameId, context, rating, comment },
  });

  return NextResponse.json({ ok: true });
}
