import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "ludo_android_app";

// Mirrors the referrer check in src/lib/android-app.ts, server-side: a TWA
// sends this referer on its first request, then we remember it in a
// cookie for the rest of the session so later navigation is caught too.
function isAndroidAppRequest(req: NextRequest): boolean {
  const referer = req.headers.get("referer") ?? "";
  return referer.startsWith("android-app://") || req.cookies.get(COOKIE)?.value === "1";
}

export function proxy(req: NextRequest) {
  if (!isAndroidAppRequest(req)) return NextResponse.next();

  // The Play Store build has no purchase surface — bounce any deep link
  // into pricing back home instead of exposing a checkout the app's own
  // UI never links to.
  const res = req.nextUrl.pathname.startsWith("/pricing")
    ? NextResponse.redirect(new URL("/", req.url))
    : NextResponse.next();

  res.cookies.set(COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|brand/).*)"],
};
