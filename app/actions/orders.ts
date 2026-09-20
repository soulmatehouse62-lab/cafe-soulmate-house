"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { lockOrder, nextOrderNumber, runTransaction, syncOrderPayments } from "@/lib/orders";
import { isObjectId } from "@/lib/ids";
import { phoneKeyOf, rememberCustomer } from "@/lib/customers";
import { NOT_ALLOWED, isAdmin, requireUser } from "@/lib/auth";
import { computeBill, formatINR, normalizePhone, rupeesToPaise } from "@/lib/money";
import type { MenuItem, Prisma } from "@prisma/client";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const lineSchema = z.object({
  /** Existing line on the order being edited — keeps its price/name snapshot. */
  orderItemId: z.string().refine(isObjectId, "Invalid order line").optional(),
  /** New line — priced from the current menu. */
  menuItemId: z.string().refine(isObjectId, "Invalid menu item").optional(),
  /** Size for new lines on items that have sizes, e.g. "Large". */
  variantName: z.string().trim().max(20).nullish(),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(999, "Quantity too large"),
});

const orderFieldsSchema = z.object({
  lines: z.array(lineSchema).min(1, "Add at least one item to the order").max(200),
  customerName: z.string().trim().max(80, "Name is too long"),
  customerPhone: z
    .string()
    .trim()
    .max(20, "Phone number is too long")
    .regex(/^[0-9+\-\s]*$/, "Phone number can contain only digits, spaces, + and -")
    // A short number can never be matched to a returning customer, so reject it up front.
    .refine((p) => {
      const n = p.replace(/\D/g, "").length;
      return n === 0 || (n >= 10 && n <= 13);
    }, "Enter a full 10-digit mobile number (or leave it empty)"),
  tableNumber: z.string().trim().max(20, "Table number is too long"),
  discountType: z.enum(["FLAT", "PERCENT"]).nullable(),
  discountValue: z.number().min(0, "Discount cannot be negative").nullable(),
});

const createOrderSchema = orderFieldsSchema.extend({
  paymentStatus: z.enum(["PAID", "UNPAID", "PARTIAL"]),
  paymentAmount: z.number().min(0).nullable(),
  paymentMethod: z.enum(["CASH", "UPI", "CARD"]).nullable(),
});

export type OrderFieldsInput = z.infer<typeof orderFieldsSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

class UserError extends Error {}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof UserError) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Something went wrong while saving. Please try again." };
}

function nullIfEmpty(s: string): string | null {
  return s.length ? s : null;
}

function validateDiscount(input: OrderFieldsInput) {
  if (input.discountType === "PERCENT" && (input.discountValue ?? 0) > 100) {
    throw new UserError("Percentage discount cannot exceed 100%");
  }
  if (input.discountType && (input.discountValue === null || input.discountValue === 0)) {
    return { discountType: null, discountValue: null };
  }
  return { discountType: input.discountType, discountValue: input.discountType ? input.discountValue : null };
}

