"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useRoomStore } from "@/store/useRoomStore";
import {
  loadOwnedSeats,
  saveOwnedSeats,
  loadSpectatorToken,
  saveSpectatorToken,
  clearSpectatorToken,
  getGuestName,
} from "@/lib/identity";
import { joinRoom, watchRoom } from "@/lib/socketActions";
import { getSocket } from "@/lib/socket";
import Button from "@/components/ui/Button";
import WaitingRoom from "@/components/lobby/WaitingRoom";
import GameView from "@/components/game/GameView";
import type { OwnedSpectator } from "@/types/room";

// "Waiting" only covers a private room's host-approval round trip (see
// room:watch in server.js) — a public room's watchRoom() call itself
// resolves straight to "watching", no separate pending state needed.
type WatchState = "idle" | "requesting" | "waiting" | "declined";

export default function RoomPageClient() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const roomCode = String(params.roomId).toUpperCase();

  const room = useRoomStore((s) => s.room);
  const addMySeats = useRoomStore((s) => s.addMySeats);
  const mySeats = useRoomStore((s) => s.mySeats);

  const [rejoinState, setRejoinState] = useState<"pending" | "ok" | "none">("pending");
  const [spectator, setSpectator] = useState<OwnedSpectator | null>(null);
  const [watchState, setWatchState] = useState<WatchState>("idle");
  const [watchError, setWatchError] = useState<string | null>(null);

  useEffect(() => {
    const known = loadOwnedSeats(roomCode);
    joinRoom(roomCode, [], known.map((s) => s.token))
      .then((res) => {
        if (res.seats) {
          saveOwnedSeats(roomCode, res.seats);
          addMySeats(res.seats);
        }
        setRejoinState("ok");
      })
      .catch(() => setRejoinState("none"));
  }, [roomCode, addMySeats]);

  // Reconnect as a spectator, same idea as the seat rejoin above — only
  // attempted if this device previously watched this room (see
  // saveSpectatorToken in handleWatch below). Deliberately not re-run when
  // `spectator` itself changes (that would loop); this only ever needs to
  // run once per room visit.
  useEffect(() => {
    const known = loadSpectatorToken(roomCode);
    if (!known) return;
    watchRoom(roomCode, "", [known.token])
      .then((res) => {
        if (res.spectator) {
          saveSpectatorToken(roomCode, res.spectator);
          setSpectator(res.spectator);
        }
      })
      .catch(() => clearSpectatorToken(roomCode));
  }, [roomCode]);

  // A "private" room's watch request is resolved later, by whoever's
  // watching room:watchApproved/room:watchRequest:declined — same
  // fire-later shape as room:joinApproved (see JoinRoom.tsx).
  useEffect(() => {
    const socket = getSocket();
    const onApproved = ({ roomCode: approvedCode, spectator: approved }: { roomCode: string; spectator: OwnedSpectator }) => {
      if (approvedCode !== roomCode) return;
      saveSpectatorToken(approvedCode, approved);
      setSpectator(approved);
      setWatchState("idle");
    };
    const onDeclined = ({ roomCode: declinedCode }: { roomCode: string }) => {
      if (declinedCode !== roomCode) return;
      setWatchState("declined");
    };
    socket.on("room:watchApproved", onApproved);
    socket.on("room:watchRequest:declined", onDeclined);
    return () => {
      socket.off("room:watchApproved", onApproved);
      socket.off("room:watchRequest:declined", onDeclined);
    };
  }, [roomCode]);

  const handleWatch = async () => {
    setWatchState("requesting");
    setWatchError(null);
    try {
      const name = session?.user?.name || getGuestName() || "A guest";
      const res = await watchRoom(roomCode, name);
      if (res.spectator) {
        saveSpectatorToken(roomCode, res.spectator);
        setSpectator(res.spectator);
        setWatchState("idle");
      } else if (res.pending) {
        setWatchState("waiting");
      }
    } catch (e) {
      setWatchState("idle");
      setWatchError(e instanceof Error ? e.message : "Could not watch this room");
    }
  };

  const myRelevantSeats = mySeats.filter((s) => room?.seats.some((rs) => rs.id === s.id));
  const isSeated = myRelevantSeats.length > 0;
  const isWatching = !!spectator;

  if (rejoinState === "pending") {
    return <div className="flex min-h-dvh items-center justify-center text-ink-muted">Loading room…</div>;
  }

  if (rejoinState === "none" || !room || (!isSeated && !isWatching)) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-ink-muted">
          {watchState === "waiting"
            ? "Waiting for the host to let you watch…"
            : watchState === "declined"
              ? "The host declined your request to watch."
              : `You're not seated in room ${roomCode}.`}
        </p>
        {watchError && <p className="text-sm text-accent">{watchError}</p>}
        <div className="flex w-full max-w-xs flex-col gap-3">
          {watchState !== "waiting" && (
            <Button onClick={handleWatch} disabled={watchState === "requesting"}>
              {watchState === "requesting" ? "Requesting…" : "Watch this game"}
            </Button>
          )}
          <Button variant="secondary" onClick={() => router.push(`/join`)}>
            Join a room
          </Button>
          <Button variant="secondary" onClick={() => router.push(`/create`)}>
            Create room
          </Button>
        </div>
      </div>
    );
  }

  if (isSeated) {
    return room.status === "lobby" ? <WaitingRoom room={room} mySeats={myRelevantSeats} /> : <GameView room={room} />;
  }

  return room.status === "lobby" ? (
    <WaitingRoom room={room} mySeats={[]} isSpectator />
  ) : (
    <GameView room={room} isSpectator />
  );
}
