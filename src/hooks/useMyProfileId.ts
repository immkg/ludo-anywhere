"use client";

import { useSession } from "next-auth/react";
import { useProfiles } from "./useProfiles";

// Resolves the profile that represents the signed-in account itself,
// creating one from the Google name/email if this account has never
// joined/created a room before — the same resolution JoinRoom does inline,
// shared here for flows that skip that page entirely (Friends "Play",
// accepting a live room invite directly from RoomInviteBanner).
export function useMyProfileId() {
  const { data: session } = useSession();
  const { profiles, createProfile } = useProfiles();

  const resolve = async (): Promise<string> => {
    const myEmail = session?.user?.email?.toLowerCase();
    const existing = profiles.find((p) => p.email === myEmail);
    if (existing) return existing.id;
    if (!session?.user?.email) throw new Error("Sign in with Google to continue");
    const created = await createProfile(session.user.name || "Player", session.user.email);
    return created.id;
  };

  return { resolve };
}
