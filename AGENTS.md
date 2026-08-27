# MyLudo

Live at myludo.life. Mobile-first, browser-based multiplayer Ludo. 2–4 players, join a room with
a short code. Google sign-in is required, but as a *device* login — actual
players are separate profile records seated into rooms (see "Accounts,
players & history" below). See `README.md` for the full player-facing
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
  memory in that process (dropped on restart) — this means it needs a host
  that runs a persistent Node process (Railway, Render, Fly.io, a VPS,
  etc.), **not** Vercel serverless functions.
- **Accounts vs. players (required)**: Google sign-in via Auth.js v5
  (`src/lib/auth.ts`) gates room creation/joining — there's no anonymous
  path. But the signed-in Google account (`User`) is a *device login*, not
  a player: the things actually seated in a room, tracked in `/history`,
  and ranked on `/leaderboard` are `PlayerProfile` records — lightweight
  name+email identities. `UserProfile` is the join table recording which
  profiles a given device login has used (its picker roster in
  `useProfiles`/`SeatRow`/`ProfileManager`); the same profile can appear on
  many device logins' rosters (dedup key: `PlayerProfile.email`, lowercased
  — see `src/app/api/profiles/route.ts`), so the same person's stats stay
  unified across devices. Every device login gets its own matching profile
  auto-created/linked via the `signIn` event in `src/lib/auth.ts` (runs on
  every login, not just account creation, so it backfills pre-existing
  accounts too); that self-profile can't be removed from the roster
  (enforced in `src/app/api/profiles/[profileId]/route.ts`).
  Enforced server-side in three places, since a socket client or direct
  API call could bypass the UI entirely: `/create`, `/join`,
  `/room/[roomId]`, `/profiles`, `/leaderboard` are server components that
  `redirect("/")` when `auth()` finds no session (`src/app/*/page.tsx`);
  `server.js`'s `room:create`/`room:join` handlers verify the session
  cookie against the DB via `getAuthenticatedUserId()`
  (`src/server/auth.js`) rather than trusting any client-supplied user id;
  and `resolveSeatProfiles()` (`src/server/profiles.js`) re-verifies every
  requested `profileId` actually belongs to that device login's roster
  before seating it (rejecting id-guessing) and resolves the seat's
  canonical `name` from the profile record rather than trusting the
  client's. `addSeats` (`src/server/rooms.js`) also rejects seating the
  same `profileId` twice in one room (own request or already-seated).
  Needs Postgres + Prisma (see below) since these records need to survive
  process restarts, unlike room state.
- **Reconnect** (`src/server/rooms.js`): besides the existing per-seat
  token in `localStorage` (same browser), `reconnectSeats` also matches a
  seat by the connecting socket's authenticated `userId` — so the device
  login that added a seat can reclaim it from a *different* browser/device
  too (e.g. phone dies mid-game, continue from a laptop signed into the
  same Google account), not just the exact browser that created it.
- **Database**: Postgres via Prisma (`prisma/schema.prisma`), using the
  `@prisma/adapter-pg` driver adapter — Prisma 7 requires an explicit
  adapter rather than reading `DATABASE_URL` off the schema `datasource`
  block directly (connection config now lives in `prisma.config.ts`).
  `src/lib/prisma.ts` is the shared client (Next.js/route handlers,
  `/history`, `/leaderboard`, `/api/profiles/*`); `src/server/prisma.js`
  has its own client instance for `server.js`, which isn't part of the
  Next.js module graph (`history.js`, `auth.js`, and `profiles.js` there
  all import it). A finished game is persisted from `server.js` when
  `game.status === "finished"` (`Game`/`GamePlayer` models); `GamePlayer`
  carries `profileId` (nullable only for schema flexibility — e.g. if a
  `PlayerProfile` row is later deleted — not expected in normal operation).
  Run `npm run db:migrate:dev` locally after schema changes (needs a
  `DATABASE_URL`), `npm run db:migrate` (i.e. `prisma migrate deploy`) in
  production.
- **Game engine** (`src/game/`): plain, framework-agnostic JS — pure
  functions, no React/Socket.IO dependency. The same code runs
  authoritatively on the server and in the browser (for legal-move
  highlighting and board geometry). `src/game/board.js` has the board
  geometry, `src/game/engine.js` has the rules (capturing, safe cells,
  exact-count-to-finish, extra turns on a 6, three-6s forfeit, auto-skip).
- **Board rendering**: `src/components/game/Board.tsx` renders on an HTML5
  canvas via `react-konva` (not SVG or DOM nodes per cell), loaded as a
  client-only dynamic import since Konva needs `window`/`<canvas>` and
  can't run during SSR.
- Directory layout: `src/app` (Next.js routes: `/`, `/create`, `/join`,
  `/room/[roomId]`, `/history`, `/leaderboard`, `/profiles`,
  `/api/profiles`, `/api/profiles/[profileId]`), `src/components`
  (`game/`, `lobby/` — includes `ProfileManager.tsx`, `SeatRow.tsx` (the
  per-seat profile picker), `RoomPageClient.tsx` — `ui/`, `auth/`),
  `src/server` (Socket.IO/room-management server code, plus `prisma.js`,
  `auth.js` for session verification, `profiles.js` for resolving/
  verifying seat profile requests, and `history.js` for persisting
  finished games), `src/hooks` (includes `useProfiles.ts`), `src/store`
  (zustand), `src/lib` (includes `auth.ts`/`prisma.ts`), `src/types`
  (includes `profile.ts`).

## Environment variables

Required for anyone to create or join a room — with none set, `/create`,
`/join`, and the Socket.IO room handlers all reject requests (no anonymous
fallback). See `.env.example` for the full list and where each value comes
from: `DATABASE_URL` (Postgres), `AUTH_GOOGLE_ID` /
`AUTH_GOOGLE_SECRET` (Google OAuth client), `AUTH_SECRET` (session signing
— generate with `openssl rand -base64 33`, needed even in local dev or
Auth.js errors on every `/api/auth/*` request), and `AUTH_URL` (the exact
origin the app is reachable at, e.g. `http://localhost:3001` or the real
production domain).

`AUTH_URL` isn't optional despite what its name suggests — `server.js` is a
custom Node server (`next({ dev })`, no `hostname`/`port` passed), and in
that setup Next.js can't reliably derive its own origin from the raw
incoming request, so `next-auth`'s route handler falls back to an internal
default when building OAuth redirect/callback URLs (observed: `next dev`'s
canonical default port 3000 locally regardless of the real port; on
Railway, `localhost:<internal-port>`) instead of the real one — breaking
Google sign-in with `redirect_uri_mismatch`. **Do not "fix" this by passing
`hostname`/`port` to `next({...})` instead** — that was tried, and while it
happens to produce a plausible-looking origin for one specific access
pattern in dev, it hijacks request-URL reconstruction unconditionally
(including in production, where it produced `localhost:8080` — the
internal container port — instead of the public Railway domain, breaking
prod OAuth entirely). `AUTH_URL` overrides the origin correctly regardless
of this quirk (`reqWithEnvURL` in `next-auth/lib/env.js`), which is why
it's the fix. Setting it also implies `trustHost`, but set
`AUTH_TRUST_HOST=true` too in production on any host that isn't
Vercel/Cloudflare Pages (e.g. Railway) — harmless belt-and-suspenders.

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
