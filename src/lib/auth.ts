import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/entitlements";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  events: {
    // The device-login's own Google identity doubles as their first player
    // profile, so they don't have to add themselves manually before playing.
    // Runs on every sign-in (not just account creation) so it also
    // backfills accounts that existed before player profiles did.
    async signIn({ user }) {
      if (!user.id || !user.email) return;
      const userId = user.id;
      const email = user.email.toLowerCase();
      const profile = await prisma.playerProfile.upsert({
        where: { email },
        update: {},
        create: { name: user.name || email, email },
      });
      await prisma.userProfile.upsert({
        where: { userId_profileId: { userId, profileId: profile.id } },
        update: {},
        create: { userId, profileId: profile.id },
      });
      logEvent("user_signed_in", userId);
    },
    // Fires exactly once, when the PrismaAdapter inserts a brand-new User
    // row — the actual acquisition moment, distinct from signIn above
    // (which fires on every login of an existing account too).
    async createUser({ user }) {
      if (user.id) logEvent("user_signed_up", user.id);
    },
  },
});
