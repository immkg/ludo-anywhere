import { create } from "zustand";
import type { OwnedSeat, Room } from "@/types/room";

type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected";

type RoomState = {
  room: Room | null;
  mySeats: OwnedSeat[];
  status: ConnectionStatus;
  error: string | null;
  setRoom: (room: Room | null) => void;
  setMySeats: (seats: OwnedSeat[]) => void;
  addMySeats: (seats: OwnedSeat[]) => void;
  setStatus: (status: ConnectionStatus) => void;
  setError: (error: string | null) => void;
  reset: () => void;
};

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  mySeats: [],
  status: "idle",
  error: null,
  setRoom: (room) => set({ room }),
  setMySeats: (seats) => set({ mySeats: seats }),
  addMySeats: (seats) =>
    set((s) => ({
      mySeats: [...s.mySeats.filter((existing) => !seats.some((n) => n.id === existing.id)), ...seats],
    })),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  reset: () => set({ room: null, mySeats: [], error: null }),
}));
