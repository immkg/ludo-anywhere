import { getPrisma } from "./prisma.js";

// Ids of every user with an accepted friendship with `userId`, from either
// side of the relation. Used to target presence broadcasts and room invites.
export async function getFriendUserIds(userId) {
  const rows = await getPrisma().friendship.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true },
  });
  return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
}