/** Snapshot a new line from the current menu, resolving the chosen size's price. */
function priceMenuLine(m: MenuItem, variantName: string | null | undefined, quantity: number) {
  if (!m.isAvailable) throw new UserError(`${m.name} is currently unavailable.`);
  let unitPrice = m.price;
  let size: string | null = null;
  if (m.variants.length > 0) {
    const v = m.variants.find((x) => x.name === variantName);
    if (!v) throw new UserError(`Choose a size for ${m.name}`);
    unitPrice = v.price;
    size = v.name;
  }
  return {
    menuItemId: m.id,
    itemName: m.name,
    variantName: size,
    category: m.category,
    unitPrice,
    quantity,
    lineTotal: unitPrice * quantity,
  };
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

export async function createOrder(raw: CreateOrderInput): Promise<ActionResult<{ orderId: string }>> {
  await requireUser();
  const parsed = createOrderSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const input = parsed.data;

  try {
    const discount = validateDiscount(input);

    // Merge duplicate item + size combinations into one line.
    const merged = new Map<string, { menuItemId: string; variantName: string | null; quantity: number }>();
    for (const line of input.lines) {
      if (!line.menuItemId) throw new UserError("Every line must reference a menu item");
      const variantName = line.variantName || null;
      const key = `${line.menuItemId}|${variantName ?? ""}`;
      const prev = merged.get(key);
      merged.set(key, { menuItemId: line.menuItemId, variantName, quantity: (prev?.quantity ?? 0) + line.quantity });
    }

    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: [...new Set([...merged.values()].map((l) => l.menuItemId))] } },
    });
    const menuById = new Map(menuItems.map((m) => [m.id, m]));

    const lines = [...merged.values()].map((l) => {
      const m = menuById.get(l.menuItemId);
      if (!m) throw new UserError("An item in this order was removed from the menu. Please remove it and try again.");
      return priceMenuLine(m, l.variantName, l.quantity);
    });

    const bill = computeBill(lines, discount.discountType, discount.discountValue);

    let payment: { amount: number; method: "CASH" | "UPI" | "CARD" } | null = null;
    if (input.paymentStatus !== "UNPAID" && bill.total > 0) {
      if (!input.paymentMethod) throw new UserError("Choose how the customer paid");
      if (input.paymentStatus === "PAID") {
        // Any excess cash handed over is change, not revenue — record exactly the total.
        if (input.paymentAmount !== null && rupeesToPaise(input.paymentAmount) < bill.total) {
          throw new UserError(`Amount received is less than the total ${formatINR(bill.total)}. Use Partial instead.`);
        }
        payment = { amount: bill.total, method: input.paymentMethod };
      } else {
        const amount = rupeesToPaise(input.paymentAmount ?? 0);
        if (amount <= 0) throw new UserError("Enter the amount received");
        if (amount > bill.total) throw new UserError(`Amount received cannot exceed the total ${formatINR(bill.total)}`);
        payment = { amount, method: input.paymentMethod };
      }
    }

    const orderId = await runTransaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNumber: await nextOrderNumber(tx),
          customerName: nullIfEmpty(input.customerName),
          customerPhone: nullIfEmpty(normalizePhone(input.customerPhone)),
          phoneKey: phoneKeyOf(input.customerPhone),
          tableNumber: nullIfEmpty(input.tableNumber),
          subtotal: bill.subtotal,
          discountType: discount.discountType,
          discountValue: discount.discountValue,
          discountAmount: bill.discountAmount,
          total: bill.total,
          amountPaid: 0,
          balanceDue: bill.total,
          status: "UNPAID",
          items: { create: lines },
        },
        select: { id: true },
      });
      if (payment) await tx.payment.create({ data: { orderId: order.id, ...payment } });
      await syncOrderPayments(tx, order.id);
      return order.id;
    });

    await rememberCustomer(nullIfEmpty(normalizePhone(input.customerPhone)), nullIfEmpty(input.customerName), new Date());
    revalidateAll();
    return { ok: true, orderId };
  } catch (e) {
    return fail(e);
  }
}

