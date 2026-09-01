"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket";
import { armForSeatIndex, colorForArm } from "@/game/board";
import {
  startGame,
  removeSeat,
  joinRoom,
  trackShare,
  leaveRoom,
  fillBotSeats,
  requestStart,
  requestBotFill,
} from "@/lib/socketActions";
import { shareRoomLink, roomJoinUrl } from "@/lib/share";
import { saveOwnedSeats, clearOwnedSeats } from "@/lib/identity";
import { generateDummyEmail, randomEmailSuffix } from "@/lib/dummyEmail";
import { useProfiles } from "@/hooks/useProfiles";
import { useRoomStore } from "@/store/useRoomStore";
import { cn } from "@/lib/utils";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import InviteFriendsList from "@/components/friends/InviteFriendsList";
import PlayerAvatar from "@/components/lobby/PlayerAvatar";
import Wordmark from "@/components/brand/Wordmark";
import AppIconMark from "@/components/brand/AppIconMark";
import IncomingJoinRequests from "@/components/lobby/IncomingJoinRequests";
import { OccupiedSeatCard, EmptySeatCard } from "@/components/lobby/PlayerSeatCard";
import {
  IconCheck,
  IconClock,
  IconCopy,
  IconExit,
  IconGlobe,
  IconGrid,
  IconLink,
  IconPlay,
  IconRobot,
  IconTrophy,
  IconUsers,
} from "@/components/lobby/icons";
import type { PlayerProfile } from "@/types/profile";
import type { Room, OwnedSeat } from "@/types/room";

