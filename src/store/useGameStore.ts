import { create } from "zustand";
import type { GameState } from "@/types/game";

type GameStoreState = {
  game: GameState | null;
  setGame: (game: GameState | null) => void;
};

export const useGameStore = create<GameStoreState>((set) => ({
  game: null,
  setGame: (game) => set({ game }),
}));
