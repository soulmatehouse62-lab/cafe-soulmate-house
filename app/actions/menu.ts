"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rupeesToPaise } from "@/lib/money";
import { isObjectId } from "@/lib/ids";
import { runTransaction } from "@/lib/orders";
import { MENU_TAG } from "@/lib/public-menu";
import { NOT_ALLOWED, isAdmin, requireUser } from "@/lib/auth";
import type { ActionResult } from "./orders";

const variantSchema = z.object({
  name: z.string().trim().min(1, "Each size needs a name").max(20, "Size name is too long"),
  price: z.number().positive("Each size needs a price greater than zero").max(100000, "Price looks too high"),
});

const menuItemSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80, "Name is too long"),
    /** Used only when the item has no sizes. */
    price: z.number().min(0).max(100000, "Price looks too high"),
    category: z.string().trim().min(1, "Category is required").max(40, "Category is too long"),
    isAvailable: z.boolean(),
    variants: z.array(variantSchema).max(6, "Up to 6 sizes per item"),
  })
  .superRefine((v, ctx) => {
    if (v.variants.length === 0 && v.price <= 0) {
      ctx.addIssue({ code: "custom", message: "Price must be greater than zero" });
    }
    if (v.variants.length === 1) {
      ctx.addIssue({ code: "custom", message: "Add at least two sizes, or switch sizes off" });
    }
    const names = v.variants.map((s) => s.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: "custom", message: "Size names must be different" });
    }
  });

export type MenuItemInput = z.input<typeof menuItemSchema>;

function revalidateMenu() {
  revalidatePath("/", "layout");
  revalidateTag(MENU_TAG); // public menu at /m
}

function normalizeCategory(c: string): string {
  return c.replace(/\s+/g, " ").replace(/^./, (ch) => ch.toUpperCase());
}

function toData(input: z.output<typeof menuItemSchema>) {
  const variants = input.variants.map((v) => ({ name: v.name, price: rupeesToPaise(v.price) }));
  return {
    name: input.name,
    category: normalizeCategory(input.category),
    isAvailable: input.isAvailable,
    variants,
    // With sizes, `price` holds the lowest size price ("from ₹…" and sorting).
    price: variants.length ? Math.min(...variants.map((v) => v.price)) : rupeesToPaise(input.price),
  };
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

export async function createMenuItem(raw: MenuItemInput): Promise<ActionResult<{ id: string }>> {
  if (!isAdmin(await requireUser())) return NOT_ALLOWED;
  const parsed = menuItemSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  try {
    const item = await prisma.menuItem.create({ data: toData(parsed.data), select: { id: true } });
    revalidateMenu();
    return { ok: true, id: item.id };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Could not save the item. Please try again." };
  }
}

export async function updateMenuItem(id: string, raw: MenuItemInput): Promise<ActionResult> {
  if (!isAdmin(await requireUser())) return NOT_ALLOWED;
  if (!isObjectId(id)) return { ok: false, error: "This item no longer exists" };
  const parsed = menuItemSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  try {
    // Past orders keep their own name/size/price snapshot, so editing here never rewrites old bills.
    const { count } = await prisma.menuItem.updateMany({ where: { id }, data: toData(parsed.data) });
    if (count === 0) return { ok: false, error: "This item no longer exists" };
    revalidateMenu();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Could not save the item. Please try again." };
  }
}

export async function setMenuItemAvailability(id: string, isAvailable: boolean): Promise<ActionResult> {
  // Any staff member can take an item off the counter for the day.
  await requireUser();
  if (!isObjectId(id)) return { ok: false, error: "This item no longer exists" };
  try {
    const { count } = await prisma.menuItem.updateMany({ where: { id }, data: { isAvailable } });
    if (count === 0) return { ok: false, error: "This item no longer exists" };
    revalidateMenu();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Could not update availability. Please try again." };
  }
}

export async function deleteMenuItem(id: string): Promise<ActionResult> {
  if (!isAdmin(await requireUser())) return NOT_ALLOWED;
  if (!isObjectId(id)) return { ok: false, error: "This item no longer exists" };
  try {
    // Detach past order lines (menuItemId → null) and delete the item in one transaction.
    // Each line carries its own name/size/category/price snapshot, so historical bills and
    // analytics are unaffected.
    const count = await runTransaction(async (tx) => {
      await tx.orderItem.updateMany({ where: { menuItemId: id }, data: { menuItemId: null } });
      return (await tx.menuItem.deleteMany({ where: { id } })).count;
    });
    if (count === 0) return { ok: false, error: "This item no longer exists" };
    revalidateMenu();
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Could not delete the item. Please try again." };
  }
}
