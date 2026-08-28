"use client";

import { useState } from "react";
import FriendAvatar from "./FriendAvatar";
import PillButton from "./PillButton";
import { GREEN, RED } from "@/components/nav/navItems";
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
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-extrabold text-ink sm:text-lg">Friend requests</h2>
        {incoming.length > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-white">
            {incoming.length}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {incoming.map((req) => (
          <div key={req.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <FriendAvatar image={req.image} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">{req.name ?? req.email}</p>
              <p className="truncate text-xs text-ink-muted">Wants to play with you</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <PillButton color={GREEN} disabled={busyId === req.id} onClick={() => run(req.id, onAccept)}>
                Accept
              </PillButton>
              <PillButton color={RED} disabled={busyId === req.id} onClick={() => run(req.id, onDecline)}>
                Decline
              </PillButton>
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
    </section>
  );
}
