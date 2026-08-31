import { useEffect, useState } from "react";

type InviteLink = { url: string; referralDiscountPercent: number | null };

// Shared by InviteLinkCard (Friends page) and ShareInviteButton (nav +
// post-game) so both read the same lazily-generated personal invite link
// and live referral discount from one place.
export function useInviteLink() {
  const [invite, setInvite] = useState<InviteLink | null>(null);

  useEffect(() => {
    fetch("/api/friends/invite-link")
      .then((res) => res.json())
      .then((data) => {
        if (data.url) setInvite({ url: data.url, referralDiscountPercent: data.referralDiscountPercent ?? null });
      })
      .catch(() => {});
  }, []);

  return invite;
}
