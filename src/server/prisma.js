import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// server.js isn't part of the Next.js module graph, so it can't share the
// client instance from src/lib/prisma.ts — this is its own single instance.
//
// Built lazily (not at module load) because this module gets statically
// imported at the top of server.js, before `next({...})` is ever called —
// and it's that call that triggers Next's .env.local loading. Reading
// process.env.DATABASE_URL eagerly here would run before it's populated,
// silently handing pg an empty connection string.
let client;

export function getPrisma() {
  if (!client) {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    client = new PrismaClient({ adapter });
  }
  return client;
}
