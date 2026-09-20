// Shared by lib/auth.ts (Node) and middleware.ts (Edge) — keep this file dependency-free.

/**
 * Secure cookies are only sent over HTTPS (localhost excepted). On by default in production;
 * set COOKIE_SECURE=false only for a trusted LAN served over plain HTTP.
 */
export const COOKIE_SECURE =
  process.env.COOKIE_SECURE === "false" ? false : process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";

// The __Host- prefix makes the browser refuse the cookie unless it is Secure, host-only and Path=/.
export const SESSION_COOKIE = COOKIE_SECURE ? "__Host-soulmate_session" : "soulmate_session";

/** Both names, so middleware works whichever mode set the cookie. */
export const SESSION_COOKIE_NAMES = ["__Host-soulmate_session", "soulmate_session"];
