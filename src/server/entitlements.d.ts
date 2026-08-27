// Type declarations for entitlements.js, following the same pattern as
// src/game/board.d.ts/engine.d.ts — this module is plain JS (shared
// unchanged between server.js's socket handlers and Next's route
// handlers), so TS can't infer its shapes on its own.

export type PricingConfigData = {
  // Flat daily allowance — a game counts the same toward it no matter how
  // many players it has, same unit model as a Game Pack credit.
  freeGamesPerDay: number;
  gamePack: { priceInr: number; credits: number; expiryHours: number; originalPriceInr: number };
  monthly: {
    priceInr: number;
    days: number;
    fairUseCapPerDay: number;
    originalPriceInr: number;
    upgradeToAnnualMaxDiscountInr: number;
  };
  annual: { priceInr: number; days: number; fairUseCapPerDay: number; originalPriceInr: number };
  enforcementEnabled: boolean;
};

export type ChargeSource = "SUBSCRIPTION" | "FREE" | "PACK";

export type ChargeDecision =
  | { allowed: true; source: ChargeSource; creditBatchId?: string }
  | { allowed: false; reason: string };

export type EntitlementStatus = {
  entitlement: { type: "MONTHLY" | "ANNUAL"; expiresAt: Date } | null;
  creditsRemaining: number;
  freeRemaining: number;
};

export type GameStartResult =
  | { ok: true; sponsored: boolean; source: ChargeSource }
  | { ok: false; seatId?: string; name?: string; reason: string };

// `prisma` here is intentionally untyped (`unknown`) rather than
// PrismaClient — this module is called with two different client
// instances (src/server/prisma.js and src/lib/prisma.ts), and typing it
// precisely would require importing generated Prisma types into a module
// meant to stay framework-location-agnostic.
export function getPricingConfig(prisma?: unknown): Promise<PricingConfigData>;
export function _clearPricingConfigCache(): void;
export function resolveCharge(userId: string, playerCount: number, prisma?: unknown): Promise<ChargeDecision>;
export function charge(
  userId: string,
  playerCount: number,
  roomCode: string,
  role: "HOST" | "JOINER",
  prisma?: unknown
): Promise<ChargeDecision>;
export function getEntitlementStatus(userId: string, prisma?: unknown): Promise<EntitlementStatus>;
export function checkGameStart(room: unknown, prisma?: unknown): Promise<GameStartResult>;
export function logEvent(
  type: string,
  userId: string | null,
  properties?: Record<string, unknown>,
  prisma?: unknown
): Promise<void>;
