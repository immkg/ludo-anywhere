import { describe, it, expect, vi, beforeEach } from "vitest";

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();
vi.mock("web-push", () => ({
  default: { setVapidDetails, sendNotification },
}));

const findMany = vi.fn();
const deleteSub = vi.fn();
vi.mock("./prisma.js", () => ({
  getPrisma: () => ({
    pushSubscription: { findMany, delete: deleteSub },
  }),
}));

const { sendPushToUser } = await import("./push.js");

describe("sendPushToUser", () => {
  beforeEach(() => {
    sendNotification.mockReset();
    findMany.mockReset();
    deleteSub.mockReset().mockResolvedValue({});
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    process.env.VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
  });

  it("does nothing when the user has no subscriptions", async () => {
    findMany.mockResolvedValue([]);
    await sendPushToUser("user-1", { title: "Hi", body: "there", url: "/" });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends to every subscription for the user", async () => {
    findMany.mockResolvedValue([
      { id: "sub-1", endpoint: "https://push.example/1", p256dh: "a", auth: "b" },
      { id: "sub-2", endpoint: "https://push.example/2", p256dh: "c", auth: "d" },
    ]);
    sendNotification.mockResolvedValue({});
    await sendPushToUser("user-1", { title: "Hi", body: "there", url: "/" });
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("prunes a subscription the push service reports as gone (410)", async () => {
    findMany.mockResolvedValue([{ id: "sub-1", endpoint: "https://push.example/1", p256dh: "a", auth: "b" }]);
    sendNotification.mockRejectedValue({ statusCode: 410 });
    await sendPushToUser("user-1", { title: "Hi", body: "there", url: "/" });
    expect(deleteSub).toHaveBeenCalledWith({ where: { id: "sub-1" } });
  });

  it("leaves a subscription alone on a non-gone error", async () => {
    findMany.mockResolvedValue([{ id: "sub-1", endpoint: "https://push.example/1", p256dh: "a", auth: "b" }]);
    sendNotification.mockRejectedValue({ statusCode: 500 });
    await sendPushToUser("user-1", { title: "Hi", body: "there", url: "/" });
    expect(deleteSub).not.toHaveBeenCalled();
  });
});
