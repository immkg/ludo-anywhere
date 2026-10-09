// Minimal Web Push service worker — no offline caching strategy, just
// showing/handling push notifications. Registered from
// src/hooks/usePushNotifications.ts.

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const { title = "MyLudo", body = "", url = "/", tag } = data;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      tag,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(self.clients.openWindow(url));
});
