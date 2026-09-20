import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { csvRupees, csvStreamResponse, csvTimestamp } from "@/lib/csv";
import { METHOD_LABEL, formatOrderNumber, normalizePhone } from "@/lib/money";
import { addDays, isDateKey, startOfDay, todayKey } from "@/lib/dates";

export const dynamic = "force-dynamic";

const BATCH = 1000;

export async function GET(req: NextRequest) {
  await requireUser();
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const method = sp.get("method");
  const phone = normalizePhone(sp.get("phone") ?? "");

  const where: Prisma.PaymentWhereInput = {};
  if (isDateKey(from) || isDateKey(to)) {
    where.paidAt = {
      ...(isDateKey(from) ? { gte: startOfDay(from) } : {}),
      ...(isDateKey(to) ? { lt: startOfDay(addDays(to, 1)) } : {}),
    };
  }
  if (method === "CASH" || method === "UPI" || method === "CARD") where.method = method;
  if (phone) where.order = { is: { customerPhone: { contains: phone } } };

  return csvStreamResponse(
    `payments-${todayKey()}.csv`,
    ["Paid at", "Order #", "Customer", "Phone", "Method", "Amount (INR)", "Order total (INR)", "Order balance due (INR)"],
    (cursor) =>
      prisma.payment.findMany({
        where,
        orderBy: { id: "asc" },
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        include: {
          order: { select: { orderNumber: true, customerName: true, customerPhone: true, total: true, balanceDue: true } },
        },
      }),
    (p) => [
      csvTimestamp(p.paidAt),
      formatOrderNumber(p.order.orderNumber),
      p.order.customerName,
      p.order.customerPhone,
      METHOD_LABEL[p.method],
      csvRupees(p.amount),
      csvRupees(p.order.total),
      csvRupees(p.order.balanceDue),
    ],
  );
}
