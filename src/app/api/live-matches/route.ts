import { NextResponse } from "next/server";
import { listLiveMatches } from "@/server/rooms.js";

// No auth, no PII — every field here is already visible to anyone who
// opens the room's own public spectate page (see listLiveMatches in
// src/server/rooms.js). Uncached: polled every few seconds by
// useLiveMatches and the underlying rooms.js state changes constantly.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ matches: listLiveMatches() });
}
