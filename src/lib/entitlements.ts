import { prisma } from "@/lib/prisma";
// src/server/entitlements.js is normally only imported by server.js, which
// isn't part of the Next.js module graph (see AGENTS.md). This file is the
// one place Next's route handlers reach into it, always passing `prisma`
// from src/lib/prisma.ts (not the separate client server.js uses) so both
// sides of the app share one entitlement decision with no logic duplicated
// between them. Types come from src/server/entitlements.d.ts. Pure pricing
// math with no DB dependency (e.g. the upgrade-offer calculation) lives in
// src/lib/pricing.ts instead, so it can be unit tested without a Prisma
// client in the loop.
import {
  getPricingConfig as _getPricingConfig,
  getEntitlementStatus as _getEntitlementStatus,
  logEvent as _logEvent,
  type PricingConfigData,
  type EntitlementStatus,
} from "@/server/entitlements.js";

export type { PricingConfigData, EntitlementStatus };

export function getPricingConfig(): Promise<PricingConfigData> {
  return _getPricingConfig(prisma);
}

export function getEntitlementStatus(userId: string): Promise<EntitlementStatus> {
  return _getEntitlementStatus(userId, prisma);
}

export function logEvent(type: string, userId: string | null, properties?: Record<string, unknown>): Promise<void> {
  return _logEvent(type, userId, properties, prisma);
}
