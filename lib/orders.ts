import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { addDays, isDateKey, startOfDay } from "./dates";
import { deriveStatus, normalizePhone, type OrderStatusValue, type PaymentMethodValue } from "./money";

type Tx = Prisma.TransactionClient;

const MAX_TX_ATTEMPTS = 4;

/**
 * Run an interactive transaction, retrying on MongoDB write conflicts (P2034).
 * Two staff touching the same order at once cannot both commit: one aborts and
 * is replayed against the fresh data, so validations run again.
 */
export async function runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { maxWait: 5000, timeout: 15000 });
    } catch (e) {
      const retryable = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
      if (!retryable || attempt >= MAX_TX_ATTEMPTS) throw e;
      await new Promise((r) => setTimeout(r, 20 * attempt + Math.random() * 30));
    }
  }
}

/**
 * Claim the order document for this transaction by writing to it first.
 * Any concurrent transaction that also writes the order hits a write conflict
 * and is retried by runTransaction — the MongoDB equivalent of SELECT … FOR UPDATE.
 */
export async function lockOrder(tx: Tx, orderId: string): Promise<boolean> {
  const { count } = await tx.order.updateMany({ where: { id: orderId }, data: { updatedAt: new Date() } });
  return count > 0;
}

/** Issue the next sequential order number. Runs inside the order-creating transaction. */
export async function nextOrderNumber(tx: Tx): Promise<number> {
  const counter = await tx.counter.upsert({
    where: { id: "order" },
    create: { id: "order", seq: 1 },
    update: { seq: { increment: 1 } },
  });
  return counter.seq;
}

/**
 * Recompute amountPaid / balanceDue / status from the Payment documents.
 * Must be called inside the same transaction that changed payments or the total.
 */
export async function syncOrderPayments(tx: Tx, orderId: string): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { total: true } });
  const agg = await tx.payment.aggregate({ where: { orderId }, _sum: { amount: true } });
  const amountPaid = agg._sum.amount ?? 0;
  await tx.order.update({
    where: { id: orderId },
    data: {
      amountPaid,
      balanceDue: Math.max(0, order.total - amountPaid),
      status: deriveStatus(order.total, amountPaid),
    },
  });
}

export const HISTORY_PAGE_SIZE = 20;

export interface HistoryFilters {
  from: string;
  to: string;
  status: OrderStatusValue | "";
  method: PaymentMethodValue | "";
  q: string;
  /** Customer phone filter (digits, partial match allowed) */
  phone: string;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export function parseHistoryFilters(params: RawParams): HistoryFilters {
  const status = one(params.status);
  const method = one(params.method);
  const page = Number.parseInt(one(params.page), 10);
  const from = one(params.from);
  const to = one(params.to);
  return {
    from: isDateKey(from) ? from : "",
    to: isDateKey(to) ? to : "",
    status: status === "PAID" || status === "UNPAID" || status === "PARTIAL" ? status : "",
    method: method === "CASH" || method === "UPI" || method === "CARD" ? method : "",
    q: one(params.q).slice(0, 80),
    phone: normalizePhone(one(params.phone)).slice(0, 16),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function buildOrderWhere(f: HistoryFilters): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  const and: Prisma.OrderWhereInput[] = [];

  if (f.from || f.to) {
    where.createdAt = {
      ...(f.from ? { gte: startOfDay(f.from) } : {}),
      ...(f.to ? { lt: startOfDay(addDays(f.to, 1)) } : {}),
    };
  }
  if (f.status) where.status = f.status;
  if (f.phone) where.customerPhone = { contains: f.phone };
  if (f.method) where.payments = { some: { method: f.method } };

  if (f.q) {
    const or: Prisma.OrderWhereInput[] = [
      { customerName: { contains: f.q, mode: "insensitive" } },
      { customerPhone: { contains: f.q.replace(/\s+/g, "") } },
    ];
    const asNumber = f.q.replace(/^#/, "");
    if (/^\d{1,9}$/.test(asNumber)) or.push({ orderNumber: Number(asNumber) });
    and.push({ OR: or });
  }

  if (and.length) where.AND = and;
  return where;
}

export function historyQueryString(f: HistoryFilters, overrides: Partial<HistoryFilters> = {}): string {
  const merged = { ...f, ...overrides };
  const sp = new URLSearchParams();
  if (merged.from) sp.set("from", merged.from);
  if (merged.to) sp.set("to", merged.to);
  if (merged.status) sp.set("status", merged.status);
  if (merged.method) sp.set("method", merged.method);
  if (merged.q) sp.set("q", merged.q);
  if (merged.phone) sp.set("phone", merged.phone);
  if (merged.page > 1) sp.set("page", String(merged.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
