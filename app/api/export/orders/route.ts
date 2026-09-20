import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { buildOrderWhere, parseHistoryFilters } from "@/lib/orders";
import { csvRupees, csvStreamResponse, csvTimestamp } from "@/lib/csv";
import { METHOD_LABEL, STATUS_LABEL, formatOrderNumber, lineLabel } from "@/lib/money";
import { todayKey } from "@/lib/dates";

export const dynamic = "force-dynamic";

const BATCH = 500;

export async function GET(req: NextRequest) {
  await requireUser();
  const filters = parseHistoryFilters(Object.fromEntries(req.nextUrl.searchParams));
  const where = buildOrderWhere(filters);

  return csvStreamResponse(
    `orders-${todayKey()}.csv`,
    [
      "Order #",
      "Created",
      "Customer",
      "Phone",
      "Table",
      "Items",
      "Subtotal (INR)",
      "Discount (INR)",
      "Total (INR)",
      "Paid (INR)",
      "Balance due (INR)",
      "Status",
      "Payment methods",
    ],
    (cursor) =>
      prisma.order.findMany({
        where,
        orderBy: { id: "asc" },
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        include: {
          items: { select: { itemName: true, variantName: true, quantity: true } },
          payments: { select: { method: true } },
        },
      }),
    (o) => [
      formatOrderNumber(o.orderNumber),
      csvTimestamp(o.createdAt),
      o.customerName,
      o.customerPhone,
      o.tableNumber,
      o.items.map((i) => `${i.quantity} x ${lineLabel(i.itemName, i.variantName)}`).join("; "),
      csvRupees(o.subtotal),
      csvRupees(o.discountAmount),
      csvRupees(o.total),
      csvRupees(o.amountPaid),
      csvRupees(o.balanceDue),
      STATUS_LABEL[o.status],
      Array.from(new Set(o.payments.map((p) => METHOD_LABEL[p.method]))).join("; "),
    ],
  );
}
