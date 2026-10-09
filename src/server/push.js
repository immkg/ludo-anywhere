import webpush from "web-push";
import { getPrisma } from "./prisma.js";

// Configured lazily, same reason as getPrisma() above — this module is
// statically imported at the top of server.js, before `next({...})` has
// triggered .env.local loading, so reading process.env eagerly here would
// capture an empty VAPID key.
let configured = false;

function ensureConfigured() {
  if (configured) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  configured = true;
}

// Sends a Web Push notification to every subscribed device/browser for a
// user, pruning any subscription the push service reports as gone (404/410
// — uninstalled, cleared site data, or revoked permission) so it doesn't
// keep getting retried forever.
export async function sendPushToUser(userId, { title, body, url, tag }) {
  ensureConfigured();
  const prisma = getPrisma();
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({ title, body, url, tag });
  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("Web push send failed:", err);
        }
      }
    }),
  );
}