export async function updateOrder(orderId: string, raw: OrderFieldsInput): Promise<ActionResult> {
  await requireUser();
  if (!isObjectId(orderId)) return { ok: false, error: "This order no longer exists" };
  const parsed = orderFieldsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const input = parsed.data;

  try {
    const discount = validateDiscount(input);

    await runTransaction(async (tx) => {
      if (!(await lockOrder(tx, orderId))) throw new UserError("This order no longer exists");
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
      const existingById = new Map(order.items.map((i) => [i.id, i]));

      const newMenuIds = input.lines.filter((l) => !l.orderItemId && l.menuItemId).map((l) => l.menuItemId!);
      const menuItems = newMenuIds.length
        ? await tx.menuItem.findMany({ where: { id: { in: newMenuIds } } })
        : [];
      const menuById = new Map(menuItems.map((m) => [m.id, m]));

      const lines = input.lines.map((line) => {
        if (line.orderItemId) {
          const existing = existingById.get(line.orderItemId);
          if (!existing) throw new UserError("The order changed while you were editing. Reload and try again.");
          return {
            menuItemId: existing.menuItemId,
            itemName: existing.itemName,
            variantName: existing.variantName,
            category: existing.category,
            unitPrice: existing.unitPrice,
            quantity: line.quantity,
            lineTotal: existing.unitPrice * line.quantity,
          };
        }
        const m = line.menuItemId ? menuById.get(line.menuItemId) : undefined;
        if (!m) throw new UserError("An added item was removed from the menu. Please remove it and try again.");
        return priceMenuLine(m, line.variantName, line.quantity);
      });

      const bill = computeBill(lines, discount.discountType, discount.discountValue);
      if (bill.total < order.amountPaid) {
        throw new UserError(
          `The new total ${formatINR(bill.total)} is less than the ${formatINR(order.amountPaid)} already paid. Remove a payment first.`,
        );
      }

      await tx.orderItem.deleteMany({ where: { orderId } });
      await tx.orderItem.createMany({ data: lines.map((l) => ({ ...l, orderId })) });
      await tx.order.update({
        where: { id: orderId },
        data: {
          customerName: nullIfEmpty(input.customerName),
          customerPhone: nullIfEmpty(normalizePhone(input.customerPhone)),
          phoneKey: phoneKeyOf(input.customerPhone),
          tableNumber: nullIfEmpty(input.tableNumber),
          subtotal: bill.subtotal,
          discountType: discount.discountType,
          discountValue: discount.discountValue,
          discountAmount: bill.discountAmount,
          total: bill.total,
        },
      });
      await syncOrderPayments(tx, orderId);
    });

    await rememberCustomer(nullIfEmpty(normalizePhone(input.customerPhone)), nullIfEmpty(input.customerName), new Date());
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteOrder(orderId: string): Promise<ActionResult> {
  if (!isAdmin(await requireUser())) return NOT_ALLOWED;
  if (!isObjectId(orderId)) return { ok: false, error: "This order no longer exists" };
  try {
    // MongoDB has no foreign-key cascades, so remove the children in the same transaction.
    await runTransaction(async (tx) => {
      if (!(await lockOrder(tx, orderId))) throw new UserError("This order no longer exists");
      await tx.payment.deleteMany({ where: { orderId } });
      await tx.orderItem.deleteMany({ where: { orderId } });
      await tx.order.deleteMany({ where: { id: orderId } });
    });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const paymentSchema = z.object({
  orderId: z.string().refine(isObjectId, "This order no longer exists"),
  amount: z.number().positive("Enter an amount greater than zero"),
  method: z.enum(["CASH", "UPI", "CARD"], { message: "Choose a payment method" }),
});

export async function recordPayment(raw: z.infer<typeof paymentSchema>): Promise<ActionResult<{ status: string }>> {
  await requireUser();
  const parsed = paymentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { orderId, method } = parsed.data;
  const amount = rupeesToPaise(parsed.data.amount);

  try {
    const status = await runTransaction(async (tx) => {
      if (!(await lockOrder(tx, orderId))) throw new UserError("This order no longer exists");
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { balanceDue: true } });
      if (order.balanceDue <= 0) throw new UserError("This order is already fully paid");
      if (amount > order.balanceDue) {
        throw new UserError(`Amount cannot exceed the balance due of ${formatINR(order.balanceDue)}`);
      }
      await tx.payment.create({ data: { orderId, amount, method } });
      await syncOrderPayments(tx, orderId);
      const updated = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
      return updated.status;
    });

    revalidateAll();
    return { ok: true, status };
  } catch (e) {
    return fail(e);
  }
}

const collectSchema = z.object({
  phone: z.string().trim().min(1, "This customer has no phone number saved"),
  amount: z.number().positive("Enter an amount greater than zero"),
  method: z.enum(["CASH", "UPI", "CARD"], { message: "Choose a payment method" }),
});

export interface CollectedPart {
  orderNumber: number;
  amount: number;
  settled: boolean;
}

/**
 * One payment from a customer, spread over their unpaid orders oldest first. Each order still
 * gets its own Payment row, so per-order history and analytics are unchanged. All of it happens
 * in a single transaction: if any part fails, nothing is recorded.
 */
export async function collectFromCustomer(
  raw: z.infer<typeof collectSchema>,
): Promise<ActionResult<{ applied: CollectedPart[]; total: number }>> {
  await requireUser();
  const parsed = collectSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { method } = parsed.data;
  const amount = rupeesToPaise(parsed.data.amount);
  const phoneKey = phoneKeyOf(parsed.data.phone);
  if (!phoneKey) return { ok: false, error: "This customer has no full phone number saved" };

  try {
    const applied = await runTransaction(async (tx) => {
      const orders = await tx.order.findMany({
        where: { phoneKey, balanceDue: { gt: 0 } },
        orderBy: { createdAt: "asc" },
        select: { id: true, orderNumber: true },
      });
      if (orders.length === 0) throw new UserError("This customer has no pending dues.");

      let remaining = amount;
      const parts: CollectedPart[] = [];
      for (const o of orders) {
        if (remaining <= 0) break;
        // Claim the order first, so a payment recorded elsewhere at the same moment can't be lost.
        if (!(await lockOrder(tx, o.id))) continue;
        const fresh = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: { balanceDue: true } });
        if (fresh.balanceDue <= 0) continue;

        const part = Math.min(remaining, fresh.balanceDue);
        await tx.payment.create({ data: { orderId: o.id, amount: part, method } });
        await syncOrderPayments(tx, o.id);
        remaining -= part;
        parts.push({ orderNumber: o.orderNumber, amount: part, settled: part === fresh.balanceDue });
      }

      if (remaining > 0) {
        // Aborts the transaction: nothing above is kept.
        throw new UserError(`That is ${formatINR(remaining)} more than this customer owes. Enter ${formatINR(amount - remaining)} or less.`);
      }
      return parts;
    });

    revalidateAll();
    return { ok: true, applied, total: amount };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePayment(paymentId: string): Promise<ActionResult> {
  if (!isAdmin(await requireUser())) return NOT_ALLOWED;
  if (!isObjectId(paymentId)) return { ok: false, error: "This payment no longer exists" };
  try {
    await runTransaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId }, select: { orderId: true } });
      if (!payment) throw new UserError("This payment no longer exists");
      await lockOrder(tx, payment.orderId);
      await tx.payment.delete({ where: { id: paymentId } });
      await syncOrderPayments(tx, payment.orderId);
    });
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export interface CustomerLookup {
  name: string | null;
  orders: number;
  totalSpent: number;
  due: number;
  openOrders: number;
}

