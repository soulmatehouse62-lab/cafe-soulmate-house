import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAMES } from "@/lib/session-cookie";

/**
 * Fast path only: sends visitors without a session cookie to /login before any page work
 * happens. It does NOT validate the session. Every page, server action and route handler
 * calls requireUser() (lib/auth.ts), which is the real check.
 */
export function middleware(req: NextRequest) {
  // Public menu for customers (QR code on the tables): no sign-in.
  if (req.nextUrl.pathname === "/m") return NextResponse.next();
  if (SESSION_COOKIE_NAMES.some((name) => req.cookies.has(name))) return NextResponse.next();

  const url = req.nextUrl.clone();
  const next = req.nextUrl.pathname + req.nextUrl.search;
  url.pathname = "/login";
  url.search = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the sign-in page and static assets.
  matcher: ["/((?!login|_next/static|_next/image|icon.svg|favicon.ico|robots.txt).*)"],
};
