# Ludo Multiplayer

A mobile-first, browser-based multiplayer Ludo. Create a room or join one with
a short code — 2 to 4 players total, split across devices however you like:
one phone with all 4 seats, four separate devices with one seat each, or any
mix in between (e.g. one device holding 2 seats, another holding 2). Everyone
gets the same experience regardless of how seats are distributed.

No accounts — just a name per seat. Colors are assigned automatically in join
order (not picked), so a partially-filled board always blanks out
symmetrically instead of depending on who grabbed which color.

## Board

The classic 4-arm cross, laid out on the real 15×15 grid every
physical/digital Ludo board uses (straight runs, 90° turns hugging the
edge, solid corner quadrants). With fewer than 4 players, the unused arms
just sit dimmed/empty rather than reshaping the board. See
`src/game/board.js` for the geometry and `src/game/engine.js` for the rules
(capturing, safe cells, exact-count-to-finish, extra turns on a 6, three-6s
forfeits, auto-skip when a roll leaves no legal move).

The board renders on an HTML5 canvas (via `react-konva`), not SVG — gives
glossy gradient tokens, drop shadows, and smooth slide animations without a
DOM node per cell. `Board.tsx` is loaded as a client-only dynamic import
since Konva needs a real `<canvas>`/`window`, unavailable during SSR.

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
  tokens have a legal move before you tap, and to compute board geometry for
  rendering).
