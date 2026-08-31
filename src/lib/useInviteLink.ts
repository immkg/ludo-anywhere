import { useEffect, useState } from "react";

type InviteLink = { url: string; referralDiscountPercent: number | null };

// Shared by InviteLinkCard (Friends page) and ShareInviteButton (nav +
// post-game) so both read the same lazily-generated personal invite link
// and live referral discount from one place.
export function useInviteLink() {
  const [invite, setInvite] = useState<InviteLink | null>(null);

  useEffect(() => {
    fetch("/api/friends/invite-link")
      .then(async (res) => {
        // Signed-out visitor — there's no personal referral link, but
        // "Share MyLudo" should still work (GuestNav, LandingHero): fall
        // back to the plain app link instead of leaving this null forever.
        if (res.status === 401) {
          const origin = typeof window !== "undefined" ? window.location.origin : "";
          setInvite({ url: origin, referralDiscountPercent: null });
          return;
        }
        const data = await res.json();
        if (data.url) setInvite({ url: data.url, referralDiscountPercent: data.referralDiscountPercent ?? null });
      })
      .catch(() => {});
  }, []);

  return invite;
}
