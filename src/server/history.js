import { getPrisma } from "./prisma.js";

// Persists a finished game and its seats, keyed by PlayerProfile (not the
// device-login) so stats/history stay unified across whichever device a
// given profile gets seated from.
export async function saveGameHistory(room) {
  const game = room.game;
  await getPrisma().game.create({
    data: {
      roomCode: room.code,
      maxPlayers: room.maxPlayers,
      startedAt: room.startedAt ?? new Date(),
      winnerSeatId: game.winnerSeatId,
      players: {
        create: room.seats.map((seat) => ({
          seatId: seat.id,
          name: seat.name,
          armIndex: seat.armIndex,
          profileId: seat.profileId || null,
          isWinner: seat.id === game.winnerSeatId,
        })),
      },
    },
  });
}
