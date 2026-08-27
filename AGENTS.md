# Ludo Multiplayer

Mobile-first, browser-based multiplayer Ludo. 2–4 players, no accounts, join
a room with a short code. See `README.md` for the full player-facing
description of gameplay and board rules.

## Running & building

```bash
npm install
npm run dev     # nodemon + custom server (server.js), hot-reloads on server.js/src/server/src/game changes
npm run build    # next build
npm start        # NODE_ENV=production node server.js
```

Requires Node 20.9+ (`.nvmrc`).

## Architecture

- **Server**: `server.js` is a custom Node server running Next.js and
  Socket.IO on a single HTTP server/port. Room and game state live in
  memory in that process — no database. This means it needs a host that
  runs a persistent Node process (Railway, Render, Fly.io, a VPS, etc.),
  **not** Vercel serverless functions.
- **Game engine** (`src/game/`): plain, framework-agnostic JS — pure
  functions, no React/Socket.IO dependency. The same code runs
  authoritatively on the server and in the browser (for legal-move
  highlighting and board geometry). `src/game/board.js` has the board
  geometry, `src/game/engine.js` has the rules (capturing, safe cells,
  exact-count-to-finish, extra turns on a 6, three-6s forfeit, auto-skip).
- **Reconnect**: each seat gets a random token stored in `localStorage`
  under the room code, so a refresh or brief disconnect silently reclaims
  the seat instead of losing it.
- **Board rendering**: `src/components/game/Board.tsx` renders on an HTML5
  canvas via `react-konva` (not SVG or DOM nodes per cell), loaded as a
  client-only dynamic import since Konva needs `window`/`<canvas>` and
  can't run during SSR.
- Directory layout: `src/app` (Next.js routes: `/`, `/create`, `/join`,
  `/room/[roomId]`), `src/components` (`game/`, `lobby/`, `ui/`),
  `src/server` (Socket.IO/room-management server code), `src/hooks`,
  `src/store` (zustand), `src/lib`, `src/types`.

## Conventions

- TypeScript with `strict: true`; path alias `@/*` → `src/*`.
- Linting via `eslint-config-next` (core-web-vitals + typescript); run
  `npx eslint .` before considering a change done.
- `prettier` is a dependency but there's no committed config — match the
  surrounding file's formatting.
- Keep `src/game/*` free of React/Socket.IO imports — it must stay usable
  from both the server and the client unchanged.

## This Next.js version may differ from training data

This repo pins `next@16.2.2`, newer than what most models were trained on.
APIs/conventions may have changed. Docs are vendored at
`node_modules/next/dist/docs/` — check there if something behaves
unexpectedly or an API looks unfamiliar, rather than assuming the code is
wrong.