/** Past-visit summary for a phone number, used to prefill the customer on a new order. */
export async function lookupCustomer(phoneRaw: string): Promise<CustomerLookup | null> {
  await requireUser();
  // Exact match on the indexed last-10-digits key, so "+91 97846 25778" and "9784625778" are the same customer.
  const phoneKey = phoneKeyOf(String(phoneRaw ?? ""));
  if (!phoneKey) return null;
  const samePhone = { phoneKey };
  try {
    const [latestNamed, agg, open] = await Promise.all([
      prisma.order.findFirst({
        where: { ...samePhone, customerName: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { customerName: true },
      }),
      prisma.order.aggregate({ where: samePhone, _count: true, _sum: { total: true, balanceDue: true } }),
      prisma.order.count({ where: { ...samePhone, balanceDue: { gt: 0 } } }),
    ]);
    if (agg._count === 0) return null;
    return {
      name: latestNamed?.customerName ?? null,
      orders: agg._count,
      totalSpent: agg._sum.total ?? 0,
      due: agg._sum.balanceDue ?? 0,
      openOrders: open,
    };
  } catch (e) {
    console.error(e);
    return null;
  }
}

export interface CustomerSuggestion {
  name: string;
  phone: string;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Suggestions while typing a name or phone on the order screen, most recent visitors first.
 * Name: every typed word must start one of the customer's name words ("sukh sin" → "Sukhminder Singh").
 * Phone: 3+ digits match the start of the number. Both are anchored regexes on indexed fields.
 */
export async function searchCustomers(queryRaw: string): Promise<CustomerSuggestion[]> {
  await requireUser();
  const query = String(queryRaw ?? "").trim().slice(0, 40);
  if (!query) return [];

  let filter: Prisma.InputJsonObject;
  if (/^[+\d\s-]+$/.test(query)) {
    let digits = query.replace(/\D/g, "");
    if (query.startsWith("+91") || (digits.length > 10 && digits.startsWith("91"))) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = digits.slice(1);
    if (digits.length < 3) return [];
    filter = { phoneKey: { $regex: `^${digits.slice(0, 10)}` } };
  } else {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4);
    filter = { $and: words.map((w) => ({ nameWords: { $regex: `^${escapeRegex(w)}` } })) };
  }

  try {
    const rows = (await prisma.customer.findRaw({
      filter,
      options: { sort: { lastVisitAt: -1 }, limit: 6, projection: { _id: 0, name: 1, phone: 1 } },
    })) as unknown as CustomerSuggestion[];
    return rows.map((r) => ({ name: String(r.name), phone: String(r.phone) }));
  } catch (e) {
    console.error(e);
    return [];
  }
}
