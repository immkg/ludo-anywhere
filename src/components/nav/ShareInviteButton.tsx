"use client";

import { IconChat } from "@/components/friends/icons";
import { GREEN } from "@/components/nav/navItems";
import { shareWithImage } from "@/lib/share";
import { trackShare } from "@/lib/socketActions";
import { useInviteLink } from "@/lib/useInviteLink";

// One-click "bring a friend into the app" action — distinct from
// GameMenu's "Invite" (which shares a join link for *this* room). Reused
// in AccountSheet, DesktopSidebar, AppHeader (mobile top bar), and
// GameView's finished screen, so referral share is always one tap away.
// Renders nothing (rather than a disabled button) until the invite link
// has loaded.
export default function ShareInviteButton({
  source,
  variant = "row",
  buildMessage,
}: {
  source: "nav" | "post_game";
  // "compact" is the mobile header's pill — icon + full label, not just an
  // icon, so it reads the same as the full "row" version elsewhere.
  // "button" matches Button's secondary variant, for sitting side-by-side
  // with another Button (e.g. "Back home" on the post-game screen).
  variant?: "row" | "compact" | "button";
  // Overrides the default generic invite copy — e.g. the post-game screen
  // leads with the actual result ("I just won...") ahead of the referral
  // pitch. Receives the invite URL and the live referral discount so the
  // caller doesn't have to duplicate that lookup.
  buildMessage?: (url: string, referralDiscountPercent: number | null) => string;
}) {
  const invite = useInviteLink();
  if (!invite) return null;

  const handleShare = () => {
    trackShare("invite_link_shared", { source });
    const pct = invite.referralDiscountPercent;
    const message = buildMessage
      ? buildMessage(invite.url, pct)
      : pct
        ? `Play Ludo with me on MyLudo — sign up and we both get ${pct}% off! ${invite.url}`
        : `Play Ludo with me on MyLudo! ${invite.url}`;
    shareWithImage(message, `${invite.url}/opengraph-image`);
  };

  if (variant === "compact") {
    return (
      <button
        onClick={handleShare}
        className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-2 px-3 text-xs font-semibold text-ink"
      >
        <span className="flex h-4 w-4 shrink-0" style={{ color: GREEN }}>
          <IconChat />
        </span>
        Share MyLudo
      </button>
    );
  }

  if (variant === "button") {
    return (
      <button
        onClick={handleShare}
        className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 px-5 text-base font-semibold text-ink transition active:scale-[0.98]"
      >
        <span className="flex h-5 w-5 shrink-0" style={{ color: GREEN }}>
          <IconChat />
        </span>
        Share
      </button>
    );
  }

  return (
    <button
      onClick={handleShare}
      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2/60"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full [&>svg]:h-4 [&>svg]:w-4"
        style={{ backgroundColor: "color-mix(in srgb, " + GREEN + " 15%, transparent)", color: GREEN }}
      >
        <IconChat />
      </span>
      <span className="min-w-0 flex-1 truncate text-left">Share MyLudo</span>
    </button>
  );
}
