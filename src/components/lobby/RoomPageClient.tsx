"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
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
      .catch((e) => {
        // Surfaced the same way a failed manual "Watch this game" click
        // would be (see handleWatch) — a dead room link should show that
        // immediately, not the generic "not seated" prompt with a Watch
        // button that would just fail the same way if clicked.
        if (e instanceof Error && e.message === "Room not found") setWatchError(e.message);
        setRejoinState("none");
      });
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
      // The approval push only updates room state server-side — this
      // socket is still never subscribed to the room's broadcast channel
      // until it actually calls room:watch (see reconnectSpectator in
      // rooms.js, which is what runs socket.join(room.code) for it). Skip
      // that and the UI would claim "watching" while getting no
      // room:update/game:update until the next reload's token-reconnect
      // effect happened to fix it up.
      watchRoom(approvedCode, "", [approved.token])
        .then((res) => {
          if (res.spectator) saveSpectatorToken(approvedCode, res.spectator);
          setSpectator(res.spectator ?? approved);
        })
        .catch(() => setSpectator(approved));
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

  // Skips the manual "Watch this game" click for a link that already
  // promised spectating — the home dashboard's Live Matches "Spectate"
  // (see LiveMatchesSection.tsx) only ever links to rooms with
  // spectatePolicy "public", so this always resolves instantly rather than
  // landing the visitor on a wait screen for something a click wouldn't
  // meaningfully gate anyway.
  const autoWatchFired = useRef(false);
  useEffect(() => {
    if (autoWatchFired.current) return;
    if (searchParams.get("watch") !== "1") return;
    if (rejoinState === "pending" || isSeated || isWatching || watchState !== "idle") return;
    if (watchError === "Room not found") return;
    autoWatchFired.current = true;
    // Deferred a tick rather than called directly — handleWatch's first
    // line is a setState call, and calling it synchronously from an
    // effect's own body (as opposed to from a later promise/event
    // callback, the way every other effect above handles this) trips the
    // no-setstate-in-effect lint rule.
    Promise.resolve().then(() => handleWatch());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleWatch is redefined every render; autoWatchFired.current already guards against firing more than once
  }, [searchParams, rejoinState, isSeated, isWatching, watchState, watchError]);

  if (rejoinState === "pending") {
    return <div className="flex min-h-dvh items-center justify-center text-ink-muted">Loading room…</div>;
  }

  if (rejoinState === "none" || !room || (!isSeated && !isWatching)) {
    // A dead end, not something retrying the same action fixes — no seat
    // to rejoin, no room to watch. Skip the "not seated"/Watch prompt
    // entirely rather than show them next to an error that already says
    // there's nothing here.
    const roomNotFound = watchError === "Room not found";
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        {!roomNotFound && (
          <p className="text-ink-muted">
            {watchState === "waiting"
              ? "Waiting for the host to let you watch…"
              : watchState === "declined"
                ? "The host declined your request to watch."
                : `You're not seated in room ${roomCode}.`}
          </p>
        )}
        {watchError && <p className="text-sm text-accent">{watchError}</p>}
        <div className="flex w-full max-w-xs flex-col gap-3">
          {watchState !== "waiting" && !roomNotFound && (
            <Button onClick={handleWatch} disabled={watchState === "requesting"}>
              {watchState === "requesting" ? "Requesting…" : "Watch this game"}
            </Button>
          )}
          {roomNotFound ? (
            <>
              {/* This link is dead either way, so lead with the action that
                  actually gets someone playing again rather than the one
                  that just asks them to type in another code. */}
              <Button onClick={() => router.push(`/create`)}>Create room</Button>
              <Button variant="secondary" onClick={() => router.push(`/join`)}>
                Join a room
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => router.push(`/join`)}>
                Join a room
              </Button>
              <Button variant="secondary" onClick={() => router.push(`/create`)}>
                Create room
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (isSeated) {
    return room.status === "lobby" ? <WaitingRoom room={room} mySeats={myRelevantSeats} /> : <GameView room={room} />;
  }

  return room.status === "lobby" ? (
    <WaitingRoom room={room} mySeats={[]} isSpectator spectatorId={spectator?.id} />
  ) : (
    <GameView room={room} isSpectator spectatorId={spectator?.id} />
  );
}
