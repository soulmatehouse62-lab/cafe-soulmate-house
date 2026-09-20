"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  clearFailedLogins,
  endSession,
  getDummyHash,
  lockedMinutes,
  recordFailedLogin,
  requireUser,
  revokeSessions,
  safeNextPath,
  startSession,
} from "@/lib/auth";
import { PASSWORD_MAX, USERNAME_RE, hashPassword, needsRehash, normalizeUsername, passwordProblem, verifyPassword } from "@/lib/password";
import type { ActionResult } from "./orders";

export type LoginState = { error: string; username: string } | null;

const BAD_CREDENTIALS = "Incorrect username or password.";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  if (!username || !password) return { error: "Enter your username and password.", username };
  if (!USERNAME_RE.test(username) || password.length > PASSWORD_MAX) {
    await getDummyHash().then((h) => verifyPassword(password.slice(0, PASSWORD_MAX), h));
    return { error: BAD_CREDENTIALS, username };
  }

  try {
    const wait = await lockedMinutes(username);
    if (wait > 0) {
      return { error: `Too many failed attempts. Try again in ${wait} minute${wait === 1 ? "" : "s"}.`, username };
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, passwordHash: true, isActive: true },
    });
    // Always run one hash comparison so timing doesn't reveal whether the username exists.
    const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));

    if (!user || !valid) {
      await recordFailedLogin(username);
      return { error: BAD_CREDENTIALS, username };
    }
    if (!user.isActive) return { error: "This account has been disabled. Ask an admin.", username };

    await clearFailedLogins(username);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        // Transparently upgrade hashes made with older scrypt parameters.
        ...(needsRehash(user.passwordHash) ? { passwordHash: await hashPassword(password) } : {}),
      },
    });
    await startSession(user.id);
  } catch (e) {
    console.error(e);
    return { error: "Could not sign in right now. Please try again.", username };
  }

  redirect(next);
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}

/** Signs the current user out on every other device. */
export async function logoutOtherDevices(): Promise<ActionResult> {
  const user = await requireUser();
  await revokeSessions(user.id, user.sessionId);
  return { ok: true };
}

export async function changeOwnPassword(raw: { current: string; next: string }): Promise<ActionResult> {
  const user = await requireUser();
  const current = String(raw?.current ?? "");
  const next = String(raw?.next ?? "");

  try {
    // Same throttle as sign-in, so a hijacked session can't be used to guess the password.
    const wait = await lockedMinutes(user.username);
    if (wait > 0) return { ok: false, error: `Too many failed attempts. Try again in ${wait} minute${wait === 1 ? "" : "s"}.` };

    const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    if (current.length > PASSWORD_MAX || !(await verifyPassword(current, record.passwordHash))) {
      await recordFailedLogin(user.username);
      return { ok: false, error: "Your current password is incorrect." };
    }
    const problem = passwordProblem(next, user.username);
    if (problem) return { ok: false, error: problem };
    if (next === current) return { ok: false, error: "Choose a password different from the current one." };

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date() },
    });
    // Anyone who knew the old password is signed out; this device stays signed in.
    await revokeSessions(user.id, user.sessionId);
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Could not change the password. Please try again." };
  }
}
