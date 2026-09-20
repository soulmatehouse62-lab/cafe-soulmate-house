"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isObjectId } from "@/lib/ids";
import { NOT_ALLOWED, isAdmin, requireUser, revokeSessions } from "@/lib/auth";
import { USERNAME_RE, hashPassword, normalizeUsername, passwordProblem } from "@/lib/password";
import type { ActionResult } from "./orders";

const roleSchema = z.enum(["ADMIN", "STAFF"]);
const nameSchema = z.string().trim().min(1, "Name is required").max(60, "Name is too long");

const createUserSchema = z.object({
  username: z
    .string()
    .transform(normalizeUsername)
    .refine((u) => USERNAME_RE.test(u), "Username: 3–32 characters, letters, numbers, dot, dash or underscore"),
  name: nameSchema,
  role: roleSchema,
  password: z.string(),
});

const updateUserSchema = z.object({ name: nameSchema, role: roleSchema, isActive: z.boolean() });

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

export async function createUser(raw: z.input<typeof createUserSchema>): Promise<ActionResult> {
  const me = await requireUser();
  if (!isAdmin(me)) return NOT_ALLOWED;
  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { username, name, role, password } = parsed.data;
  const problem = passwordProblem(password, username);
  if (problem) return { ok: false, error: problem };

  try {
    await prisma.user.create({ data: { username, name, role, passwordHash: await hashPassword(password) } });
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "That username is already taken" };
    }
    console.error(e);
    return { ok: false, error: "Could not create the account. Please try again." };
  }
}

export async function updateUser(id: string, raw: z.input<typeof updateUserSchema>): Promise<ActionResult> {
  const me = await requireUser();
  if (!isAdmin(me)) return NOT_ALLOWED;
  if (!isObjectId(id)) return { ok: false, error: "This account no longer exists" };
  const parsed = updateUserSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const input = parsed.data;

  // Keeps at least one working admin: the one making the change.
  if (id === me.id && (input.role !== "ADMIN" || !input.isActive)) {
    return { ok: false, error: "You can’t remove your own admin access or disable yourself." };
  }

  try {
    const before = await prisma.user.findUnique({ where: { id }, select: { role: true, isActive: true } });
    if (!before) return { ok: false, error: "This account no longer exists" };
    await prisma.user.update({ where: { id }, data: input });
    // Disabling or changing role takes effect immediately on every device.
    if (!input.isActive || before.role !== input.role) await revokeSessions(id);
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Could not save the account. Please try again." };
  }
}

export async function resetUserPassword(id: string, password: string): Promise<ActionResult> {
  const me = await requireUser();
  if (!isAdmin(me)) return NOT_ALLOWED;
  if (!isObjectId(id)) return { ok: false, error: "This account no longer exists" };

  try {
    const user = await prisma.user.findUnique({ where: { id }, select: { username: true } });
    if (!user) return { ok: false, error: "This account no longer exists" };
    const problem = passwordProblem(String(password ?? ""), user.username);
    if (problem) return { ok: false, error: problem };

    await prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date() },
    });
    await revokeSessions(id, id === me.id ? me.sessionId : undefined);
    await prisma.loginThrottle.deleteMany({ where: { id: `user:${user.username}` } });
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Could not reset the password. Please try again." };
  }
}

export async function signOutUser(id: string): Promise<ActionResult> {
  const me = await requireUser();
  if (!isAdmin(me)) return NOT_ALLOWED;
  if (!isObjectId(id)) return { ok: false, error: "This account no longer exists" };
  await revokeSessions(id, id === me.id ? me.sessionId : undefined);
  revalidatePath("/users");
  return { ok: true };
}
