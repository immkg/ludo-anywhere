# Ludo Multiplayer

A mobile-first, browser-based multiplayer Ludo. Create a room or join one with
a short code — 2 to 6 players total, split across devices however you like:
one phone with all 6 seats, six separate devices with one seat each, or any
mix in between (e.g. one device holding 2 seats, another holding 4). Everyone
gets the same experience regardless of how seats are distributed.

No accounts — you just pick a name and color when you create or join a room.

## Board

This isn't the classic 4-arm Ludo cross. To give up to 6 players a fully
symmetric, fair board, it's a 6-arm hexagonal layout: a shared 78-cell outer
ring (13 cells per arm), with each of the 6 colors owning a home column and a
4-token yard. The relative-position math for a single token (yard → ring →
home column → finished) mirrors classic Ludo rules exactly; only the number
of arms and the ring length are generalized from 4/52 to 6/78. See
`src/game/board.js` for the geometry and `src/game/engine.js` for the rules
(capturing, safe cells, exact-count-to-finish, extra turns on a 6, three-6s
forfeits, auto-skip when a roll leaves no legal move).

## Running it

```bash
npm install
npm run dev
```

Requires **Node 20.9+** (see `.nvmrc`; run `nvm use` if you have nvm). Then
open the URL it prints. To test the multi-device experience, open that same
URL from another device on the same network (use your machine's LAN IP, not
`localhost`) — the client always connects back to whatever origin the page
was loaded from, so this works without any config.

`npm run build` / `npm start` for a production build.

## Architecture

- **Server**: a custom Node server (`server.js`) running Next.js and
  Socket.IO on one HTTP server/port. Room and game state live in memory in
  that process — there's no database, since play is anonymous and
  session-scoped.
- **Because of that**, this needs a host that runs a persistent Node
  process (Railway, Render, Fly.io, a plain VPS, etc.) — **not** Vercel's
  serverless functions, which can't hold a long-lived Socket.IO connection.
- **Reconnect**: each seat gets a random token, stored in the browser's
  `localStorage` under the room code. Refreshing the page (or a brief
  disconnect) silently reclaims your seat via that token instead of losing
  your spot or your tokens mid-game.
- **Game engine** (`src/game/`) is plain, framework-agnostic JS — pure
  functions, no React/Socket.IO dependency — so the exact same code runs on
  the server (authoritative) and in the browser (to highlight which of your
  tokens have a legal move before you tap).
