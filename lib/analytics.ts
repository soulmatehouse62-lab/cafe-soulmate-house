import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { CAFE_TZ, eachDay, type ResolvedPeriod } from "./dates";
import type { PaymentMethodValue } from "./money";

// Every figure here is computed by a MongoDB aggregation pipeline ($match →
// $group, with $facet to share one scan); only the grouped result documents
// (at most one per day / item / category) come back to Node.

export interface AnalyticsSummary {
  collected: number;
  billed: number;
  paidOnPeriodOrders: number;
  outstanding: number;
  orderCount: number;
  averageOrderValue: number;
  allTimeOutstanding: number;
  unsettledOrderCount: number;
}

export interface DailyPoint {
  day: string;
  collected: number;
  billed: number;
}

export interface MethodSlice {
  method: PaymentMethodValue;
  amount: number;
  count: number;
}

export interface ItemStat {
  name: string;
  quantity: number;
  revenue: number;
}

export interface CategoryStat {
  category: string;
  quantity: number;
  revenue: number;
}

export interface Debtor {
  name: string;
  phone: string | null;
  orders: number;
  due: number;
  oldest: Date;
}

export interface AnalyticsData {
  summary: AnalyticsSummary;
  daily: DailyPoint[];
  methods: MethodSlice[];
  topByQuantity: ItemStat[];
  topByRevenue: ItemStat[];
  categories: CategoryStat[];
  debtors: Debtor[];
}

// ---- Extended-JSON decoding -------------------------------------------------
// aggregateRaw returns MongoDB Extended JSON, so numbers may arrive wrapped
// ({ $numberLong: "123" }) and dates as { $date: ... }.

type Json = Prisma.JsonValue;
type Doc = { [key: string]: Json };

function num(v: Json | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const inner = v.$numberLong ?? v.$numberInt ?? v.$numberDouble ?? v.$numberDecimal;
    if (inner !== undefined) return Number(inner);
  }
  return 0;
}

function date(v: Json | undefined): Date {
  if (v && typeof v === "object" && !Array.isArray(v) && "$date" in v) {
    const d = v.$date;
    if (typeof d === "string" || typeof d === "number") return new Date(d);
    if (d && typeof d === "object" && !Array.isArray(d)) return new Date(num(d));
  }
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  return new Date(0);
}

function str(v: Json | undefined): string {
  return typeof v === "string" ? v : "";
}

function docs(v: Json | undefined): Doc[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Doc[]) : [];
}

function firstDoc(result: Json): Doc {
  return docs(result)[0] ?? {};
}

const ejsonDate = (d: Date) => ({ $date: d.toISOString() });

// ---- Queries ----------------------------------------------------------------

