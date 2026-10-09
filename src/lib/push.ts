import webpush from "web-push";
import { prisma } from "@/lib/prisma";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT as string,
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );
  configured = true;
}

type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

// Sends a Web Push notification to every subscribed device/browser for a
// user, pruning any subscription the push service reports as gone (404/410
// — uninstalled, cleared site data, or revoked permission) so it doesn't
// keep getting retried forever. See src/server/push.js for the
// server.js-side counterpart (same shape, separate Prisma client — server.js
// isn't part of the Next.js module graph).
export async function sendPushToUser(userId: string, { title, body, url, tag }: PushPayload) {
  ensureConfigured();
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({ title, body, url, tag });
  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("Web push send failed:", err);
        }
      }
    }),
  );
}
