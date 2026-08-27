"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { shareOnWhatsApp } from "@/lib/share";
import { trackShare } from "@/lib/socketActions";

export default function InviteLinkCard() {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/friends/invite-link")
      .then((res) => res.json())
      .then((data) => setUrl(data.url ?? null))
      .catch(() => {});
  }, []);

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable — the link is on-screen regardless
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm font-semibold text-ink-muted">Your invite link</p>
      <p className="truncate text-sm text-ink-muted">{url ?? "Loading…"}</p>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={handleCopy} disabled={!url}>
          {copied ? "Copied!" : "Copy link"}
        </Button>
        <Button
          className="flex-1"
          onClick={() => {
            if (!url) return;
            trackShare("invite_link_shared");
            shareOnWhatsApp(`Add me as a friend on MyLudo! ${url}`);
          }}
          disabled={!url}
        >
          WhatsApp
        </Button>
      </div>
    </div>
  );
}
