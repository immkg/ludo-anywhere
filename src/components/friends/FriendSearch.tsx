"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import FriendAvatar from "./FriendAvatar";

export default function FriendSearch({
  search,
  onSendRequest,
}: {
  search: (email: string) => Promise<{ userId: string; name: string | null; image: string | null } | null>;
  onSendRequest: (userId: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ userId: string; name: string | null; image: string | null } | null>();
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    setSearching(true);
    setError(null);
    setSent(false);
    try {
      setResult(await search(email));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleSend = async () => {
    if (!result) return;
    setSending(true);
    setError(null);
    try {
      await onSendRequest(result.userId);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send request");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm font-semibold text-ink-muted">Add a friend by email</p>
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="friend@email.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setResult(undefined);
          }}
        />
        <Button
          variant="secondary"
          className="shrink-0 px-4"
          onClick={handleSearch}
          disabled={searching || !email.trim()}
        >
          {searching ? "…" : "Search"}
        </Button>
      </div>

      {error && <p className="text-sm text-accent">{error}</p>}

      {result === null && <p className="text-sm text-ink-muted">No player found with that email.</p>}

      {result && (
        <div className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2">
          <FriendAvatar image={result.image} />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{result.name ?? "Player"}</p>
          <Button
            className="min-h-9 shrink-0 px-3 text-xs"
            onClick={handleSend}
            disabled={sending || sent}
          >
            {sent ? "Sent" : sending ? "Sending…" : "Add friend"}
          </Button>
        </div>
      )}
    </div>
  );
}
