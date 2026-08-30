import { getPrisma } from "./prisma.js";

// Resolves each seat request's client-supplied profileId into a real,
// verified PlayerProfile — verified because it must show up in this
// device-login's own UserProfile links, so nobody can seat a profile they
// were never given (by id-guessing or otherwise). Returns canonical seat
// `name`s straight from the profile record, never the client's claim.
export async function resolveSeatProfiles(seatRequests, userId) {
  if (!Array.isArray(seatRequests) || seatRequests.length === 0) {
    return { error: "Invalid seat request" };
  }

  const profileIds = seatRequests.map((s) => s?.profileId).filter(Boolean);
  if (profileIds.length !== seatRequests.length) {
    return { error: "Pick a player for every seat" };
  }

  const links = await getPrisma().userProfile.findMany({
    where: { userId, profileId: { in: profileIds } },
    include: { profile: true },
  });
  const byId = new Map(links.map((l) => [l.profileId, l.profile]));

  const seats = [];
  for (const id of profileIds) {
    const profile = byId.get(id);
    if (!profile) return { error: "Invalid player selected" };
    seats.push({ name: profile.name, profileId: profile.id });
  }
  return { seats };
}

// A guest (no signed-in account) joins with just a chosen display name —
// there's no PlayerProfile to verify against, so this never touches the DB.
// Always exactly one seat: a guest joining a room is always "just me", same
// as the signed-in join flow (see JoinRoom.tsx).
export function resolveGuestSeats(seatRequests) {
  if (!Array.isArray(seatRequests) || seatRequests.length !== 1) {
    return { error: "Invalid seat request" };
  }
  const name = seatRequests[0]?.name?.trim();
  if (!name) return { error: "Enter your name" };
  return { seats: [{ name: name.slice(0, 20), profileId: null }] };
}
