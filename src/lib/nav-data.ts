import { prisma } from "@/lib/prisma";

// Shared by every authenticated page that renders AuthenticatedNav, so the
// same "pending incoming friend request" notification-badge count isn't
// reimplemented per page.
export function getPendingRequestCount(userId: string): Promise<number> {
  return prisma.friendship.count({ where: { addresseeId: userId, status: "pending" } });
}

// First name for the nav's greeting/identity display — same derivation
// every AuthenticatedNav caller uses, falling back to the account email
// (never hardcoded) when there's no name on the Google profile.
export function getDisplayName(user: { name?: string | null; email?: string | null }): string {
  return user.name?.trim().split(/\s+/)[0] || user.email || "there";
}
