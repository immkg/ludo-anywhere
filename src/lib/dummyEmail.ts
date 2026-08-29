// Fallback email for players added without one — must still satisfy the
// server's email regex (src/app/api/profiles/route.ts).
const DUMMY_EMAIL_DOMAIN = "guest.myludo.life";

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return slug || "player";
}

// A fresh suffix per add-player session keeps two blank-named adds from
// colliding on the same generated address (email is a unique upsert key).
export function randomEmailSuffix(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function generateDummyEmail(name: string, suffix: string): string {
  return `${slugify(name)}.${suffix}@${DUMMY_EMAIL_DOMAIN}`;
}
