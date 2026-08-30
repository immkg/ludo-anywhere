"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { createRoom, createRoomAsGuest, fillBotSeats, startGame } from "@/lib/socketActions";
import { saveOwnedSeats, getGuestName, saveGuestName } from "@/lib/identity";
import { useRoomStore } from "@/store/useRoomStore";
import { useProfiles } from "@/hooks/useProfiles";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import type { EntitlementStatus } from "@/types/billing";

const PLAYER_COUNTS = [2, 3, 4] as const;

export default function CreateRoom() {
  const router = useRouter();
  const { data: session } = useSession();
  const addMySeats = useRoomStore((s) => s.addMySeats);
  const { profiles, loading: profilesLoading } = useProfiles();

  const [totalPlayers, setTotalPlayers] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billing, setBilling] = useState<EntitlementStatus | null>(null);
  const [guestName, setGuestName] = useState(() => getGuestName());

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/billing/status")
      .then((res) => res.json())
      .then(setBilling)
      .catch(() => {});
  }, [session?.user]);

  // Only a hard signal (no free slot, no credit, no active plan) blocks the
  // button — this is a pre-check, the real charge happens server-side at
  // game:start. The free allowance is flat (any player count), so it
  // doesn't depend on totalPlayers.
  const blocked = !!billing && !billing.entitlement && billing.creditsRemaining <= 0 && billing.freeRemaining <= 0;

  // The room only needs one seated player to be created — the device-login's
  // own profile (created automatically on sign-in). Everyone else joins from
  // the Lobby, same as any other room:join.
  const myEmail = session?.user?.email?.toLowerCase();
  const myProfileId = profiles.find((p) => p.email === myEmail)?.id ?? profiles[0]?.id ?? null;

  const handleCreate = async () => {
    if (!myProfileId) {
      setError("Could not find your player profile");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await createRoom(totalPlayers, [{ profileId: myProfileId }]);
      if (!res.roomCode || !res.seats) throw new Error("Could not create room");
      saveOwnedSeats(res.roomCode, res.seats);
      addMySeats(res.seats);
      router.push(`/room/${res.roomCode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create room");
      setLoading(false);
    }
  };

  // Zero-friction guest path: no account, no friends to invite yet — just
  // start a game right now with bots filling every seat but this one. The
  // room/host mechanics underneath are identical to a signed-in host's
  // (see room:create/checkGameStart's guest-host handling in
  // server.js/entitlements.js); a guest is just never charged for it.
  const handlePlayWithBots = async () => {
    const trimmedGuestName = guestName.trim();
    if (!trimmedGuestName) {
      setError("Enter your name");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      saveGuestName(trimmedGuestName);
      const res = await createRoomAsGuest(totalPlayers, trimmedGuestName);
      if (!res.roomCode || !res.seats?.[0]) throw new Error("Could not create room");
      saveOwnedSeats(res.roomCode, res.seats);
      addMySeats(res.seats);
      const hostSeatId = res.seats[0].id;
      if (totalPlayers > 1) await fillBotSeats(res.roomCode, hostSeatId);
      startGame(res.roomCode, hostSeatId);
      router.push(`/room/${res.roomCode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start game");
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col px-5 py-6 sm:px-8 sm:py-10 lg:min-h-dvh lg:justify-center lg:px-10 lg:py-12">
      <Link
        href={session?.user ? "/" : "/play"}
        aria-label="Back to home"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-muted"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </Link>

      <div className="mt-6 flex flex-col gap-8 md:mt-10 md:flex-row md:items-center md:gap-14 lg:gap-20">
        <div className="flex w-full max-w-md flex-1 flex-col gap-6">
          <div>
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/icon-confetti.png"
                alt=""
                aria-hidden
                className="hidden h-8 w-8 min-[390px]:block"
              />
              <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Create Room</h1>
            </div>
            <p className="mt-1.5 max-w-[34ch] text-sm text-ink-muted sm:text-base">
              Choose how many players will play. You can invite everyone else from the lobby.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {PLAYER_COUNTS.map((n) => {
              const selected = totalPlayers === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTotalPlayers(n)}
                  aria-pressed={selected}
                  className={cn(
                    "relative flex min-h-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-2xl border-2 py-3 transition sm:min-h-20",
                    selected
                      ? "border-accent bg-accent/10 text-accent shadow-sm shadow-accent/20"
                      : "border-line bg-surface text-ink active:scale-[0.98]"
                  )}
                >
                  {selected && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-accent" />}
                  <span className="text-2xl font-extrabold sm:text-3xl">{n}</span>
                  <span
                    className={cn(
                      "text-xs font-semibold sm:text-sm",
                      selected ? "text-accent" : "text-ink-muted"
                    )}
                  >
                    Players
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-end justify-center gap-1 min-[390px]:gap-1.5 md:hidden" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/pawn-red.png" alt="" className="h-10 w-auto min-[390px]:h-14" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/pawn-green.png" alt="" className="h-10 w-auto min-[390px]:h-14" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/dice.png"
              alt=""
              className="mx-0.5 h-8 w-auto translate-y-1.5 min-[390px]:h-11"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/pawn-yellow.png" alt="" className="h-10 w-auto min-[390px]:h-14" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/pawn-blue.png" alt="" className="h-10 w-auto min-[390px]:h-14" />
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2 p-3.5 sm:p-4">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/icon-device.png" alt="" aria-hidden className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink">2–4 players · Any device</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Players can join from any phone, tablet or computer.
              </p>
            </div>
          </div>

          {session?.user && billing && !blocked && (
            <p className="text-xs text-ink-muted">
              {billing.entitlement
                ? "Unlimited games"
                : billing.creditsRemaining > 0
                  ? `${billing.creditsRemaining} credits left`
                  : `${billing.freeRemaining} free today`}
            </p>
          )}

          {error && <p className="text-sm text-accent">{error}</p>}

          {!session?.user ? (
            <>
              <div className="flex flex-col gap-3 rounded-3xl border-2 border-line bg-surface p-4 sm:p-5">
                <label htmlFor="guest-name" className="text-sm font-semibold text-ink-muted">
                  Your name
                </label>
                <Input
                  id="guest-name"
                  placeholder="What should we call you?"
                  value={guestName}
                  maxLength={20}
                  onChange={(e) => {
                    setGuestName(e.target.value);
                    setError(null);
                  }}
                />
              </div>

              {/* Primary: the one thing a guest can do with zero friction —
                  play right now, nobody else to invite yet. */}
              <Button onClick={handlePlayWithBots} disabled={loading} className="w-full" subtitle="Instant — no sign-in needed">
                {loading ? "Starting…" : "Play Free with Bots"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => signIn("google", { callbackUrl: "/create" })}
                disabled={loading}
                className="w-full"
                icon={
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/brand/icon-google.png" alt="" className="h-full w-full" />
                }
                subtitle="Save your players & invite them by name"
              >
                Login to Play with Friends
              </Button>
            </>
          ) : blocked ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-accent bg-surface p-4 text-center">
              <p className="text-sm">You&rsquo;ve used today&rsquo;s free games.</p>
              <Link href="/pricing">
                <Button className="w-full">Get more games</Button>
              </Link>
            </div>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={loading || profilesLoading || !myProfileId}
              className="w-full"
            >
              <span className="flex w-full items-center justify-center gap-2">
                {loading ? "Creating…" : "Create Room"}
                {!loading && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                )}
              </span>
            </Button>
          )}
        </div>

        <div className="relative hidden shrink-0 md:flex md:w-[300px] md:justify-center lg:w-[380px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/hero-illustration.png"
            alt="Four players around a Ludo board"
            className="w-full max-w-[260px] object-contain lg:max-w-[320px]"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/star-yellow.png"
            alt=""
            aria-hidden
            className="absolute -left-1 top-2 h-6 w-6 opacity-90 lg:h-7 lg:w-7"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/cross-blue.png"
            alt=""
            aria-hidden
            className="absolute right-2 top-8 h-4 w-4 opacity-80 lg:right-4"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/star-red.png"
            alt=""
            aria-hidden
            className="absolute bottom-6 right-0 h-5 w-5 opacity-80 lg:right-2"
          />
        </div>
      </div>
    </main>
  );
}
