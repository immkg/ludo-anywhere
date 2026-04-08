import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import { createGame, rollDice, nextTurn } from "./src/game/engine.ts";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const PORT = 3001;

let rooms = {}; // in-memory (we'll improve later)

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new Server(httpServer);

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Join room
    socket.on("join_room", ({ roomId, players = [], deviceId }) => {
      socket.join(roomId);

      if (!rooms[roomId]) {
        rooms[roomId] = {
          players: [],
          maxPlayers: 6,
          gameStarted: false,
        };
      }

      const room = rooms[roomId];

      if (room.gameStarted) {
        socket.emit("error", "Game already started");
        return;
      }

      // ❌ Prevent overfill
      if (room.players.length + players.length > room.maxPlayers) {
        socket.emit("error", "Room is full");
        return;
      }

      // ✅ Add players
      players.forEach((player) => {
        room.players.push({
          ...player,
          socketId: socket.id,
          deviceId,
        });
      });

      io.to(roomId).emit("room_update", room);
    });

    // Create room
    socket.on("create_room", ({ roomId, maxPlayers }) => {
      rooms[roomId] = {
        players: [],
        maxPlayers,
        gameStarted: false,
      };

      socket.join(roomId);

      socket.emit("room_created", rooms[roomId]);
    });

    // Start game
    socket.on("start_game", ({ roomId }) => {
      const room = rooms[roomId];
      if (!room) return;

      if (room.players.length < 2) {
        socket.emit("error", "Need at least 2 players");
        return;
      }

      room.gameStarted = true;

      // 🎯 Initialize game
      room.gameState = createGame(
        room.players.map((p, i) => ({
          id: p.id,
          name: p.name,
          color: ["red", "blue", "green", "yellow", "purple", "orange"][i],
        }))
      );

      io.to(roomId).emit("game_started", room.gameState);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);

      for (const roomId in rooms) {
        const room = rooms[roomId];

        // remove players from this socket
        room.players = room.players.filter((p) => p.socketId !== socket.id);

        // delete empty room
        if (room.players.length === 0) {
          delete rooms[roomId];
        } else {
          io.to(roomId).emit("room_update", room);
        }
      }
    });

    socket.on("roll_dice", ({ roomId, playerId }) => {
      const room = rooms[roomId];
      if (!room || !room.gameState) return;

      const currentPlayer =
        room.gameState.players[room.gameState.currentTurnIndex];

      // ❌ Not your turn
      if (currentPlayer.id !== playerId) {
        socket.emit("error", "Not your turn");
        return;
      }

      // 🎲 Roll
      room.gameState = rollDice(room.gameState);

      io.to(roomId).emit("game_update", room.gameState);
    });

    socket.on("next_turn", ({ roomId }) => {
      const room = rooms[roomId];
      if (!room || !room.gameState) return;

      room.gameState = nextTurn(room.gameState);

      io.to(roomId).emit("game_update", room.gameState);
    });
  });

  httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
