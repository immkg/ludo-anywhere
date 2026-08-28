import { createHmac, randomUUID, timingSafeEqual } from "crypto";

const ORIGIN = "https://api.uropai.in";
const API_PREFIX = "/v1";

export type UropaiOrderStatus = "PENDING" | "PAID" | "FAILED" | "EXPIRED" | "CANCELLED";

export type UropaiOrder = {
  id: string;
  tenantOrderRef: string;
  status: UropaiOrderStatus;
  statusReason?: string;
  amount: number;
  currency: string;
  checkoutType: string;
  openUrl: string;
  metaData?: Record<string, string>;
  createdAt: string;
};

function credentials(): { apiKey: string; apiSecret: string } {
  const apiKey = process.env.UROPAI_API_KEY;
  const apiSecret = process.env.UROPAI_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error("Uropai API credentials not configured");
  return { apiKey, apiSecret };
}

function sign(secret: string, method: string, path: string, timestamp: string, nonce: string, queryString: string, rawBody: string) {
  const canonical = [method, path, timestamp, nonce, queryString, rawBody].join("\n");
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

async function request<T>(method: "GET" | "POST", path: string, options: { query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const { apiKey, apiSecret } = credentials();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  const queryString = options.query ? new URLSearchParams(options.query).toString() : "";
  const rawBody = options.body !== undefined ? JSON.stringify(options.body) : "";
  // The signed path is the actual request path (including the /v1 prefix),
  // not just the sub-path passed in here.
  const signature = sign(apiSecret, method, `${API_PREFIX}${path}`, timestamp, nonce, queryString, rawBody);

  const res = await fetch(`${ORIGIN}${API_PREFIX}${path}${queryString ? `?${queryString}` : ""}`, {
    method,
    headers: {
      "X-Api-Key": apiKey,
      "X-Timestamp": timestamp,
      "X-Nonce": nonce,
      "X-Signature": signature,
      ...(rawBody ? { "Content-Type": "application/json" } : {}),
    },
    body: rawBody || undefined,
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Uropai request failed with status ${res.status}: ${JSON.stringify(body)}`);
  }
  // Every success response is wrapped as { code, status, message, data }.
  return body?.data as T;
}

// amount is in plain INR (not paise) per Uropai's docs — unlike Razorpay,
// which required the smallest currency unit.
export function createOrder(params: {
  tenantOrderRef: string;
  amount: number;
  currency?: string;
  customerEmail?: string;
  metaData?: Record<string, string>;
  returnUrl?: string;
  webhookUrl?: string;
}): Promise<UropaiOrder> {
  return request<UropaiOrder>("POST", "/orders", { body: params });
}

export function getOrder(orderId: string): Promise<UropaiOrder> {
  return request<UropaiOrder>("GET", `/orders/${encodeURIComponent(orderId)}`);
}

// Webhook signature uses a fixed path ('/tenant-webhook') rather than the
// actual request path, per Uropai's webhook signing docs. Confirmed against
// a real delivery: it's signed with UROPAI_API_SECRET, the same secret used
// for outgoing requests — NOT the separate secret issued when registering
// the webhook URL in the dashboard (that one didn't match; its actual
// purpose is unclear, but it isn't this).
export function verifyWebhookSignature(rawBody: string, headers: { timestamp: string; nonce: string; signature: string }): boolean {
  const webhookSecret = process.env.UROPAI_API_SECRET;
  if (!webhookSecret) {
    console.error("verifyWebhookSignature: UROPAI_API_SECRET not configured");
    return false;
  }
  const timestampSeconds = Number(headers.timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    console.error("verifyWebhookSignature: non-numeric x-timestamp header:", headers.timestamp);
    return false;
  }
  const skewSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (skewSeconds > 300) {
    // mirrors Uropai's own replay window for outgoing requests — logged in
    // case their timestamp unit turns out not to be seconds after all.
    console.error(`verifyWebhookSignature: timestamp skew ${skewSeconds}s exceeds 300s window (x-timestamp=${headers.timestamp}, now=${Date.now()})`);
    return false;
  }

  const canonical = ["POST", "/tenant-webhook", headers.timestamp, headers.nonce, "", rawBody].join("\n");
  const expected = createHmac("sha256", webhookSecret).update(canonical).digest("hex");
  let matches: boolean;
  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const actualBuf = Buffer.from(headers.signature, "hex");
    matches = expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
  } catch (e) {
    console.error("verifyWebhookSignature: failed to decode signature buffers:", e);
    return false;
  }
  if (!matches) {
    console.error(`verifyWebhookSignature: signature mismatch. expected=${expected} actual=${headers.signature} canonical=${JSON.stringify(canonical)}`);
  }
  return matches;
}
