"use client";

import { useEffect, useState } from "react";
import PillButton from "./PillButton";
import { IconChat } from "./icons";
import { IconCopy, IconCheck } from "@/components/lobby/icons";
import { GREEN } from "@/components/nav/navItems";
import { shareText } from "@/lib/share";
import { trackShare } from "@/lib/socketActions";

const ACCENT = "var(--color-accent)";

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
    <div className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-4 sm:p-5">
      <div>
        <h2 className="text-base font-extrabold text-ink sm:text-lg">Invite someone</h2>
        <p className="text-xs text-ink-muted sm:text-sm">Know someone who would love a game?</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-ink-muted">Your invite link</p>
        <p className="truncate rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink-muted">
          {url ?? "Loading…"}
        </p>
      </div>

      <div className="flex gap-2">
        <PillButton
          color={ACCENT}
          className="flex-1"
          icon={copied ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
          onClick={handleCopy}
          disabled={!url}
        >
          {copied ? "Copied!" : "Copy link"}
        </PillButton>
        <PillButton
          color={GREEN}
          className="flex-1"
          icon={<IconChat className="h-4 w-4" />}
          onClick={() => {
            if (!url) return;
            trackShare("invite_link_shared");
            shareText(`Add me as a friend on MyLudo! ${url}`);
          }}
          disabled={!url}
        >
          Share
        </PillButton>
      </div>
    </div>
  );
}
