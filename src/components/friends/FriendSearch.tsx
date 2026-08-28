"use client";

import { useId, useState } from "react";
import FriendAvatar from "./FriendAvatar";
import PillButton from "./PillButton";
import { IconSearch } from "./icons";
import { BLUE } from "@/components/nav/navItems";
import type { Friend, FriendRequest } from "@/types/friend";

type SearchResult = { userId: string; name: string | null; image: string | null };

export default function FriendSearch({
  search,
  onSendRequest,
  friends,
  outgoing,
}: {
  search: (email: string) => Promise<SearchResult | null>;
  onSendRequest: (userId: string) => Promise<void>;
  friends: Friend[];
  outgoing: FriendRequest[];
}) {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<SearchResult | null>();
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [justSentIds, setJustSentIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!email.trim()) return;
    setSearching(true);
    setError(null);
    try {
      setResult(await search(email));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleSend = async (userId: string) => {
    setSendingId(userId);
    setError(null);
    try {
      await onSendRequest(userId);
      setJustSentIds((prev) => new Set(prev).add(userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send request");
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5 rounded-3xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-extrabold text-ink sm:text-lg">Find friends</h2>
          <p className="text-xs text-ink-muted sm:text-sm">Search by name or email</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Search by name or email
          </label>
          <div className="relative">
            <input
              id={inputId}
              type="text"
              placeholder="Search by name or email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setResult(undefined);
                setError(null);
              }}
              className="min-h-12 w-full rounded-2xl border border-line bg-surface-2 py-3 pl-4 pr-12 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              type="submit"
              aria-label="Search"
              disabled={searching || !email.trim()}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-muted disabled:opacity-40"
            >
              <IconSearch className="h-4.5 w-4.5" />
            </button>
          </div>
        </form>
      </div>

      {error && <p className="text-sm text-accent">{error}</p>}

      {result === null && <p className="text-sm text-ink-muted">No player found with that email.</p>}

      {result && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-extrabold tracking-wide text-ink-muted">Search result</h3>
          <PersonCard
            result={result}
            email={email}
            state={
              friends.some((f) => f.userId === result.userId)
                ? "friends"
                : outgoing.some((r) => r.userId === result.userId) || justSentIds.has(result.userId)
                  ? "sent"
                  : "add"
            }
            sending={sendingId === result.userId}
            onAdd={() => handleSend(result.userId)}
          />
        </div>
      )}
    </div>
  );
}

function PersonCard({
  result,
  email,
  state,
  sending,
  onAdd,
}: {
  result: SearchResult;
  email: string;
  state: "add" | "sent" | "friends";
  sending: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2.5">
      <FriendAvatar image={result.image} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">{result.name ?? "Player"}</p>
        <p className="truncate text-xs text-ink-muted">{email}</p>
      </div>
      {state === "friends" ? (
        <span className="shrink-0 text-xs font-semibold text-ink-muted">Friends</span>
      ) : state === "sent" ? (
        <span className="shrink-0 text-xs font-semibold text-ink-muted">Request sent</span>
      ) : (
        <PillButton color={BLUE} className="shrink-0" onClick={onAdd} disabled={sending}>
          {sending ? "Sending…" : "Add friend"}
        </PillButton>
      )}
    </div>
  );
}
