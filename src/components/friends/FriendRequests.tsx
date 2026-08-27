"use client";

import { useState } from "react";
import FriendAvatar from "./FriendAvatar";
import type { FriendRequest } from "@/types/friend";

export default function FriendRequests({
  incoming,
  outgoing,
  onAccept,
  onDecline,
}: {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  onAccept: (id: string) => Promise<void>;
  onDecline: (id: string) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (incoming.length === 0 && outgoing.length === 0) return null;

  const run = async (id: string, action: (id: string) => Promise<void>) => {
    setBusyId(id);
    try {
      await action(id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {incoming.map((req) => (
        <div key={req.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
          <FriendAvatar image={req.image} />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{req.name ?? req.email}</p>
          <div className="flex shrink-0 gap-2">
            <button
              disabled={busyId === req.id}
              onClick={() => run(req.id, onAccept)}
              className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Accept
            </button>
            <button
              disabled={busyId === req.id}
              onClick={() => run(req.id, onDecline)}
              className="text-xs font-semibold text-ink-muted underline disabled:opacity-40"
            >
              Decline
            </button>
          </div>
        </div>
      ))}
      {outgoing.map((req) => (
        <div
          key={req.id}
          className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-3"
        >
          <FriendAvatar image={req.image} />
          <p className="min-w-0 flex-1 truncate text-sm text-ink-muted">
            Request sent to {req.name ?? req.email}
          </p>
          <button
            disabled={busyId === req.id}
            onClick={() => run(req.id, onDecline)}
            className="shrink-0 text-xs font-semibold text-ink-muted underline disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      ))}
    </div>
  );
}
