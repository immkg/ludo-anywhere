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
  hostUserId,
} from "./src/server/rooms.js";
import { rollDice, moveToken } from "./src/game/engine.js";
import { saveGameHistory } from "./src/server/history.js";
import { getAuthenticatedUserId } from "./src/server/auth.js";
import { resolveSeatProfiles } from "./src/server/profiles.js";
import { resolveCharge, checkGameStart, logEvent } from "./src/server/entitlements.js";
import {
  markOnline,
  markOffline,
  isOnline,
  setUserRoom,
  clearUserRoom,
  getUserRoom,
} from "./src/server/presence.js";
import { getFriendUserIds } from "./src/server/friends.js";
import { getPrisma } from "./src/server/prisma.js";

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

  const userChannel = (userId) => `user:${userId}`;

  // What a freshly-connected (or freshly-friended) socket needs to paint
  // presence: for each friend, whether they're online and — if they are —
  // which lobby room (if any) they're currently sitting in.
  async function presenceSnapshotFor(userId) {
    const friendIds = await getFriendUserIds(userId);
    const snapshot = {};
    for (const friendId of friendIds) {
      snapshot[friendId] = { online: isOnline(friendId), roomCode: getUserRoom(friendId) };
    }
    return snapshot;
  }

  // Pushes one user's current online/room state to everyone who's friends
  // with them — call after any transition (connect, disconnect, entered or
  // left a lobby).
  async function broadcastPresence(userId, extra = {}) {
    const friendIds = await getFriendUserIds(userId);
    const payload = { userId, online: isOnline(userId), roomCode: getUserRoom(userId), ...extra };
    for (const friendId of friendIds) io.to(userChannel(friendId)).emit("presence:update", payload);
  }

  function logPresenceError(context) {
    return (err) => console.error(`Presence: ${context} failed:`, err);
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
    // Presence is app-wide: as soon as an authenticated socket connects
    // (any page, not just inside a room), mark the user online and let
    // their friends know. `socket.data.userId` is cached for the
    // disconnect handler below; every other handler still resolves its own
    // userId from the cookie, unchanged, since that's what actually
    // authorizes each action.
    (async () => {
      const userId = await getAuthenticatedUserId(socket.handshake.headers.cookie);
      if (!userId) return;
      socket.data.userId = userId;
      socket.join(userChannel(userId));
      const wasOffline = markOnline(userId, socket.id);
      socket.emit("presence:snapshot", await presenceSnapshotFor(userId));
      if (wasOffline) await broadcastPresence(userId, { online: true });
    })().catch(logPresenceError("connection setup"));

    // Callable any time a client's friend list may have changed underneath
    // it (e.g. right after accepting a request) to get a fresh snapshot
    // without waiting for a reconnect.
    socket.on(
      "presence:refresh",
      withAck(async (_payload, ack) => {
        const userId =
          socket.data.userId ?? (await getAuthenticatedUserId(socket.handshake.headers.cookie));
        if (!userId) return ack?.({ presence: {} });
        ack?.({ presence: await presenceSnapshotFor(userId) });
      })
    );

    socket.on(
      "room:invite",
      withAck(async ({ roomCode, friendUserId }, ack) => {
        const userId = await getAuthenticatedUserId(socket.handshake.headers.cookie);
        if (!userId) return ack?.({ error: "Sign in with Google to invite friends" });

        const room = getRoom(roomCode);
        if (!room || !room.seats.some((s) => s.userId === userId)) {
          return ack?.({ error: "You're not in that room" });
        }

        const fromSeat = room.seats.find((s) => s.userId === userId);
        io.to(userChannel(friendUserId)).emit("room:invited", {
          roomCode: room.code,
          fromName: fromSeat?.name ?? "A friend",
        });
        ack?.({});
      })
    );

    socket.on(
      "room:joinRequest",
      withAck(async ({ roomCode }, ack) => {
        const userId = await getAuthenticatedUserId(socket.handshake.headers.cookie);
        if (!userId) return ack?.({ error: "Sign in with Google to ask to join" });

        const room = getRoom(roomCode);
        if (!room || room.status !== "lobby") return ack?.({ error: "That room isn't open" });
        const hostSeat = room.seats.find((s) => s.id === room.hostSeatId);
        if (!hostSeat?.userId) return ack?.({ error: "That room isn't open" });

        const requester = await getPrisma().user.findUnique({ where: { id: userId } });
        io.to(userChannel(hostSeat.userId)).emit("room:joinRequest:incoming", {
          roomCode: room.code,
          fromUserId: userId,
          fromName: requester?.name ?? requester?.email ?? "Someone",
        });
        ack?.({});
      })
    );

    socket.on("room:joinRequest:decline", ({ roomCode, toUserId }) => {
      io.to(userChannel(toUserId)).emit("room:joinRequest:declined", { roomCode });
    });

    socket.on(
      "room:joinRequest:approve",
      withAck(async ({ roomCode, toUserId }, ack) => {
        const hostUserId = await getAuthenticatedUserId(socket.handshake.headers.cookie);
        const room = getRoom(roomCode);
        if (!room) return ack?.({ error: "Room not found" });
        const hostSeat = room.seats.find((s) => s.id === room.hostSeatId);
        if (!hostUserId || hostSeat?.userId !== hostUserId) {
          return ack?.({ error: "Only the host can approve requests" });
        }

        // The requester's socket never joined this room's socket.io channel
        // (they were never seated), so the result has to be pushed to them
        // by user id rather than broadcast — everything else mirrors what
        // room:join does for a normal seat request.
        const requester = await getPrisma().user.findUnique({ where: { id: toUserId } });
        if (!requester?.email) return ack?.({ error: "Could not find that player" });
        const profile = await getPrisma().playerProfile.findUnique({
          where: { email: requester.email.toLowerCase() },
        });
        if (!profile) return ack?.({ error: "Could not find that player" });

        const resolved = await resolveSeatProfiles([{ profileId: profile.id }], toUserId);
        if (resolved.error) {
          io.to(userChannel(toUserId)).emit("room:joinRequest:declined", { roomCode });
          return ack?.({ error: resolved.error });
        }

        const { error, seats: created } = addSeats(room, resolved.seats, {
          socketId: null,
          deviceId: null,
          userId: toUserId,
        });
        if (error) {
          io.to(userChannel(toUserId)).emit("room:joinRequest:declined", { roomCode });
          return ack?.({ error });
        }

        setUserRoom(toUserId, room.code);
        broadcastPresence(toUserId).catch(logPresenceError("join-request presence update"));
        broadcastRoom(room);
        io.to(userChannel(toUserId)).emit("room:joinApproved", {
          roomCode: room.code,
          seats: created.map((s) => ({ id: s.id, token: s.token, armIndex: s.armIndex, name: s.name })),
        });
        ack?.({});
      })
    );

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
        setUserRoom(userId, room.code);
        broadcastPresence(userId).catch(logPresenceError("room:create presence update"));
        logEvent("room_created", userId, { maxPlayers });
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
          if (room.status === "lobby" && reconnectUserId) {
            setUserRoom(reconnectUserId, room.code);
            broadcastPresence(reconnectUserId).catch(logPresenceError("room:join reconnect presence update"));
          }
          return;
        }

        if (!Array.isArray(seats) || seats.length < 1) {
          return ack?.({ error: "Invalid seat request" });
        }

        if (!reconnectUserId) return ack?.({ error: "Sign in with Google to join a room" });

        const resolved = await resolveSeatProfiles(seats, reconnectUserId);
        if (resolved.error) return ack?.({ error: resolved.error });

        // Pre-flight only — the real charge happens at game:start. A
        // free host's own additional seats need no check here (they're
        // covered by the host's own eventual charge); a host who currently
        // holds an active subscription or a credit is optimistically
        // treated as "will sponsor this game" and skips the check too.
        const hostId = hostUserId(room);
        if (reconnectUserId !== hostId) {
          const hostDecision = await resolveCharge(hostId, room.maxPlayers);
          if (hostDecision.source === "FREE") {
            const joinerDecision = await resolveCharge(reconnectUserId, room.maxPlayers);
            if (!joinerDecision.allowed) {
              return ack?.({
                error: "You've used today's free games. Get more instantly.",
                code: "limit_reached",
              });
            }
          }
        }

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
        setUserRoom(reconnectUserId, room.code);
        broadcastPresence(reconnectUserId).catch(logPresenceError("room:join presence update"));
        logEvent("player_joined", reconnectUserId, { roomCode: room.code });
      })
    );

    socket.on("game:start", async ({ roomCode, seatId }) => {
      const room = getRoom(roomCode);
      if (!room) return socket.emit("error", { message: "Room not found" });
      if (room.hostSeatId !== seatId) {
        return socket.emit("error", { message: "Only the host can start the game" });
      }

      // Charges the host first, then (unless the host's charge is sponsoring
      // the room) every other distinct account seated — atomically, so a
      // blocked seat leaves nobody charged for a game that never starts.
      const charged = await checkGameStart(room);
      if (!charged.ok) {
        return socket.emit("error", {
          message: `${charged.name ?? "A player"} can't play right now — free games used up today`,
          seatId: charged.seatId,
        });
      }
      room.sponsored = charged.sponsored;

      const { error } = startGame(room);
      if (error) return socket.emit("error", { message: error });

      broadcastRoom(room);
      broadcastGame(room);
      logEvent("game_started", hostUserId(room), {
        roomCode: room.code,
        playerCount: room.seats.length,
        source: charged.source,
        sponsored: charged.sponsored,
      });

      // The room is no longer an open lobby, so it's no longer something a
      // friend could "ask to join" — clear it out of everyone's presence.
      room.seats.forEach((seat) => {
        if (!seat.userId) return;
        clearUserRoom(seat.userId, room.code);
        broadcastPresence(seat.userId).catch(logPresenceError("game:start presence update"));
      });
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
        logEvent("game_completed", hostUserId(room), {
          roomCode: room.code,
          playerCount: room.seats.length,
          sponsored: room.sponsored,
        });
      }
    });

    socket.on("room:leave", ({ roomCode }) => {
      const room = getRoom(roomCode);
      if (!room) return;
      const seat = findSeatBySocket(room, socket.id);
      const wasLobby = room.status === "lobby";
      handleSocketDisconnect(room, socket.id, () => broadcastRoom(room));
      socket.leave(roomCode);
      if (wasLobby && seat?.userId) {
        clearUserRoom(seat.userId, room.code);
        broadcastPresence(seat.userId).catch(logPresenceError("room:leave presence update"));
      }
    });

    // `disconnecting` (not `disconnect`) — by the time `disconnect` fires,
    // Socket.IO has already removed the socket from every room, so
    // socket.rooms would be empty and we'd never find the room to update.
    socket.on("disconnecting", () => {
      for (const roomCode of socket.rooms) {
        const room = getRoom(roomCode);
        const seat = room && findSeatBySocket(room, socket.id);
        if (!room || !seat) continue;
        const wasLobby = room.status === "lobby";
        handleSocketDisconnect(room, socket.id, () => broadcastRoom(room));
        if (wasLobby && seat.userId) {
          clearUserRoom(seat.userId, room.code);
          broadcastPresence(seat.userId).catch(logPresenceError("disconnect presence update"));
        }
      }

      const userId = socket.data.userId;
      if (!userId) return;
      if (markOffline(userId, socket.id)) {
        getPrisma()
          .user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
          .then((user) => broadcastPresence(userId, { online: false, lastSeenAt: user.lastSeenAt }))
          .catch(logPresenceError("lastSeenAt persist"));
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ludo server listening on http://localhost:${port}`);
  });
});
