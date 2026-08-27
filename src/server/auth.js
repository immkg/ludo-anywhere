import { getPrisma } from "./prisma.js";

// Auth.js v5 cookie name (secure prefix is used automatically over https).
const SESSION_COOKIE_NAMES = ["__Secure-authjs.session-token", "authjs.session-token"];

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    cookies[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return cookies;
}

// Resolves the real signed-in user for a socket connection by validating its
// session cookie against the DB — a client-supplied userId can't be trusted,
// since anyone can talk to the socket directly without going through the UI.
export async function getAuthenticatedUserId(cookieHeader) {
  const cookies = parseCookies(cookieHeader);
  const token = SESSION_COOKIE_NAMES.map((name) => cookies[name]).find(Boolean);
  if (!token) return null;

  const session = await getPrisma().session.findUnique({ where: { sessionToken: token } });
  if (!session || session.expires < new Date()) return null;
  return session.userId;
}
