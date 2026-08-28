import { NextResponse } from "next/server";

// Uropai requires an HTTPS returnUrl (a plain http:// one is rejected at
// order-creation time with "URL must use https") — but locally, AUTH_URL
// is http://localhost to match Google's registered OAuth redirect URI, so
// the browser has no session cookie for whatever https origin Uropai sends
// it back to (e.g. an ngrok tunnel). This bounces it straight to AUTH_URL,
// where the real session lives, satisfying Uropai's constraint without
// requiring AUTH_URL itself to be https in local dev.
export async function GET() {
  const origin = process.env.AUTH_URL || "";
  return NextResponse.redirect(`${origin}/pricing?status=processing`);
}
