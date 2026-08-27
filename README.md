# Ludo Multiplayer

A mobile-first, browser-based multiplayer Ludo. Create a room or join one with
a short code — 2 to 4 players total, split across devices however you like:
one phone with all 4 seats, four separate devices with one seat each, or any
mix in between (e.g. one device holding 2 seats, another holding 2). Everyone
gets the same experience regardless of how seats are distributed.

Signing in with Google is required, but it's a *device* login, not a player
one (see "Accounts, players & history" below for setup): the person holding
a phone signs in once, then seats **player profiles** — lightweight, reusable
identities like "Mom" or "Kid 1" — into the room's seats, so a family or
group can play from one signed-in phone without everyone needing their own
Google account. Colors are assigned automatically in join order (not
picked), so a partially-filled board always blanks out symmetrically
instead of depending on who grabbed which color.

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

## Accounts, players & history

Required — without this set up, no one can create or join a room. Setup:

1. **Postgres.** Any Postgres instance works. Locally:
   `docker run -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres`. On
   Railway, add the "Postgres" plugin to your project — it injects
   `DATABASE_URL` automatically.
2. **Google OAuth client.** Create one at
   [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
   (OAuth client ID, type "Web application"), with an authorized redirect
   URI of `<your-origin>/api/auth/callback/google` (e.g.
   `http://localhost:3001/api/auth/callback/google` for local dev).
3. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL`,
   `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET` (generate with
   `openssl rand -base64 33`), and `AUTH_URL` — set to the exact origin
   the app is reachable at (`http://localhost:3001` locally, your real
   domain in production). This one's not optional: since `server.js` is a
   custom Node server rather than `next dev`/`next start`, Next can't
   reliably derive its own origin from the raw request, so without
   `AUTH_URL` Google sign-in fails with `redirect_uri_mismatch`. In
   production on a non-Vercel/Cloudflare host (e.g. Railway), also set
   `AUTH_TRUST_HOST=true`.
4. Run `npm run db:migrate:dev` to create the tables (`npm run db:migrate`
   — i.e. `prisma migrate deploy` — in production/CI instead).

**Google login = device, not player.** Signing in identifies whoever's
holding the device, not who's playing — that's what a **player profile**
(`/profiles`, "Manage players") is for. A profile is just a name + email;
your own shows up automatically (created from your Google identity on
first sign-in) and can't be removed. Add more inline while creating/joining
a room (each `SeatRow` has a "+ Add new player…" option) or from
`/profiles` directly. Profiles are deduplicated **by email**, so the same
person picked from two different signed-in devices is the same profile —
their stats stay unified, and a profile already seated in a room can't be
added to a second seat in it. `/history` shows games any of your linked
profiles played in; `/leaderboard` ranks every profile by games played and
wins/losses.

**Reconnect** also recognizes the device login: besides the usual
per-seat `localStorage` token (same browser), a signed-in device can
reclaim any seat it originally added from a *different* browser/device
too, as long as it signs in as the same Google account — useful if a
phone dies mid-game and play continues from a laptop.

`/create`, `/join`, `/room/*`, `/profiles`, and `/leaderboard` all redirect
signed-out visitors to `/`; the Socket.IO handlers also verify the session
cookie server-side before creating or joining a room (and re-verify every
requested player profile actually belongs to that device login), so none
of this is just a UI-level restriction.

## Architecture

- **Server**: a custom Node server (`server.js`) running Next.js and
  Socket.IO on one HTTP server/port. Room and game state live in memory in
  that process — a restart drops in-progress games, but the Postgres-backed
  accounts and game history below survive it.
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
