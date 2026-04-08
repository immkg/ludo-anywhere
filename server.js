import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";

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

      // 👇 Only add players if provided
      if (players.length > 0) {
        players.forEach((player) => {
          rooms[roomId].players.push({
            ...player,
            socketId: socket.id,
            deviceId,
          });
        });
      }

      // 👇 ALWAYS emit room state
      io.to(roomId).emit("room_update", rooms[roomId]);
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
      rooms[roomId].gameStarted = true;

      io.to(roomId).emit("game_started", rooms[roomId]);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      // TODO: remove player
    });
  });

  httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
