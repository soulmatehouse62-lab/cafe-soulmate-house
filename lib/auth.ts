import "server-only";
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { hashPassword } from "./password";
import { COOKIE_SECURE, SESSION_COOKIE } from "./session-cookie";

// ─── Policy ─────────────────────────────────────────────────────────────────

/** Sign out after this long without any activity. */
const IDLE_MS = 12 * 3600 * 1000;
/** Sign out this long after signing in, however active. */
const ABSOLUTE_MS = 7 * 24 * 3600 * 1000;
/** Refresh lastSeenAt at most this often (saves a write on every request). */
const TOUCH_MS = 5 * 60 * 1000;

/** Failed sign-ins allowed per username within LOCK_WINDOW_MS before it is locked. */
const MAX_FAILURES = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;

export type Role = "ADMIN" | "STAFF";

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  sessionId: string;
}

export const isAdmin = (user: SessionUser) => user.role === "ADMIN";

export const NOT_ALLOWED = { ok: false as const, error: "Only an admin can do this." };

// ─── Sessions ───────────────────────────────────────────────────────────────

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * The signed-in user for this request, or null. Validates the session against the
 * database on every request (cached per request), so revoking a session or deactivating
 * a user takes effect immediately.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 128) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      lastSeenAt: true,
      user: { select: { id: true, username: true, name: true, role: true, isActive: true } },
    },
  });
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now || now - session.lastSeenAt.getTime() > IDLE_MS || !session.user.isActive) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_MS) {
    await prisma.session.updateMany({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
  }

  const { id, username, name, role } = session.user;
  return { id, username, name, role, sessionId: session.id };
});

/**
 * Use at the top of every page, server action and route handler. Middleware only does a
 * cheap cookie-presence redirect; this is the real check.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For admin-only pages: staff are sent back to the start screen. */
export async function requireAdminPage(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/");
  return user;
}

/** Creates a session and sets the cookie. Only callable from a server action or route handler. */
export async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const userAgent = (await headers()).get("user-agent")?.slice(0, 200) ?? null;

  // Housekeeping: drop this user's expired sessions.
  await prisma.session.deleteMany({
    where: { userId, OR: [{ expiresAt: { lte: new Date(now) } }, { lastSeenAt: { lt: new Date(now - IDLE_MS) } }] },
  });
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt: new Date(now + ABSOLUTE_MS), userAgent },
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: ABSOLUTE_MS / 1000,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete({ name: SESSION_COOKIE, path: "/", secure: COOKIE_SECURE, httpOnly: true, sameSite: "lax" });
}

/** Signs a user out on every device, optionally keeping one session (the caller's own). */
export async function revokeSessions(userId: string, keepSessionId?: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) } });
}

// ─── Brute-force protection ─────────────────────────────────────────────────

const throttleKey = (username: string) => `user:${username}`;

/** Minutes until the username may try again, or 0 when it isn't locked. */
export async function lockedMinutes(username: string): Promise<number> {
  const t = await prisma.loginThrottle.findUnique({ where: { id: throttleKey(username) } });
  const ms = (t?.lockedUntil?.getTime() ?? 0) - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

export async function recordFailedLogin(username: string): Promise<void> {
  const id = throttleKey(username);
  const now = new Date();
  const t = await prisma.loginThrottle.findUnique({ where: { id } });
  if (!t || now.getTime() - t.windowStart.getTime() > LOCK_WINDOW_MS) {
    await prisma.loginThrottle.upsert({
      where: { id },
      create: { id, failures: 1, windowStart: now },
      update: { failures: 1, windowStart: now, lockedUntil: null },
    });
    return;
  }
  // Atomic increment so parallel guesses are all counted.
  const updated = await prisma.loginThrottle.update({ where: { id }, data: { failures: { increment: 1 } } });
  if (updated.failures >= MAX_FAILURES) {
    await prisma.loginThrottle.update({
      where: { id },
      data: { lockedUntil: new Date(now.getTime() + LOCK_WINDOW_MS), windowStart: now },
    });
  }
}

export async function clearFailedLogins(username: string): Promise<void> {
  const cutoff = new Date(Date.now() - LOCK_WINDOW_MS);
  await prisma.loginThrottle.deleteMany({
    where: {
      OR: [
        { id: throttleKey(username) },
        // Housekeeping: stale counters for any username.
        { windowStart: { lt: cutoff }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] },
      ],
    },
  });
}

// A real hash to compare against when the username doesn't exist, so the response time
// doesn't reveal which usernames are valid.
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

/** Only same-site relative paths, so ?next= can't be used as an open redirect. */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f\\]/.test(next) || next.startsWith("/login")) return "/";
  return next;
}
