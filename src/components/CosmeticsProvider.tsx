"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  isBoardFinishId,
  isDiceSkinId,
  isTokenStyleId,
  type BoardFinishId,
  type DiceSkinId,
  type TokenStyleId,
} from "@/game/cosmetics";

// Same pattern as ThemeProvider.tsx's light/dark toggle: a purely local,
// per-client preference persisted to localStorage, never synced between
// players — each seat renders its own board/tokens/dice from this, not
// from anything in the shared GameState.
const TOKEN_STYLE_KEY = "ludo:cosmetics:tokenStyle";
const BOARD_FINISH_KEY = "ludo:cosmetics:boardFinish";
const DICE_SKIN_KEY = "ludo:cosmetics:diceSkin";

function readStored<T extends string>(key: string, isValid: (value: unknown) => value is T, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const stored = localStorage.getItem(key);
  return isValid(stored) ? stored : fallback;
}

const CosmeticsContext = createContext<{
  tokenStyle: TokenStyleId;
  boardFinish: BoardFinishId;
  diceSkin: DiceSkinId;
  setTokenStyle: (id: TokenStyleId) => void;
  setBoardFinish: (id: BoardFinishId) => void;
  setDiceSkin: (id: DiceSkinId) => void;
} | null>(null);

export default function CosmeticsProvider({ children }: { children: React.ReactNode }) {
  const [tokenStyle, setTokenStyleState] = useState<TokenStyleId>(() =>
    readStored(TOKEN_STYLE_KEY, isTokenStyleId, "classic")
  );
  const [boardFinish, setBoardFinishState] = useState<BoardFinishId>(() =>
    readStored(BOARD_FINISH_KEY, isBoardFinishId, "classic")
  );
  const [diceSkin, setDiceSkinState] = useState<DiceSkinId>(() => readStored(DICE_SKIN_KEY, isDiceSkinId, "classic"));

  const setTokenStyle = useCallback((id: TokenStyleId) => {
    setTokenStyleState(id);
    localStorage.setItem(TOKEN_STYLE_KEY, id);
  }, []);
  const setBoardFinish = useCallback((id: BoardFinishId) => {
    setBoardFinishState(id);
    localStorage.setItem(BOARD_FINISH_KEY, id);
  }, []);
  const setDiceSkin = useCallback((id: DiceSkinId) => {
    setDiceSkinState(id);
    localStorage.setItem(DICE_SKIN_KEY, id);
  }, []);

  const value = useMemo(
    () => ({ tokenStyle, boardFinish, diceSkin, setTokenStyle, setBoardFinish, setDiceSkin }),
    [tokenStyle, boardFinish, diceSkin, setTokenStyle, setBoardFinish, setDiceSkin]
  );

  return <CosmeticsContext.Provider value={value}>{children}</CosmeticsContext.Provider>;
}

export function useCosmetics() {
  const ctx = useContext(CosmeticsContext);
  if (!ctx) throw new Error("useCosmetics must be used within CosmeticsProvider");
  return ctx;
}