export async function getAnalytics(p: ResolvedPeriod): Promise<AnalyticsData> {
  const inPeriod = (field: string) => ({ $match: { [field]: { $gte: ejsonDate(p.start), $lt: ejsonDate(p.end) } } });
  const dayOf = (field: string) => ({ $dateToString: { format: "%Y-%m-%d", date: `$${field}`, timezone: CAFE_TZ } });
  const itemLabel = {
    $cond: [
      { $gt: [{ $strLenCP: { $ifNull: ["$items.variantName", ""] } }, 0] },
      { $concat: ["$items.itemName", " · ", "$items.variantName"] },
      "$items.itemName",
    ],
  };
  const itemGroup = (key: string | object) => ({
    $group: { _id: key, quantity: { $sum: "$items.quantity" }, revenue: { $sum: "$items.lineTotal" } },
  });

  const [orderStats, paymentStats, itemStats, dueStats] = await Promise.all([
    // Orders placed in the period: totals + billed per day
    prisma.order.aggregateRaw({
      pipeline: [
        inPeriod("createdAt"),
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  orderCount: { $sum: 1 },
                  billed: { $sum: "$total" },
                  paid: { $sum: "$amountPaid" },
                  due: { $sum: "$balanceDue" },
                  aov: { $avg: "$total" },
                },
              },
            ],
            byDay: [{ $group: { _id: dayOf("createdAt"), amount: { $sum: "$total" } } }],
          },
        },
      ],
    }),

    // Payments received in the period: per method + per day
    prisma.payment.aggregateRaw({
      pipeline: [
        inPeriod("paidAt"),
        {
          $facet: {
            byMethod: [{ $group: { _id: "$method", amount: { $sum: "$amount" }, count: { $sum: 1 } } }],
            byDay: [{ $group: { _id: dayOf("paidAt"), amount: { $sum: "$amount" } } }],
          },
        },
      ],
    }),

    // Line items on orders placed in the period
    prisma.order.aggregateRaw({
      pipeline: [
        inPeriod("createdAt"),
        { $lookup: { from: "OrderItem", localField: "_id", foreignField: "orderId", as: "items" } },
        { $unwind: "$items" },
        {
          $facet: {
            topByQuantity: [itemGroup(itemLabel), { $sort: { quantity: -1, revenue: -1, _id: 1 } }, { $limit: 10 }],
            topByRevenue: [itemGroup(itemLabel), { $sort: { revenue: -1, quantity: -1, _id: 1 } }, { $limit: 10 }],
            categories: [itemGroup("$items.category"), { $sort: { revenue: -1 } }],
          },
        },
      ],
    }),

    // Everything still owed, regardless of period
    prisma.order.aggregateRaw({
      pipeline: [
        { $match: { balanceDue: { $gt: 0 } } },
        {
          $facet: {
            totals: [{ $group: { _id: null, due: { $sum: "$balanceDue" }, count: { $sum: 1 } } }],
            debtors: [
              {
                $group: {
                  _id: {
                    name: { $trim: { input: { $ifNull: ["$customerName", ""] } } },
                    phone: { $trim: { input: { $ifNull: ["$customerPhone", ""] } } },
                  },
                  orders: { $sum: 1 },
                  due: { $sum: "$balanceDue" },
                  oldest: { $min: "$createdAt" },
                },
              },
              { $sort: { due: -1 } },
              { $limit: 10 },
            ],
          },
        },
      ],
    }),
  ]);

  const orderFacet = firstDoc(orderStats);
  const paymentFacet = firstDoc(paymentStats);
  const itemFacet = firstDoc(itemStats);
  const dueFacet = firstDoc(dueStats);

  const totals = docs(orderFacet.totals)[0] ?? {};
  const dueTotals = docs(dueFacet.totals)[0] ?? {};

  const billedByDay = new Map(docs(orderFacet.byDay).map((d) => [str(d._id), num(d.amount)]));
  const collectedByDay = new Map(docs(paymentFacet.byDay).map((d) => [str(d._id), num(d.amount)]));
  const methodMap = new Map(docs(paymentFacet.byMethod).map((d) => [str(d._id), { amount: num(d.amount), count: num(d.count) }]));

  const toItem = (d: Doc): ItemStat => ({ name: str(d._id), quantity: num(d.quantity), revenue: num(d.revenue) });
  const methodOrder: PaymentMethodValue[] = ["CASH", "UPI", "CARD"];
  const methods = methodOrder.map((method) => ({
    method,
    amount: methodMap.get(method)?.amount ?? 0,
    count: methodMap.get(method)?.count ?? 0,
  }));

  return {
    summary: {
      collected: methods.reduce((s, m) => s + m.amount, 0),
      billed: num(totals.billed),
      paidOnPeriodOrders: num(totals.paid),
      outstanding: num(totals.due),
      orderCount: num(totals.orderCount),
      averageOrderValue: Math.round(num(totals.aov) / 100) * 100,
      allTimeOutstanding: num(dueTotals.due),
      unsettledOrderCount: num(dueTotals.count),
    },
    daily: eachDay(p.fromKey, p.toKey).map((day) => ({
      day,
      collected: collectedByDay.get(day) ?? 0,
      billed: billedByDay.get(day) ?? 0,
    })),
    methods,
    topByQuantity: docs(itemFacet.topByQuantity).map(toItem),
    topByRevenue: docs(itemFacet.topByRevenue).map(toItem),
    categories: docs(itemFacet.categories).map((d) => ({
      category: str(d._id),
      quantity: num(d.quantity),
      revenue: num(d.revenue),
    })),
    debtors: docs(dueFacet.debtors).map((d) => {
      const key = (d._id ?? {}) as Doc;
      return {
        name: str(key.name) || "Walk-in (no name)",
        phone: str(key.phone) || null,
        orders: num(d.orders),
        due: num(d.due),
        oldest: date(d.oldest),
      };
    }),
  };
}
