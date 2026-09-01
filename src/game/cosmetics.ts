// Free, local-only cosmetic customization: token style, board finish, dice
// skin. Each player picks their own look for their own screen only — see
// CosmeticsProvider.tsx, which persists the choice the same way
// ThemeProvider.tsx persists light/dark (localStorage, read per-client).
//
// Deliberately NOT gated behind any entitlement/paywall — see the PR
// description for why. Every option here is free for every player. Kept as
// plain arrays/ids (rather than, say, baked into component code) so a
// future paid tier could filter these lists down to what's unlocked without
// restructuring anything that reads them.

import { shade } from "../lib/color";

export type TokenStyleId = "classic" | "jewel" | "angular";
export type BoardFinishId = "classic" | "gradient" | "weave";
export type DiceSkinId = "classic" | "midnight" | "ivory";

export const TOKEN_STYLES: { id: TokenStyleId; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "jewel", label: "Jewel" },
  { id: "angular", label: "Angular" },
];

export const BOARD_FINISHES: { id: BoardFinishId; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "gradient", label: "Gradient" },
  { id: "weave", label: "Weave" },
];

export const DICE_SKINS: { id: DiceSkinId; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "midnight", label: "Midnight" },
  { id: "ivory", label: "Ivory" },
];

export function isTokenStyleId(value: unknown): value is TokenStyleId {
  return TOKEN_STYLES.some((s) => s.id === value);
}
export function isBoardFinishId(value: unknown): value is BoardFinishId {
  return BOARD_FINISHES.some((s) => s.id === value);
}
export function isDiceSkinId(value: unknown): value is DiceSkinId {
  return DICE_SKINS.some((s) => s.id === value);
}

// --- Token style -----------------------------------------------------

export type TokenRenderProps = {
  // "polygon" (Angular) swaps the disc's Konva shape for a faceted
  // hexagon — the actual "shape" half of issue #23's "token shape/color"
  // axis. The invisible tap-target shape in Token.tsx is computed
  // separately (Board.tsx's Voronoi territory), so swapping the visible
  // shape here never touches hit-testing.
  shape: "circle" | "polygon";
  sides?: number;
  // Replaces Token.tsx's fixed off-white WHITE border.
  borderColor: string;
  // Fed into shade(discColor, amount) for the gradient's lightest stop —
  // the "color" half of the axis: a punchier value reads as a richer,
  // more saturated piece without changing the base disc color itself
  // (still derived from the seat's own arm color for readability).
  highlightAmount: number;
};

const TOKEN_RENDER: Record<TokenStyleId, TokenRenderProps> = {
  classic: { shape: "circle", borderColor: "#DFDACD", highlightAmount: 0.16 },
  jewel: { shape: "circle", borderColor: "#FFD86B", highlightAmount: 0.3 },
  angular: { shape: "polygon", sides: 6, borderColor: "#DFDACD", highlightAmount: 0.16 },
};

export function resolveTokenStyle(id: string): TokenRenderProps {
  return TOKEN_RENDER[id as TokenStyleId] ?? TOKEN_RENDER.classic;
}

// --- Board finish ------------------------------------------------------

// A pure description of how to fill one of Board.tsx's arm-quadrant Rects.
// "weave" needs an actual canvas pattern image, which only exists in a
// browser — that part stays in Board.tsx (see its own weavePatternCanvas
// helper) so this resolver itself has no DOM dependency and is cheap to
// unit test.
export type BoardFinishFill =
  | { kind: "solid"; fill: string }
  | {
      kind: "gradient";
      fillLinearGradientStartPoint: { x: number; y: number };
      fillLinearGradientEndPoint: { x: number; y: number };
      fillLinearGradientColorStops: (number | string)[];
    }
  | { kind: "weave"; fill: string };

export function resolveBoardFinishFill(id: string, hex: string, width: number, height: number): BoardFinishFill {
  switch (id as BoardFinishId) {
    case "gradient":
      return {
        kind: "gradient",
        fillLinearGradientStartPoint: { x: 0, y: 0 },
        fillLinearGradientEndPoint: { x: width, y: height },
        fillLinearGradientColorStops: [0, shade(hex, 0.3), 1, shade(hex, -0.16)],
      };
    case "weave":
      return { kind: "weave", fill: hex };
    case "classic":
    default:
      return { kind: "solid", fill: hex };
  }
}

// --- Dice skin -----------------------------------------------------------

export type DiceSkinColors = { faceBg: string; faceShadow: string; pipColor: string };

// "classic" matches Dice.tsx's original fixed cream-and-black die exactly,
// so picking it (the default) is a visual no-op for existing players.
const DICE_RENDER: Record<DiceSkinId, DiceSkinColors> = {
  classic: {
    faceBg: "linear-gradient(135deg, #fffaf0 0%, #f7e9c8 45%, #ecdba8 100%)",
    faceShadow:
      "inset 0 2px 3px rgba(255,255,255,0.9), inset 0 -3px 5px rgba(0,0,0,0.14), inset 2px 0 3px rgba(255,255,255,0.35), 0 3px 8px rgba(80,60,25,0.22)",
    pipColor: "#241c15",
  },
  midnight: {
    faceBg: "linear-gradient(135deg, #3a3a42 0%, #232329 45%, #16161b 100%)",
    faceShadow:
      "inset 0 2px 3px rgba(255,255,255,0.18), inset 0 -3px 5px rgba(0,0,0,0.5), inset 2px 0 3px rgba(255,255,255,0.08), 0 3px 8px rgba(0,0,0,0.4)",
    pipColor: "#F2E6C9",
  },
  ivory: {
    faceBg: "linear-gradient(135deg, #ffffff 0%, #f1ede4 45%, #e3ddcd 100%)",
    faceShadow:
      "inset 0 2px 3px rgba(255,255,255,0.95), inset 0 -3px 5px rgba(0,0,0,0.1), inset 2px 0 3px rgba(255,255,255,0.5), 0 3px 8px rgba(120,100,50,0.18)",
    pipColor: "#B8860B",
  },
};

export function resolveDiceSkin(id: string): DiceSkinColors {
  return DICE_RENDER[id as DiceSkinId] ?? DICE_RENDER.classic;
}