// Links into existing pages so the desktop shell's sidebar isn't a dead
// end — this component doesn't own those routes, it just points at them.
const NAV_ITEMS = [
  { href: "#", label: "Lobby", icon: IconGrid, active: true },
  { href: "/friends", label: "Friends", icon: IconUsers, active: false },
  { href: "/leaderboard", label: "Leaderboard", icon: IconTrophy, active: false },
  { href: "/history", label: "History", icon: IconClock, active: false },
];

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function WaitingRoom({ room, mySeats }: { room: Room; mySeats: OwnedSeat[] }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [fillingBots, setFillingBots] = useState(false);
  const [incomingRequest, setIncomingRequest] = useState<{ type: "start" | "bots"; fromName: string } | null>(null);
  const requestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const error = useRoomStore((s) => s.error);
  const setError = useRoomStore((s) => s.setError);
  const resetRoomStore = useRoomStore((s) => s.reset);
  const isHost = !!room.hostSeatId && mySeats.some((s) => s.id === room.hostSeatId);
  const canStart = isHost && room.seats.length >= 2;
  const openSlots = Math.max(0, room.maxPlayers - room.seats.length);
  const hostName = room.seats.find((s) => s.id === room.hostSeatId)?.name;
  const myName = mySeats[0]?.name ?? "A player";

  // Nudges from a non-host in a matchmaking room asking the host to start
  // early or fill with bots — purely a relayed toast (see room:requestStart/
  // room:requestBotFill in server.js), the host still has to actually click
  // Start/Fill Bots below.
  useEffect(() => {
    if (!isHost) return;
    const socket = getSocket();
    const onRequestStart = ({ fromName }: { fromName: string }) => {
      setIncomingRequest({ type: "start", fromName });
      if (requestTimerRef.current) clearTimeout(requestTimerRef.current);
      requestTimerRef.current = setTimeout(() => setIncomingRequest(null), 8000);
    };
    const onRequestBotFill = ({ fromName }: { fromName: string }) => {
      setIncomingRequest({ type: "bots", fromName });
      if (requestTimerRef.current) clearTimeout(requestTimerRef.current);
      requestTimerRef.current = setTimeout(() => setIncomingRequest(null), 8000);
    };
    socket.on("room:requestStart", onRequestStart);
    socket.on("room:requestBotFill", onRequestBotFill);
    return () => {
      socket.off("room:requestStart", onRequestStart);
      socket.off("room:requestBotFill", onRequestBotFill);
      if (requestTimerRef.current) clearTimeout(requestTimerRef.current);
    };
  }, [isHost]);

  // A simple client-side stopwatch for "how long have I been waiting" in a
  // matchmaking room — resets on remount (e.g. a refresh), which is fine
  // since it's just a rough sense of elapsed time, not a stored value.
  useEffect(() => {
    if (!room.matchmaking) return;
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [room.matchmaking]);

  const handleFillBots = async () => {
    if (!room.hostSeatId) return;
    setFillingBots(true);
    try {
      await fillBotSeats(room.code, room.hostSeatId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add bots");
    } finally {
      setFillingBots(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable — the code is on-screen regardless
    }
  };

  const handleShareLink = async () => {
    trackShare("room_shared", { roomCode: room.code });
    const url = roomJoinUrl(room.code);
    const result = await shareRoomLink(`Join my Ludo room on MyLudo! ${url}`, url);
    if (result === "copied") {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
    }
  };

  const handleLeave = () => {
    leaveRoom(room.code);
    clearOwnedSeats(room.code);
    resetRoomStore();
    router.push(session?.user ? "/" : "/play");
  };

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <AppIconMark className="h-7 w-7 sm:h-8 sm:w-8" />
          <Wordmark className="text-lg sm:text-xl" />
        </div>
        <div className="flex items-center gap-3">
          {session?.user && (
            <div className="hidden items-center gap-2 md:flex">
              {session.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-9 w-9 shrink-0 rounded-full border border-line"
                />
              ) : (
                <span className="h-9 w-9 shrink-0 rounded-full border border-line bg-surface-2" />
              )}
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-bold text-ink">{session.user.name ?? session.user.email}</p>
                {isHost && <p className="text-xs font-semibold text-accent">Host</p>}
              </div>
            </div>
          )}
          <button
            onClick={handleLeave}
            className="flex h-11 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-semibold text-ink-muted hover:border-accent/50 hover:text-accent md:px-4"
          >
            <IconExit className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline">Leave Room</span>
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl gap-6 px-5 pb-10 sm:px-6 lg:px-8">
        <aside className="hidden lg:flex lg:w-52 lg:shrink-0 lg:flex-col lg:gap-1 lg:pt-1">
          {NAV_ITEMS.map((item) =>
            item.active ? (
              <div
                key={item.label}
                aria-current="page"
                className="flex items-center gap-2.5 rounded-2xl bg-accent/12 px-3 py-2.5 text-sm font-bold text-accent"
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {item.label}
              </div>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink"
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            )
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-6 md:flex-row md:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-6 md:max-w-xl">
            <div className="sticky top-0 z-10 -mx-5 flex items-center justify-between gap-3 bg-bg px-5 py-3 md:static md:mx-0 md:bg-transparent md:px-0 md:py-0">
              {isHost ? (
                <Button disabled={!canStart} onClick={() => startGame(room.code, room.hostSeatId!)} className="flex-1">
                  <span className="flex items-center justify-center gap-2">
                    <IconPlay className="h-4 w-4" /> Start Game
                  </span>
                </Button>
              ) : (
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
                  <IconClock className="h-4 w-4 shrink-0" /> Waiting for host to start…
                </p>
              )}
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-sm font-bold text-ink">
                <IconUsers className="h-4 w-4 text-accent" />
                {room.seats.length}/{room.maxPlayers}
              </span>
            </div>
            {isHost && !canStart && (
              <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                <IconClock className="h-3.5 w-3.5" /> Waiting for players…
              </p>
            )}

            {isHost && incomingRequest && (
              <div className="flex items-center gap-3 rounded-2xl border border-accent bg-surface p-3">
                <p className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">{incomingRequest.fromName}</span>{" "}
                  {incomingRequest.type === "start" ? "wants you to start the game" : "wants you to fill the rest with bots"}
                </p>
                <button
                  onClick={() => {
                    setIncomingRequest(null);
                    if (incomingRequest.type === "start") startGame(room.code, room.hostSeatId!);
                    else handleFillBots();
                  }}
                  className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {incomingRequest.type === "start" ? "Start now" : "Fill bots"}
                </button>
                <button
                  onClick={() => setIncomingRequest(null)}
                  className="shrink-0 text-xs font-semibold text-ink-muted underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {error && (
              <div className="flex items-start justify-between gap-3 rounded-2xl border border-accent bg-surface p-3">
                <p className="text-sm">
                  {error}
                  {error.includes("used up today") && (
                    <>
                      {" "}
                      <Link href="/pricing" className="font-semibold text-accent underline">
                        Get more games
                      </Link>
                    </>
                  )}
                </p>
                <button onClick={() => setError(null)} className="shrink-0 text-xs text-ink-muted underline">
                  Dismiss
                </button>
              </div>
            )}

            <div className="flex flex-col gap-3 rounded-3xl border-2 border-accent/25 bg-surface p-4 sm:p-5">
              {room.matchmaking ? (
                <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                  <IconClock className="h-4 w-4 shrink-0" />
                  Waiting for more players — {formatElapsed(elapsedSeconds)}
                </p>
              ) : (
                <p className="text-sm text-ink-muted">Share this code with your friends</p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 py-3 text-center text-3xl font-extrabold tracking-[0.25em] text-ink sm:text-4xl"
                >
                  {room.code}
                </button>
                <button
                  onClick={handleCopy}
                  aria-label={copied ? "Room code copied" : "Copy room code"}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-2 text-ink-muted hover:text-accent"
                >
                  {copied ? <IconCheck className="h-5 w-5 text-accent" /> : <IconCopy className="h-5 w-5" />}
                </button>
              </div>

              {room.sponsored && !isHost && (
                <p className="text-xs font-semibold text-accent">
                  {hostName ?? "The host"} is hosting — this game&apos;s on them
                </p>
              )}

              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={handleShareLink}>
                  <span className="flex items-center justify-center gap-2">
                    {shareCopied ? (
                      <>
                        <IconCheck className="h-4 w-4" /> Link copied!
                      </>
                    ) : (
                      <>
                        <IconLink className="h-4 w-4" /> Share
                      </>
                    )}
                  </span>
                </Button>
                <Button variant="secondary" className="flex-1" onClick={() => setInviteOpen((v) => !v)}>
                  <span className="flex items-center justify-center gap-2">
                    <IconUsers className="h-4 w-4" /> Friends
                  </span>
                </Button>
              </div>

              {inviteOpen && <InviteFriendsList roomCode={room.code} />}
            </div>

            {isHost && <IncomingJoinRequests roomCode={room.code} />}

            <div className="flex flex-col gap-3">
              {isHost && openSlots > 0 && (
                <Button variant="secondary" onClick={handleFillBots} disabled={fillingBots}>
                  <span className="flex items-center justify-center gap-2">
                    <IconRobot className="h-4 w-4" />
                    {fillingBots ? "Adding bots…" : `Fill ${openSlots} open seat${openSlots === 1 ? "" : "s"} with Bot`}
                  </span>
                </Button>
              )}
              <div className="grid grid-cols-2 gap-3">
                {room.seats.map((seat) => {
                  const mine = mySeats.some((s) => s.id === seat.id);
                  // The host can remove anyone but themselves (down to
                  // hosting alone); a non-host device can only remove seats
                  // it added itself — see the matching check in
                  // room:removeSeat (server.js). In a matchmaking room the
                  // host has no say over strangers they didn't invite — only
                  // removing seats you added yourself is allowed there.
                  const canRemove = seat.id !== room.hostSeatId && (room.matchmaking ? mine : isHost || mine);
                  return (
                    <OccupiedSeatCard
                      key={seat.id}
                      seat={seat}
                      isMine={mine}
                      isHostSeat={seat.id === room.hostSeatId}
                      canRemove={canRemove}
                      onRemove={() =>
                        removeSeat(
                          room.code,
                          seat.id,
                          mySeats.find((s) => s.id === room.hostSeatId)?.id ?? mySeats[0]?.id
                        ).catch(() => {})
                      }
                    />
                  );
                })}
                {Array.from({ length: openSlots }, (_, i) => {
                  const arm = armForSeatIndex(room.seats.length + i, room.maxPlayers);
                  return (
                    <EmptySeatCard
                      key={i}
                      seatNumber={room.seats.length + i + 1}
                      previewColorHex={colorForArm(arm).hex}
                      onAdd={() => setAddPlayerOpen(true)}
                    />
                  );
                })}
              </div>
            </div>

            {!isHost && room.matchmaking && room.seats.length < room.maxPlayers && (
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => requestStart(room.code, myName)}>
                  Ask host to start
                </Button>
                <Button variant="secondary" className="flex-1" onClick={() => requestBotFill(room.code, myName)}>
                  Ask for bots
                </Button>
              </div>
            )}

            <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface-2 p-3 text-xs sm:text-sm">
              <IconGlobe className="h-5 w-5 shrink-0 text-ink-muted" />
              <p className="text-ink-muted">
                <span className="font-semibold text-ink">Anyone with the code can join</span> · from any device.
              </p>
            </div>
          </div>

          <div className="hidden shrink-0 items-start justify-center pt-2 md:flex md:w-[260px] lg:w-[320px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/hero-illustration.png"
              alt="A Ludo board set up for four players"
              className="w-full max-w-[260px] object-contain lg:max-w-[300px]"
            />
          </div>
        </main>
      </div>

      {addPlayerOpen && (
        <AddPlayerModal
          roomCode={room.code}
          seatedProfileIds={new Set(room.seats.map((s) => s.profileId).filter((id) => id != null))}
          onClose={() => setAddPlayerOpen(false)}
        />
      )}
    </div>
  );
}

// Lets any already-seated device add one more of its own profiles without
// leaving the lobby — reuses the same room:join path CreateRoom/JoinRoom
// use, just from inside WaitingRoom. The server still enforces everything
// (room not full, that profile not already seated elsewhere).
function AddPlayerModal({
  roomCode,
  seatedProfileIds,
  onClose,
}: {
  roomCode: string;
  seatedProfileIds: Set<string>;
  onClose: () => void;
}) {
  const addMySeats = useRoomStore((s) => s.addMySeats);
  const { profiles, createProfile } = useProfiles();
  const availableProfiles = profiles.filter((p) => !seatedProfileIds.has(p.id));

  // Derived, not sticky state: useProfiles() fetches asynchronously, so
  // availableProfiles is [] on the first render regardless of the real
  // count — a `useState` seeded from it would freeze on "create" forever.
  // forceCreate only tracks the user's own "+ Add New Player" click.
  const [forceCreate, setForceCreate] = useState(false);
  const mode: "list" | "create" = forceCreate || availableProfiles.length === 0 ? "create" : "list";

  const [search, setSearch] = useState("");
  const [addingProfileId, setAddingProfileId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailSuffix, setEmailSuffix] = useState(() => randomEmailSuffix());
  const placeholderEmail = generateDummyEmail(name, emailSuffix);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableProfiles;
    return availableProfiles.filter(
      (p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
    );
  }, [availableProfiles, search]);

  const finishAdd = async (profileId: string) => {
    const res = await joinRoom(roomCode, [{ profileId }]);
    if (!res.seats) throw new Error("Could not add player");
    saveOwnedSeats(roomCode, res.seats);
    addMySeats(res.seats);
    onClose();
  };

  const handlePickProfile = async (profileId: string) => {
    setAddingProfileId(profileId);
    setError(null);
    try {
      await finishAdd(profileId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add player");
      setAddingProfileId(null);
    }
  };

  const handleCreateAndAdd = async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await createProfile(name, email.trim() || placeholderEmail);
      await finishAdd(profile.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add player");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-surface p-4">
        <div className="flex items-center justify-between">
          <p className="font-bold text-ink">Add a player</p>
          <button onClick={onClose} className="text-sm font-semibold text-ink-muted underline">
            Cancel
          </button>
        </div>

        {mode === "list" ? (
          <>
            <Input
              autoFocus
              placeholder="Search your players"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-10 w-full text-sm"
            />

            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
              {filteredProfiles.length === 0 ? (
                <p className="py-4 text-center text-xs text-ink-muted">No players match &ldquo;{search}&rdquo;.</p>
              ) : (
                filteredProfiles.map((p: PlayerProfile) => (
                  <button
                    key={p.id}
                    disabled={addingProfileId !== null}
                    onClick={() => handlePickProfile(p.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border p-2.5 text-left transition disabled:opacity-40",
                      addingProfileId === p.id ? "border-accent bg-accent/10" : "border-line hover:bg-surface-2"
                    )}
                  >
                    <PlayerAvatar name={p.name} email={p.email} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                      <p className="truncate text-xs text-ink-muted">{p.email}</p>
                    </div>
                    {addingProfileId === p.id && <IconCheck className="h-4 w-4 shrink-0 text-accent" />}
                  </button>
                ))
              )}
            </div>

            {error && <p className="text-xs text-accent">{error}</p>}
            <Button
              variant="secondary"
              disabled={addingProfileId !== null}
              onClick={() => {
                setForceCreate(true);
                setError(null);
                setEmailSuffix(randomEmailSuffix());
              }}
            >
              + Add New Player
            </Button>
          </>
        ) : (
          <>
            {availableProfiles.length > 0 && (
              <button
                onClick={() => {
                  setForceCreate(false);
                  setError(null);
                }}
                className="self-start text-xs font-semibold text-ink-muted underline"
              >
                ← Back to players
              </button>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="new-player-name" className="text-xs font-semibold text-ink-muted">
                Name
              </label>
              <Input
                id="new-player-name"
                autoFocus
                placeholder="Name"
                value={name}
                maxLength={20}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="new-player-email" className="text-xs font-semibold text-ink-muted">
                Email
              </label>
              <Input
                id="new-player-email"
                placeholder={placeholderEmail}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-xs text-ink-muted">Optional — leave blank to use a generated one.</p>
            </div>
            {error && <p className="text-xs text-accent">{error}</p>}
            <Button onClick={handleCreateAndAdd} disabled={loading || !name.trim()}>
              {loading ? "Adding…" : "Add player"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
