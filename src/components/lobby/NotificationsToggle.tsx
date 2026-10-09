"use client";

import { useState } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import Button from "@/components/ui/Button";
import { IconBell } from "@/components/home/icons";

// Device-level setting (unlike ProfileManager above it, which manages
// players) — opts this specific browser/device install into Web Push for
// room invites, join requests, and friend requests. See
// src/hooks/usePushNotifications.ts.
export default function NotificationsToggle() {
  const { permission, subscribed, busy, subscribe, unsubscribe } = usePushNotifications();
  const [error, setError] = useState<string | null>(null);

  if (permission === "unsupported") return null;

  const handleToggle = async () => {
    setError(null);
    try {
      if (subscribed) {
        await unsubscribe();
      } else {
        const granted = await subscribe();
        if (!granted) setError("Notifications are blocked for this site in your browser settings.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-3xl border border-line bg-surface-2/60 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
        <IconBell className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">Notifications</p>
        <p className="text-xs text-ink-muted sm:text-sm">
          Get notified on this device about room invites and friend requests, even when MyLudo isn&rsquo;t open.
        </p>
        {error && <p className="mt-1 text-xs text-accent">{error}</p>}
      </div>
      <Button
        variant={subscribed ? "secondary" : "primary"}
        className="min-h-11 shrink-0 px-4 text-sm"
        onClick={handleToggle}
        disabled={busy || permission === "denied"}
      >
        {busy ? "..." : subscribed ? "On" : "Turn on"}
      </Button>
    </div>
  );
}
