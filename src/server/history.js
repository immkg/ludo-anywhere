import { getPrisma } from "./prisma.js";
import { placementFor } from "../game/engine.js";

// Persists a finished game and its seats, keyed by PlayerProfile (not the
// device-login) so stats/history stay unified across whichever device a
// given profile gets seated from. Play continues past the first finish
// (see placementFor) — isWinner is true for anyone who actually finished
// (up to 3 places), not just the first, and the one seat that never
// finished gets placement = seats.length, the implicit loser.
export async function saveGameHistory(room) {
  const game = room.game;
  await getPrisma().game.create({
    data: {
      roomCode: room.code,
      maxPlayers: room.maxPlayers,
      startedAt: room.startedAt ?? new Date(),
      winnerSeatId: game.winnerSeatId,
      endedEarly: !!game.endedEarly,
      players: {
        create: room.seats.map((seat) => ({
          seatId: seat.id,
          name: seat.name,
          armIndex: seat.armIndex,
          profileId: seat.profileId || null,
          isWinner: game.placements.includes(seat.id),
          placement: placementFor(game, seat.id),
        })),
      },
    },
  });
}
