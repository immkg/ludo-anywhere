import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import {
  createRoom,
  getRoom,
  addSeats,
  reconnectSeats,
  findSeatBySocket,
  handleSocketDisconnect,
  startGame,
  serializeRoom,
  serializeGame,
} from "./src/server/rooms.js";
import { rollDice, moveToken } from "./src/game/engine.js";
import { saveGameHistory } from "./src/server/history.js";
import { getAuthenticatedUserId } from "./src/server/auth.js";
import { resolveSeatProfiles } from "./src/server/profiles.js";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3001;
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server(httpServer);

  function broadcastRoom(room) {
    io.to(room.code).emit("room:update", serializeRoom(room));
  }

  function broadcastGame(room) {
    io.to(room.code).emit("game:update", serializeGame(room));
  }

  // Wraps a socket handler with an ack callback so any thrown/rejected
  // error still reaches the client as an error instead of leaving it
  // hanging forever (e.g. waiting on a "Creating…" spinner) — this bit us
  // for real with an unhandled DB connection error.
  function withAck(handler) {
    return async (payload, ack) => {
      try {
        await handler(payload, ack);
      } catch (err) {
        console.error(`Unhandled error in socket handler:`, err);
        ack?.({ error: "Something went wrong. Please try again." });
      }
    };
  }

  io.on("connection", (socket) => {
    socket.on(
      "room:create",
      withAck(async ({ maxPlayers, seats, deviceId }, ack) => {
        if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 4) {
          return ack?.({ error: "maxPlayers must be between 2 and 4" });
        }
        if (!Array.isArray(seats) || seats.length < 1 || seats.length > maxPlayers) {
          return ack?.({ error: "Invalid seat request" });
        }

        const userId = await getAuthenticatedUserId(socket.handshake.headers.cookie);
        if (!userId) return ack?.({ error: "Sign in with Google to create a room" });

        const resolved = await resolveSeatProfiles(seats, userId);
        if (resolved.error) return ack?.({ error: resolved.error });

        const room = createRoom({ maxPlayers });
        const { error, seats: created } = addSeats(room, resolved.seats, {
          socketId: socket.id,
          deviceId,
          userId,
        });
        if (error) return ack?.({ error });

        socket.join(room.code);
        ack?.({
          roomCode: room.code,
          seats: created.map((s) => ({ id: s.id, token: s.token, armIndex: s.armIndex, name: s.name })),
        });
        broadcastRoom(room);
      })
    );

    socket.on(
      "room:join",
      withAck(async ({ roomCode, seats, deviceId, knownTokens }, ack) => {
        const room = getRoom(roomCode);
        if (!room) return ack?.({ error: "Room not found" });

        const reconnectUserId = await getAuthenticatedUserId(socket.handshake.headers.cookie);
        const reconnected = reconnectSeats(room, knownTokens || [], socket.id, reconnectUserId);
        if (reconnected.length > 0) {
          socket.join(room.code);
          ack?.({
            roomCode: room.code,
            seats: reconnected.map((s) => ({ id: s.id, token: s.token, armIndex: s.armIndex, name: s.name })),
          });
          broadcastRoom(room);
          if (room.game) socket.emit("game:update", serializeGame(room));
          return;
        }

        if (!Array.isArray(seats) || seats.length < 1) {
          return ack?.({ error: "Invalid seat request" });
        }

        if (!reconnectUserId) return ack?.({ error: "Sign in with Google to join a room" });

        const resolved = await resolveSeatProfiles(seats, reconnectUserId);
        if (resolved.error) return ack?.({ error: resolved.error });

        const { error, seats: created } = addSeats(room, resolved.seats, {
          socketId: socket.id,
          deviceId,
          userId: reconnectUserId,
        });
        if (error) return ack?.({ error });

        socket.join(room.code);
        ack?.({
          roomCode: room.code,
          seats: created.map((s) => ({ id: s.id, token: s.token, armIndex: s.armIndex, name: s.name })),
        });
        broadcastRoom(room);
      })
    );

    socket.on("game:start", ({ roomCode, seatId }) => {
      const room = getRoom(roomCode);
      if (!room) return socket.emit("error", { message: "Room not found" });
      if (room.hostSeatId !== seatId) {
        return socket.emit("error", { message: "Only the host can start the game" });
      }

      const { error } = startGame(room);
      if (error) return socket.emit("error", { message: error });

      broadcastRoom(room);
      broadcastGame(room);
    });

    socket.on("game:rollDice", ({ roomCode, seatId }) => {
      const room = getRoom(roomCode);
      if (!room?.game) return;
      const current = room.game.seats[room.game.currentSeatIndex];
      if (current?.id !== seatId) {
        return socket.emit("error", { message: "Not your turn" });
      }
      room.game = rollDice(room.game);
      broadcastGame(room);
    });

    socket.on("game:moveToken", ({ roomCode, seatId, tokenIndex }) => {
      const room = getRoom(roomCode);
      if (!room?.game) return;
      const current = room.game.seats[room.game.currentSeatIndex];
      if (current?.id !== seatId) {
        return socket.emit("error", { message: "Not your turn" });
      }
      room.game = moveToken(room.game, seatId, tokenIndex);
      broadcastGame(room);

      if (room.game.status === "finished" && !room.historySaved) {
        room.historySaved = true;
        room.status = "finished";
        saveGameHistory(room).catch((err) => {
          console.error("Failed to save game history", err);
        });
      }
    });

    socket.on("room:leave", ({ roomCode }) => {
      const room = getRoom(roomCode);
      if (!room) return;
      handleSocketDisconnect(room, socket.id, () => broadcastRoom(room));
      socket.leave(roomCode);
    });

    // `disconnecting` (not `disconnect`) — by the time `disconnect` fires,
    // Socket.IO has already removed the socket from every room, so
    // socket.rooms would be empty and we'd never find the room to update.
    socket.on("disconnecting", () => {
      for (const roomCode of socket.rooms) {
        const room = getRoom(roomCode);
        if (room && findSeatBySocket(room, socket.id)) {
          handleSocketDisconnect(room, socket.id, () => broadcastRoom(room));
        }
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ludo server listening on http://localhost:${port}`);
  });
});
