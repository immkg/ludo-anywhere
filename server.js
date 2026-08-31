import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import {
  createRoom,
  getRoom,
  addSeats,
  removeSeat,
  reconnectSeats,
  findSeatBySocket,
  handleSocketDisconnect,
  startGame,
  serializeRoom,
  serializeGame,
  hostUserId,
  midGameSuspendSeat,
  midGameResumeSeat,
  midGameRemoveSeat,
  midGameEndGame,
  transferHost,
  claimableSeats,
  claimSeat,
  deleteRoom,
  rematchEligibleSeats,
  fillWithBots,
  addSimulatedBot,
  guestKeyFor,
  isGuestKey,
} from "./src/server/rooms.js";
import { findOpenMatchRoom, markOpen, markClosed, MATCHMAKING_SIZE } from "./src/server/matchmaking.js";
import { rollDice, moveToken, pickAutoMoveToken, DICE_HOLD_MS } from "./src/game/engine.js";
import { saveGameHistory } from "./src/server/history.js";
import { getAuthenticatedUserId } from "./src/server/auth.js";
import { resolveSeatProfiles, resolveGuestSeats } from "./src/server/profiles.js";
import { resolveCharge, checkGameStart, logEvent } from "./src/server/entitlements.js";
import { trackPosthog } from "./src/server/posthog.js";
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

  // Derived from DICE_HOLD_MS (src/game/engine.js), with margin, rather than
  // an independent guess: a bot must never roll again before every client's
  // dice-hold from its *previous* roll has released, or that next roll's
  // spin gets silently swallowed by a forced remount mid-hold (same bug as
  // an un-held auto-forfeit, one seat later in a chain of back-to-back
  // forfeits). Keeping this tied to DICE_HOLD_MS means the two can never
  // drift out of sync again.
  const BOT_ROLL_DELAY_MS = DICE_HOLD_MS + 300;
  const BOT_MOVE_DELAY_MS = 1400;

  // Whichever seat currently owed a turn, if that seat is a bot — null once
  // the round isn't playing, or the current seat isn't one.
  function currentBotSeat(room) {
    if (!room?.game || room.status !== "playing") return null;
    const gameSeat = room.game.seats[room.game.currentSeatIndex];
    if (!gameSeat) return null;
    const seat = room.seats.find((s) => s.id === gameSeat.id);
    return seat?.bot ? seat : null;
  }

  // Bots never wait on a human tap: once it's a bot seat's turn, this rolls
  // for it after a short "thinking" pause, then — if the roll leaves a
  // choice — moves for it after another pause, reusing the same auto-move
  // heuristic already used for an idle human (pickAutoMoveToken in
  // src/game/engine.js). Each step re-validates it's still that bot's turn
  // right before acting, since the seat could've been paused/removed, or the
  // round could've ended, while it was waiting — and always reschedules
  // itself afterward, in case the next turn (or a bonus turn for the same
  // seat) is a bot's too. `room.botTimer` guards against ever having two of
  // these chains running for the same room at once.
  function scheduleBotTurn(room) {
    if (room.botTimer) return;
    const botSeat = currentBotSeat(room);
    if (!botSeat) return;

    const rolling = room.game.diceValue == null;
    room.botTimer = setTimeout(() => {
      room.botTimer = null;
      if (getRoom(room.code) !== room) {
        // The one way this chain can die forever: the room this timer was
        // armed for is no longer the live one under its code (deleted, or
        // replaced) — nothing re-arms it after this. Should be rare; log it
        // so a real freeze report can be matched against server logs.
        console.error("Bot turn chain stopped: room no longer live", room.code, botSeat.name);
        return;
      }
      // Always reschedule, even if something below throws — otherwise a
      // single unexpected error permanently kills this room's bot chain
      // (nothing else ever re-arms it), which looks like the bot froze and
      // the whole game got stuck.
      try {
        const stillBotSeat = currentBotSeat(room);
        if (!stillBotSeat || stillBotSeat.id !== botSeat.id) return;

        if (rolling) {
          room.game = rollDice(room.game);
        } else {
          const tokenIndex = pickAutoMoveToken(room.game, botSeat.id);
          if (tokenIndex != null) room.game = moveToken(room.game, botSeat.id, tokenIndex);
        }
        broadcastGame(room);
        finishRoomIfNeeded(room);
      } catch (err) {
        console.error("Bot turn failed, rescheduling", room.code, err);
      } finally {
        scheduleBotTurn(room);
      }
    }, rolling ? BOT_ROLL_DELAY_MS : BOT_MOVE_DELAY_MS);
  }

  // A lone host in a freshly-created matchmaking room has nothing to do but
  // wait, so this trickles bot seats in one at a time on a randomized,
  // human-arrival-like schedule instead of leaving them stuck — see
  // addSimulatedBot in rooms.js for how those seats are disguised as
  // ordinary players. Each stage's delay is picked fresh so the gaps aren't
  // clockwork: ~8-11s for the first bot (giving a real match every chance
  // to land first), then ~3-6s, then ~6-9s for the rest, unless the room
  // fills or stops being an empty lobby first.
  const MATCHMAKING_BOT_DELAY_STAGES_MS = [
    [8000, 11000],
    [3000, 6000],
    [6000, 9000],
  ];

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  // Re-checks everything right before acting (at fire time, not schedule
  // time) so a manual action taken while a delay is pending — the host
  // starting early, filling bots themselves, or a second real player
  // actually joining — is enough to stop the chain cold on its very next
  // tick. No stored timer handle/guard needed: this is only ever kicked off
  // once per room (see matchmaking:join), and each stage only re-arms
  // itself from inside the previous stage's own callback.
  function scheduleMatchmakingBotFill(room, stage) {
    const [min, max] = MATCHMAKING_BOT_DELAY_STAGES_MS[stage] ?? MATCHMAKING_BOT_DELAY_STAGES_MS.at(-1);
    setTimeout(async () => {
      if (getRoom(room.code) !== room) return;
      if (!room.matchmaking || room.status !== "lobby") return;
      if (room.seats.length >= room.maxPlayers) return;
      // More than just the host has actually shown up — let real people
      // decide from here (manual Start/Fill-bots), not simulated traffic.
      if (room.seats.filter((s) => !s.bot).length > 1) return;

      const { error } = addSimulatedBot(room);
      if (error) return;
      broadcastRoom(room);

      if (room.seats.length >= room.maxPlayers) {
        await attemptGameStart(room, (e) => io.to(room.code).emit("error", e));
      } else if (stage + 1 < MATCHMAKING_BOT_DELAY_STAGES_MS.length) {
        scheduleMatchmakingBotFill(room, stage + 1);
      }
    }, randomBetween(min, max));
  }

  // Called after anything that might have just ended a round (a move that
  // finishes the last active seat, or a host removing a seat down to the
  // same point) — saves history exactly once, whichever path got there.
  function finishRoomIfNeeded(room) {
    if (room.game?.status !== "finished" || room.historySaved) return;
    room.historySaved = true;
    room.status = "finished";
    saveGameHistory(room).catch((err) => {
      console.error("Failed to save game history", err);
    });
    const props = { roomCode: room.code, playerCount: room.seats.length, sponsored: room.sponsored };
    logEvent("game_completed", hostUserId(room), props);
    trackPosthog("game_completed", props, hostUserId(room));
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

  // Charges whoever ends up as host (sponsoring the rest of the room unless
  // their charge resolved to plain FREE-tier), then locks in the roster and
  // starts the game — shared by a host's manual game:start click and
  // matchmaking's auto-start once a room fills. `notify` lets each caller
  // decide who hears about a failure: the clicking host only (manual start)
  // vs everyone in the room (nobody "clicked" to explain themselves to).
  async function attemptGameStart(room, notify) {
    const charged = await checkGameStart(room);
    if (!charged.ok) {
      notify({
        message: `${charged.name ?? "A player"} can't play right now — free games used up today`,
        seatId: charged.seatId,
      });
      return false;
    }
    room.sponsored = charged.sponsored;

    const { error } = startGame(room);
    if (error) {
      notify({ message: error });
      return false;
    }

    broadcastRoom(room);
    broadcastGame(room);
    scheduleBotTurn(room);
    const startProps = {
      roomCode: room.code,
      playerCount: room.seats.length,
      source: charged.source,
      sponsored: charged.sponsored,
    };
    logEvent("game_started", hostUserId(room), startProps);
    trackPosthog("game_started", startProps, hostUserId(room));

    // The room is no longer an open lobby, so it's no longer something a
    // friend could "ask to join" — clear it out of everyone's presence.
    room.seats.forEach((seat) => {
      if (!seat.userId) return;
      clearUserRoom(seat.userId, room.code);
      broadcastPresence(seat.userId).catch(logPresenceError("game:start presence update"));
    });
    return true;
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

    // Fire-and-forget analytics for client-side actions that never touch a
    // room (a share-button tap) — no ack, and the type is allowlisted so a
    // compromised/hand-crafted client can't write arbitrary event rows.
    const TRACKABLE_EVENTS = new Set(["room_shared", "invite_link_shared"]);
    socket.on("analytics:track", async ({ type, properties } = {}) => {
      if (!TRACKABLE_EVENTS.has(type)) return;
      const userId =
        socket.data.userId ?? (await getAuthenticatedUserId(socket.handshake.headers.cookie));
      logEvent(type, userId ?? null, properties ?? {});
      trackPosthog(type, properties ?? {}, userId ?? null);
    });

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
        room.invitedUserIds.add(friendUserId);
        io.to(userChannel(friendUserId)).emit("room:invited", {
          roomCode: room.code,
          fromName: fromSeat?.name ?? "A friend",
          fromUserId: userId,
        });
        ack?.({});
      })
    );

    // Fire-and-forget, same pattern as room:joinRequest:decline — the
    // inviter just wants to see "declined" rather than being left thinking
    // the invite is still pending forever.
    socket.on("room:invite:decline", async ({ roomCode, hostUserId }) => {
      const byUserId = await getAuthenticatedUserId(socket.handshake.headers.cookie);
      if (!byUserId || !hostUserId) return;
      io.to(userChannel(hostUserId)).emit("room:invite:declined", { roomCode, byUserId });
    });

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
      getRoom(roomCode)?.pendingRequests.delete(toUserId);
      io.to(userChannel(toUserId)).emit("room:joinRequest:declined", { roomCode });
    });

    socket.on(
      "room:joinRequest:approve",
      withAck(async ({ roomCode, toUserId }, ack) => {
        const approverUserId = await getAuthenticatedUserId(socket.handshake.headers.cookie);
        const room = getRoom(roomCode);
        if (!room) return ack?.({ error: "Room not found" });
        const hostSeat = room.seats.find((s) => s.id === room.hostSeatId);
        if (!approverUserId || hostSeat?.userId !== approverUserId) {
          return ack?.({ error: "Only the host can approve requests" });
        }

        // room:join's approval-gated path (any new room-code join) stores
        // the requester's actual chosen seats in pendingRequests; the
        // older friends-list "Ask to join" flow never does (it only ever
        // knows who's asking, not what they picked), so it falls back to
        // resolving their own default profile the way it always has.
        const pending = room.pendingRequests.get(toUserId);
        room.pendingRequests.delete(toUserId);

        let resolved;
        if (pending) {
          resolved = { seats: pending.seats };
        } else {
          // The requester's socket never joined this room's socket.io
          // channel (they were never seated), so the result has to be
          // pushed to them by user id rather than broadcast.
          const requester = await getPrisma().user.findUnique({ where: { id: toUserId } });
          if (!requester?.email) return ack?.({ error: "Could not find that player" });
          const profile = await getPrisma().playerProfile.findUnique({
            where: { email: requester.email.toLowerCase() },
          });
          if (!profile) return ack?.({ error: "Could not find that player" });
          resolved = await resolveSeatProfiles([{ profileId: profile.id }], toUserId);
        }
        if (resolved.error) {
          io.to(userChannel(toUserId)).emit("room:joinRequest:declined", { roomCode });
          return ack?.({ error: resolved.error });
        }

        // A mid-game claim (see room:claimSeat) replaces one existing
        // seat instead of appending a new one.
        // toUserId may be a guest's synthetic device key (see room:join) —
        // never let that leak into a seat's real `userId` field, which
        // billing/presence code treats as "this is a real chargeable
        // account" whenever it's truthy.
        const seatUserId = isGuestKey(toUserId) ? null : toUserId;
        let created;
        if (pending?.claimSeatId) {
          const { error, seat } = claimSeat(room, pending.claimSeatId, {
            name: resolved.seats[0].name,
            profileId: resolved.seats[0].profileId,
            userId: seatUserId,
            socketId: null,
            deviceId: null,
          });
          if (error) {
            io.to(userChannel(toUserId)).emit("room:joinRequest:declined", { roomCode });
            return ack?.({ error });
          }
          created = [seat];
        } else {
          const { error, seats: addedSeats } = addSeats(room, resolved.seats, {
            socketId: null,
            deviceId: null,
            userId: seatUserId,
          });
          if (error) {
            io.to(userChannel(toUserId)).emit("room:joinRequest:declined", { roomCode });
            return ack?.({ error });
          }
          created = addedSeats;
        }

        if (seatUserId) {
          setUserRoom(seatUserId, room.code);
          broadcastPresence(seatUserId).catch(logPresenceError("join-request presence update"));
        }
        broadcastRoom(room);
        if (pending?.claimSeatId) broadcastGame(room);
        io.to(userChannel(toUserId)).emit("room:joinApproved", {
          roomCode: room.code,
          seats: created.map((s) => ({ id: s.id, token: s.token, armIndex: s.armIndex, name: s.name })),
        });
        ack?.({});
        // This is the only place a genuinely new person (not already
        // seated) actually lands a seat — room:join stores the request as
        // `pending` and returns early without logging anything (see
        // above), so without this the entire "shared a room link, someone
        // new joined" path was invisible in AnalyticsEvent.
        const joinProps = {
          roomCode: room.code,
          source: pending?.claimSeatId ? "claim" : pending ? "link" : "friend_request",
        };
        logEvent("player_joined", seatUserId, joinProps);
        trackPosthog("player_joined", joinProps, seatUserId);
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
        // A guest (no session) can still create a room, same as they can
        // already join one — just a chosen name, no PlayerProfile (see
        // resolveGuestSeats). Unlike joining, a guest-created room's own
        // charge-free-ness is handled entirely in checkGameStart, not here.
        const resolved = userId ? await resolveSeatProfiles(seats, userId) : resolveGuestSeats(seats);
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
        if (userId) {
          setUserRoom(userId, room.code);
          broadcastPresence(userId).catch(logPresenceError("room:create presence update"));
        }
        logEvent("room_created", userId, { maxPlayers });
        trackPosthog("room_created", { maxPlayers }, userId);
      })
    );

    // Random-opponent matchmaking: one shared pool, always a 4-seat room —
    // splitting by player count would only slow matching down with a small
    // user base. Signed-in only (no account to charge/attribute a match
    // to); guests keep the instant "Play with Bots" flow instead.
    socket.on(
      "matchmaking:join",
      withAck(async ({ seats, deviceId }, ack) => {
        if (!Array.isArray(seats) || seats.length < 1 || seats.length > MATCHMAKING_SIZE) {
          return ack?.({ error: "Invalid seat request" });
        }

        const userId = await getAuthenticatedUserId(socket.handshake.headers.cookie);
        if (!userId) return ack?.({ error: "Sign in to find players online" });

        const resolved = await resolveSeatProfiles(seats, userId);
        if (resolved.error) return ack?.({ error: resolved.error });

        // Everything from here is synchronous (no `await`) so two
        // concurrent matchmaking:join calls can't both read "no open room"
        // and each create their own — Node's single-threaded event loop
        // runs this whole block to completion before the next queued
        // handler.
        let room = findOpenMatchRoom(getRoom);
        let created = false;
        if (!room) {
          room = createRoom({ maxPlayers: MATCHMAKING_SIZE });
          room.matchmaking = true;
          created = true;
        }
        const { error, seats: addedSeats } = addSeats(room, resolved.seats, {
          socketId: socket.id,
          deviceId,
          userId,
        });
        if (error) {
          if (created) deleteRoom(room.code);
          return ack?.({ error });
        }

        socket.join(room.code);
        if (created) markOpen(room.code);
        if (room.seats.length >= room.maxPlayers) markClosed(room.code);
        if (created && room.seats.length < room.maxPlayers) scheduleMatchmakingBotFill(room, 0);

        ack?.({
          roomCode: room.code,
          seats: addedSeats.map((s) => ({ id: s.id, token: s.token, armIndex: s.armIndex, name: s.name })),
        });
        broadcastRoom(room);
        setUserRoom(userId, room.code);
        broadcastPresence(userId).catch(logPresenceError("matchmaking:join presence update"));
        logEvent("matchmaking_joined", userId, { roomCode: room.code, seatCount: room.seats.length });
        trackPosthog("matchmaking_joined", { seatCount: room.seats.length }, userId);

        if (room.seats.length >= room.maxPlayers) {
          await attemptGameStart(room, (e) => io.to(room.code).emit("error", e));
        }
      })
    );

    socket.on(
      "room:join",
      withAck(async ({ roomCode, seats, deviceId, knownTokens }, ack) => {
        const room = getRoom(roomCode);
        if (!room) return ack?.({ error: "Room not found" });

        const reconnectUserId = await getAuthenticatedUserId(socket.handshake.headers.cookie);
        // A request that's actually asking to seat one or more NEW profiles
        // (e.g. the lobby's "Add Player") must not be swallowed by the
        // userId-based reconnect fallback below — that fallback exists so a
        // signed-in account can reclaim its OWN existing seat from a second
        // device with no local tokens, not to silently no-op an add-seat
        // request into "reconnect me to whichever seat I already have".
        const wantsNewSeats = Array.isArray(seats) && seats.length > 0;
        const reconnected = reconnectSeats(room, knownTokens || [], socket.id, wantsNewSeats ? null : reconnectUserId);
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
          // The host missed any join requests that came in while they were
          // disconnected — room:joinRequest:incoming is a one-shot push, so
          // replay whatever's still pending now that they're back.
          if (reconnectUserId && hostUserId(room) === reconnectUserId) {
            for (const [fromUserId, request] of room.pendingRequests) {
              socket.emit("room:joinRequest:incoming", { roomCode: room.code, fromUserId, fromName: request.fromName });
            }
          }
          return;
        }

        // Not a reconnect, and the roster's already locked in — appending a
        // brand-new seat isn't possible once the game's started. Point the
        // client at room:claimSeat instead, with whatever's claimable right
        // now (paused or removed-and-unclaimed seats — see claimableSeats).
        if (room.status !== "lobby") {
          return ack?.({
            midGame: true,
            roomCode: room.code,
            claimableSeats: claimableSeats(room).map((s) => ({ id: s.id, name: s.name })),
          });
        }

        if (!Array.isArray(seats) || seats.length < 1) {
          return ack?.({ error: "Invalid seat request" });
        }

        // No session cookie: this is a guest, identified by their device
        // rather than a real account (see resolveGuestSeats/guestKeyFor).
        // Room creation still requires signing in — only joining doesn't.
        const joinerKey = reconnectUserId ?? (deviceId ? guestKeyFor(deviceId) : null);
        if (!joinerKey) return ack?.({ error: "Sign in with Google to join a room" });

        const resolved = reconnectUserId
          ? await resolveSeatProfiles(seats, reconnectUserId)
          : resolveGuestSeats(seats);
        if (resolved.error) return ack?.({ error: resolved.error });

        // Pre-flight only — the real charge happens at game:start. A
        // free host's own additional seats need no check here (they're
        // covered by the host's own eventual charge); a host who currently
        // holds an active subscription or a credit is optimistically
        // treated as "will sponsor this game" and skips the check too. A
        // guest joiner has no account to meter, so it's never charged here
        // — the host's own charge at game:start covers the whole room.
        // A guest-hosted room's host has no account to check a charge
        // against at all (see checkGameStart) — never pre-flight-block a
        // joiner over it; the actual free/paid decision happens once, at
        // game:start.
        const hostId = hostUserId(room);
        if (reconnectUserId && reconnectUserId !== hostId && hostId) {
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

        // A genuinely new account (no seat here yet) needs host approval —
        // reconnecting to an owned seat (handled above), an already-seated
        // account adding another of its own profiles, and an account the
        // host explicitly invited by name (room:invite) all stay instant,
        // since there's nobody meaningful left to ask. A guest can never be
        // pre-invited (there's no account to invite ahead of time) and only
        // counts as "already seated" by matching its own prior guest seat on
        // this same device.
        const alreadySeated = reconnectUserId
          ? room.seats.some((s) => s.userId === reconnectUserId)
          : room.seats.some((s) => !s.userId && s.deviceId === deviceId);
        const preInvited = !!reconnectUserId && room.invitedUserIds.has(reconnectUserId);
        // A matchmaking room has no host curation to begin with (see the
        // matching canRemove gate in WaitingRoom.tsx) — a stranger opening
        // its join link is exactly what matchmaking is for, so there's
        // nobody meaningful to ask.
        if (!alreadySeated && !preInvited && !room.matchmaking) {
          if (room.seats.length + resolved.seats.length > room.maxPlayers) {
            return ack?.({ error: "Room is full" });
          }
          const fromName = resolved.seats.map((s) => s.name).join(", ");
          room.pendingRequests.set(joinerKey, { seats: resolved.seats, fromName });
          // A signed-in socket already joined its user channel on connect
          // (see io.on("connection") above) — a guest never did, so it has
          // to join its synthetic one now to receive the eventual approval.
          if (!reconnectUserId) socket.join(userChannel(joinerKey));
          if (hostId) {
            io.to(userChannel(hostId)).emit("room:joinRequest:incoming", {
              roomCode: room.code,
              fromUserId: joinerKey,
              fromName,
            });
          }
          return ack?.({ pending: true, roomCode: room.code });
        }

        const { error, seats: created } = addSeats(room, resolved.seats, {
          socketId: socket.id,
          deviceId,
          userId: reconnectUserId ?? null,
        });
        if (error) return ack?.({ error });
        if (reconnectUserId) room.invitedUserIds.delete(reconnectUserId);

        socket.join(room.code);
        ack?.({
          roomCode: room.code,
          seats: created.map((s) => ({ id: s.id, token: s.token, armIndex: s.armIndex, name: s.name })),
        });
        broadcastRoom(room);
        if (reconnectUserId) {
          setUserRoom(reconnectUserId, room.code);
          broadcastPresence(reconnectUserId).catch(logPresenceError("room:join presence update"));
        }
        const ownSeatProps = { roomCode: room.code, source: "own_seat" };
        logEvent("player_joined", reconnectUserId ?? null, ownSeatProps);
        trackPosthog("player_joined", ownSeatProps, reconnectUserId ?? null);
      })
    );

    socket.on("game:start", async ({ roomCode, seatId }) => {
      const room = getRoom(roomCode);
      if (!room) return socket.emit("error", { message: "Room not found" });
      if (room.hostSeatId !== seatId) {
        return socket.emit("error", { message: "Only the host can start the game" });
      }

      await attemptGameStart(room, (e) => socket.emit("error", e));
    });

    socket.on("game:rollDice", ({ roomCode, seatId, style }) => {
      const room = getRoom(roomCode);
      if (!room?.game) return;
      const current = room.game.seats[room.game.currentSeatIndex];
      if (current?.id !== seatId) {
        return socket.emit("error", { message: "Not your turn" });
      }
      // Purely a presentation flourish (see Dice.tsx) — relayed to everyone
      // else in the room, always (not just for "flick"), so a later plain
      // tap can't be misread as still using a stale "flick" from an earlier
      // roll. Sent ahead of the game:update below so it's more likely to
      // land before the matching rollSeq bump. Never affects the actual roll.
      socket.to(roomCode).emit("game:diceThrow", { style: style === "flick" ? "flick" : "tap" });
      room.game = rollDice(room.game);
      broadcastGame(room);
      finishRoomIfNeeded(room);
      scheduleBotTurn(room);
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
      finishRoomIfNeeded(room);
      scheduleBotTurn(room);
    });

    // Ephemeral emoji/sticker reaction — fire-and-forget, no game-state
    // change, just relayed to everyone else currently viewing this room.
    // Payload shape is validated (not just trusted) since a hand-crafted
    // client could otherwise broadcast arbitrary strings/paths to others.
    socket.on("game:reaction", ({ roomCode, reaction } = {}) => {
      if (!getRoom(roomCode) || !socket.rooms.has(roomCode)) return;
      if (reaction?.kind === "emoji" && typeof reaction.value === "string" && reaction.value.length <= 8) {
        socket.to(roomCode).emit("game:reaction", { kind: "emoji", value: reaction.value });
      } else if (
        reaction?.kind === "sticker" &&
        typeof reaction.src === "string" &&
        reaction.src.startsWith("/brand/stickers/")
      ) {
        socket.to(roomCode).emit("game:reaction", {
          kind: "sticker",
          src: reaction.src,
          alt: typeof reaction.alt === "string" ? reaction.alt.slice(0, 60) : "",
        });
      }
    });

    // Ephemeral nudges a non-host can send in a matchmaking room — the host
    // still has to act on it via their own existing Start/Fill-bots
    // buttons, this is purely a relayed toast, no server-side privileged
    // action or persisted state.
    socket.on("room:requestStart", ({ roomCode, fromName } = {}) => {
      if (typeof roomCode !== "string" || typeof fromName !== "string" || !socket.rooms.has(roomCode)) return;
      socket.to(roomCode).emit("room:requestStart", { fromName: fromName.slice(0, 20) });
    });
    socket.on("room:requestBotFill", ({ roomCode, fromName } = {}) => {
      if (typeof roomCode !== "string" || typeof fromName !== "string" || !socket.rooms.has(roomCode)) return;
      socket.to(roomCode).emit("room:requestBotFill", { fromName: fromName.slice(0, 20) });
    });

    socket.on(
      "room:fillBots",
      withAck(async ({ roomCode, seatId }, ack) => {
        const room = getRoom(roomCode);
        if (!room) return ack?.({ error: "Room not found" });
        // Host-ness proven by seatId, same as game:start — a guest host has
        // no account for a cookie-based check to compare against.
        if (!room.hostSeatId || room.hostSeatId !== seatId) {
          return ack?.({ error: "Only the host can add bots" });
        }

        const { error } = fillWithBots(room);
        if (error) return ack?.({ error });

        broadcastRoom(room);
        ack?.({});
      })
    );

    socket.on(
      "room:removeSeat",
      withAck(async ({ roomCode, seatId, callerSeatId }, ack) => {
        const callerUserId = await getAuthenticatedUserId(socket.handshake.headers.cookie);
        const room = getRoom(roomCode);
        if (!room) return ack?.({ error: "Room not found" });
        if (!callerUserId && !callerSeatId) return ack?.({ error: "Sign in with Google to do that" });

        const targetSeat = room.seats.find((s) => s.id === seatId);
        if (!targetSeat) return ack?.({ error: "Player not found" });
        if (targetSeat.id === room.hostSeatId) {
          return ack?.({ error: "The host can't remove their own seat" });
        }
        // Host-ness/own-seat-ness by account for a signed-in caller, or by
        // seatId for a guest (no account to check against — a guest always
        // has exactly one seat, so "is this my seat" reduces to an id
        // match, same as fillBots proves host-ness).
        const isHostCaller = callerUserId ? hostUserId(room) === callerUserId : room.hostSeatId === callerSeatId;

        // Lobby: the seat is gone entirely, same as always. Mid-game: the
        // seat stays visible (dimmed, no crown) and becomes claimable —
        // see room:claimSeat — so their socket isn't kicked out the way a
        // lobby removal's is.
        if (room.status === "lobby") {
          // The host can remove anyone but themselves; any other signed-in
          // account can only remove seats it added itself (e.g. a second
          // profile seated from its own device) — matches the canRemove
          // check in WaitingRoom.tsx. Mid-game removal below stays
          // host-only — kicking a paused player is more consequential.
          const isOwnSeat = callerUserId ? targetSeat.userId === callerUserId : targetSeat.id === callerSeatId;
          if (!isHostCaller && !isOwnSeat) {
            return ack?.({ error: "You can only remove your own players" });
          }

          const removedSeat = targetSeat;
          const { error } = removeSeat(room, seatId);
          if (error) return ack?.({ error });

          // Broadcast the final state first, while the removed player's
          // socket is still in this room's channel — that's what makes
          // their client show "You're not seated in this room" immediately
          // (see RoomPageClient.tsx's reactive myRelevantSeats check).
          // Evicting the socket before this broadcast (the previous order
          // here) meant it never received the update reflecting its own
          // removal, and the UI stayed stale until a manual reload forced
          // a fresh room:join. Only evict afterward — and only if that
          // socket doesn't still legitimately own another seat here (e.g.
          // the host removing a second profile added from their own
          // device) — don't evict it out from under its own remaining seat.
          broadcastRoom(room);
          ack?.({});

          const socketStillSeated = room.seats.some((s) => s.socketId === removedSeat?.socketId);
          if (removedSeat?.socketId && !socketStillSeated) {
            io.sockets.sockets.get(removedSeat.socketId)?.leave(room.code);
          }

          if (removedSeat?.userId) {
            clearUserRoom(removedSeat.userId, room.code);
            broadcastPresence(removedSeat.userId).catch(logPresenceError("room:removeSeat presence update"));
          }
          return;
        }

        if (!isHostCaller) return ack?.({ error: "Only the host can remove a player" });

        const { error } = midGameRemoveSeat(room, seatId);
        if (error) return ack?.({ error });

        broadcastRoom(room);
        broadcastGame(room);
        finishRoomIfNeeded(room);
        scheduleBotTurn(room);
        ack?.({});
      })
    );

    socket.on(
      "room:suspendSeat",
      withAck(async ({ roomCode, seatId, callerSeatId }, ack) => {
        const room = getRoom(roomCode);
        if (!room) return ack?.({ error: "Room not found" });
        // Host-ness proven by seatId, same as fillBots/game:start — a guest
        // host has no account for a cookie-based check to compare against.
        if (!room.hostSeatId || room.hostSeatId !== callerSeatId) {
          return ack?.({ error: "Only the host can pause a player" });
        }

        const { error } = midGameSuspendSeat(room, seatId);
        if (error) return ack?.({ error });

        broadcastGame(room);
        scheduleBotTurn(room);
        ack?.({});
      })
    );

    socket.on(
      "room:resumeSeat",
      withAck(async ({ roomCode, seatId, callerSeatId }, ack) => {
        const room = getRoom(roomCode);
        if (!room) return ack?.({ error: "Room not found" });
        if (!room.hostSeatId || room.hostSeatId !== callerSeatId) {
          return ack?.({ error: "Only the host can resume a player" });
        }

        const { error } = midGameResumeSeat(room, seatId);
        if (error) return ack?.({ error });

        broadcastGame(room);
        ack?.({});
      })
    );

    socket.on(
      "room:endGame",
      withAck(async ({ roomCode, seatId }, ack) => {
        const room = getRoom(roomCode);
        if (!room) return ack?.({ error: "Room not found" });
        if (!room.hostSeatId || room.hostSeatId !== seatId) {
          return ack?.({ error: "Only the host can end the game" });
        }
        // A matchmaking host can only end the game outright once every
        // other seat is a bot — with a real opponent still seated, ending
        // would cut off someone who didn't choose to stop. The host can
        // leave instead (room:leave), which hands the game to whoever's
        // left rather than stopping it for them too.
        if (room.matchmaking && room.seats.some((s) => s.id !== seatId && !s.bot)) {
          return ack?.({ error: "You can't end this game while another player is in it — leave instead." });
        }

        const { error } = midGameEndGame(room);
        if (error) return ack?.({ error });

        broadcastGame(room);
        finishRoomIfNeeded(room);
        ack?.({});
      })
    );

    socket.on(
      "room:transferHost",
      withAck(async ({ roomCode, toSeatId, callerSeatId }, ack) => {
        const room = getRoom(roomCode);
        if (!room) return ack?.({ error: "Room not found" });
        if (!room.hostSeatId || room.hostSeatId !== callerSeatId) {
          return ack?.({ error: "Only the host can hand off host" });
        }

        const { error } = transferHost(room, toSeatId);
        if (error) return ack?.({ error });

        broadcastRoom(room);
        ack?.({});
      })
    );

    socket.on(
      "room:claimSeat",
      withAck(async ({ roomCode, seatId, profileId }, ack) => {
        const callerUserId = await getAuthenticatedUserId(socket.handshake.headers.cookie);
        if (!callerUserId) return ack?.({ error: "Sign in with Google to join" });

        const room = getRoom(roomCode);
        if (!room?.game) return ack?.({ error: "Game not in progress" });
        if (room.seats.some((s) => s.userId === callerUserId && s.id !== seatId)) {
          return ack?.({ error: "You're already playing in this room" });
        }
        if (!claimableSeats(room).some((s) => s.id === seatId)) {
          return ack?.({ error: "That seat isn't available" });
        }

        const resolved = await resolveSeatProfiles([{ profileId }], callerUserId);
        if (resolved.error) return ack?.({ error: resolved.error });
        const [{ name }] = resolved.seats;

        // Same rule as a normal join: already being in this room makes it
        // self-service; a brand-new account needs host approval.
        const alreadySeated = room.seats.some((s) => s.userId === callerUserId);
        if (!alreadySeated) {
          const hostId = hostUserId(room);
          room.pendingRequests.set(callerUserId, { seats: [{ name, profileId }], fromName: name, claimSeatId: seatId });
          if (hostId) {
            io.to(userChannel(hostId)).emit("room:joinRequest:incoming", { roomCode: room.code, fromUserId: callerUserId, fromName: name });
          }
          return ack?.({ pending: true, roomCode: room.code });
        }

        const claimed = claimSeat(room, seatId, { name, profileId, userId: callerUserId, socketId: socket.id, deviceId: null });
        if (claimed.error) return ack?.({ error: claimed.error });

        socket.join(room.code);
        ack?.({
          roomCode: room.code,
          seats: [{ id: claimed.seat.id, token: claimed.seat.token, armIndex: claimed.seat.armIndex, name: claimed.seat.name }],
        });
        broadcastRoom(room);
        broadcastGame(room);
      })
    );

    socket.on(
      "room:rematch",
      withAck(async ({ roomCode, seatId }, ack) => {
        const room = getRoom(roomCode);
        if (!room) return ack?.({ error: "Room not found" });
        if (room.status !== "finished") return ack?.({ error: "This game hasn't finished yet" });
        if (!room.hostSeatId || room.hostSeatId !== seatId) {
          return ack?.({ error: "Only the host can start a rematch" });
        }
        const hostSeat = room.seats.find((s) => s.id === seatId);

        // Everyone who actually won plus the one natural loser — not
        // anyone the host removed mid-game (see rematchEligibleSeats).
        const eligible = rematchEligibleSeats(room);
        if (eligible.length < 2) return ack?.({ error: "Not enough players left for a rematch" });

        const newRoom = createRoom({ maxPlayers: room.maxPlayers });
        const newSeatByOldSeatId = new Map();
        for (const seat of eligible) {
          // Seated with no live socket yet — each client binds its own
          // once it navigates in and reconnects with the fresh token
          // pushed below, same as any other approved join.
          const { error: seatError, seats: addedSeats } = addSeats(
            newRoom,
            [{ name: seat.name, profileId: seat.profileId }],
            { socketId: null, deviceId: seat.deviceId, userId: seat.userId, bot: seat.bot }
          );
          if (seatError) {
            deleteRoom(newRoom.code);
            return ack?.({ error: seatError });
          }
          newSeatByOldSeatId.set(seat.id, addedSeats[0]);
        }
        // Whoever triggered the rematch stays host, regardless of seating
        // order (which may not match the old room's host if it had been
        // transferred) — matched by account for a signed-in host, or by
        // device for a guest host (no account to match on).
        const newHostSeat = hostSeat.userId
          ? newRoom.seats.find((s) => s.userId === hostSeat.userId)
          : newRoom.seats.find((s) => !s.userId && s.deviceId === hostSeat.deviceId);
        if (newHostSeat) newRoom.hostSeatId = newHostSeat.id;

        // Charged exactly like a fresh game:start — a rematch is a new
        // game, and can still be blocked per-seat (e.g. someone's out of
        // free games today).
        const charged = await checkGameStart(newRoom);
        if (!charged.ok) {
          deleteRoom(newRoom.code);
          return ack?.({ error: `${charged.name ?? "A player"} can't play right now — free games used up today` });
        }
        newRoom.sponsored = charged.sponsored;

        const { error: startError } = startGame(newRoom);
        if (startError) {
          deleteRoom(newRoom.code);
          return ack?.({ error: startError });
        }
        scheduleBotTurn(newRoom);

        const rematchProps = {
          roomCode: newRoom.code,
          playerCount: newRoom.seats.length,
          source: charged.source,
          sponsored: charged.sponsored,
          rematchOf: room.code,
        };
        logEvent("game_started", hostUserId(newRoom), rematchProps);
        trackPosthog("game_started", rematchProps, hostUserId(newRoom));

        // Push each distinct account's new seats directly — mirrors how
        // room:joinRequest:approve already pushes seats to a specific
        // user — so nobody has to manually rejoin, their client just
        // navigates straight into the new room.
        const seatsByUser = new Map();
        for (const seat of newRoom.seats) {
          if (!seat.userId) continue;
          const list = seatsByUser.get(seat.userId) ?? [];
          list.push({ id: seat.id, token: seat.token, armIndex: seat.armIndex, name: seat.name });
          seatsByUser.set(seat.userId, list);
        }
        for (const [userId, seatsForUser] of seatsByUser) {
          io.to(userChannel(userId)).emit("room:rematchReady", { roomCode: newRoom.code, seats: seatsForUser });
        }

        // Guests have no durable per-account channel to push into — reach
        // them on whatever live socket they're still holding open on the
        // old room's finished-game screen instead.
        const guestSeatsBySocket = new Map();
        for (const oldSeat of eligible) {
          if (oldSeat.userId || !oldSeat.socketId) continue;
          const newSeat = newSeatByOldSeatId.get(oldSeat.id);
          if (!newSeat) continue;
          const list = guestSeatsBySocket.get(oldSeat.socketId) ?? [];
          list.push({ id: newSeat.id, token: newSeat.token, armIndex: newSeat.armIndex, name: newSeat.name });
          guestSeatsBySocket.set(oldSeat.socketId, list);
        }
        for (const [socketId, seatsForSocket] of guestSeatsBySocket) {
          io.to(socketId).emit("room:rematchReady", { roomCode: newRoom.code, seats: seatsForSocket });
        }

        ack?.({ roomCode: newRoom.code });
      })
    );

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
