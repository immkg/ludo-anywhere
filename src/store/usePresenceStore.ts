import { create } from "zustand";
import type { Presence } from "@/types/friend";

type PresenceState = {
  byUserId: Record<string, Presence>;
  setSnapshot: (snapshot: Record<string, Presence>) => void;
  applyUpdate: (userId: string, presence: Presence) => void;
  reset: () => void;
};

// Live-only, socket-pushed presence for friends — merged client-side with
// the REST-fetched friend list (see useFriends.ts). Never persisted.
export const usePresenceStore = create<PresenceState>((set) => ({
  byUserId: {},
  setSnapshot: (snapshot) => set((s) => ({ byUserId: { ...s.byUserId, ...snapshot } })),
  applyUpdate: (userId, presence) =>
    set((s) => ({ byUserId: { ...s.byUserId, [userId]: presence } })),
  reset: () => set({ byUserId: {} }),
}));
