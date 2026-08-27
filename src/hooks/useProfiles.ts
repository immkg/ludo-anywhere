"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlayerProfile } from "@/types/profile";

// The signed-in device-login's roster of player profiles — used to fill
// seats when creating/joining a room, without gating gameplay behind each
// individual player having their own Google account.
export function useProfiles() {
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profiles")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setProfiles(data.profiles ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createProfile = useCallback(async (name: string, email: string) => {
    const res = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not add player");

    const profile = data.profile as PlayerProfile;
    setProfiles((prev) =>
      prev.some((p) => p.id === profile.id)
        ? prev
        : [...prev, profile].sort((a, b) => a.name.localeCompare(b.name))
    );
    return profile;
  }, []);

  const removeProfile = useCallback(async (profileId: string) => {
    const res = await fetch(`/api/profiles/${profileId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Could not remove player");
    setProfiles((prev) => prev.filter((p) => p.id !== profileId));
  }, []);

  return { profiles, loading, createProfile, removeProfile };
}
