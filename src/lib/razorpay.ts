import Razorpay from "razorpay";

// Built lazily (not at module load) — Next collects page data for every
// route at build time, which would otherwise construct this even for
// requests that never touch billing, and the Razorpay SDK throws
// immediately if the key pair isn't set (mirrors the lazy PrismaClient in
// src/server/prisma.js, for the same reason).
const globalForRazorpay = globalThis as unknown as { razorpay?: Razorpay };

export function getRazorpay(): Razorpay {
  if (!globalForRazorpay.razorpay) {
    globalForRazorpay.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return globalForRazorpay.razorpay;
}
