/**
 * Seed: 10 menu items + 15 orders spread over the last 30 days with a mix of
 * paid, unpaid and partially paid bills. Deterministic (fixed PRNG seed) and
 * idempotent — it wipes existing cafe data first (accounts are kept) and restarts order
 * numbering at 1. Finishes by creating an admin account if there is none (see seed-admin.ts).
 * (MongoDB: run `npx prisma db push` once beforehand to create the indexes.)
 *
 * Run with: npx prisma db seed
 */
import { PrismaClient, type MenuItem, type PaymentMethod } from "@prisma/client";
import { computeBill, deriveStatus, type DiscountTypeValue } from "../lib/money";
import { ensureAdmin } from "./seed-admin";
import { backfillCustomers } from "./backfill-customers";

const prisma = new PrismaClient();

// mulberry32 — tiny deterministic PRNG so every seed run produces the same data.
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260919);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

// Drinks come in Medium / Large; food has a single price.
const MENU: { name: string; price: number; category: string; large?: number; isAvailable?: boolean }[] = [
  { name: "Cappuccino", price: 160, large: 200, category: "Coffee" },
  { name: "Cold Coffee", price: 180, large: 230, category: "Coffee" },
  { name: "Espresso", price: 120, large: 150, category: "Coffee" },
  { name: "Masala Chai", price: 60, large: 80, category: "Tea" },
  { name: "Lemon Iced Tea", price: 110, large: 140, category: "Tea" },
  { name: "Veg Sandwich", price: 140, category: "Snacks" },
  { name: "Paneer Tikka Wrap", price: 190, category: "Snacks" },
  { name: "French Fries", price: 120, category: "Snacks" },
  { name: "Chocolate Brownie", price: 130, category: "Desserts" },
  { name: "Blueberry Cheesecake", price: 220, category: "Desserts", isAvailable: false },
];

const CUSTOMERS: { name: string | null; phone: string | null }[] = [
  { name: "Aarav Sharma", phone: "9876543210" },
  { name: "Priya Nair", phone: "9812345678" },
  { name: "Rohan Mehta", phone: "9898989898" },
  { name: "Simran Kaur", phone: "9780011223" },
  { name: "Kabir Singh", phone: null },
  { name: null, phone: null },
];

type Plan = {
  daysAgo: number;
  hour: number;
  status: "PAID" | "UNPAID" | "PARTIAL";
  discount?: { type: DiscountTypeValue; value: number };
};

// 15 orders, oldest first so order numbers increase with time.
const PLANS: Plan[] = [
  { daysAgo: 29, hour: 10, status: "PAID" },
  { daysAgo: 27, hour: 13, status: "PAID", discount: { type: "PERCENT", value: 10 } },
  { daysAgo: 25, hour: 17, status: "PARTIAL" },
  { daysAgo: 22, hour: 11, status: "PAID" },
  { daysAgo: 20, hour: 19, status: "UNPAID" },
  { daysAgo: 18, hour: 15, status: "PAID" },
  { daysAgo: 15, hour: 9, status: "PAID", discount: { type: "FLAT", value: 50 } },
  { daysAgo: 12, hour: 12, status: "PARTIAL" },
  { daysAgo: 10, hour: 18, status: "PAID" },
  { daysAgo: 7, hour: 16, status: "UNPAID" },
  { daysAgo: 5, hour: 10, status: "PAID" },
  { daysAgo: 3, hour: 14, status: "PARTIAL" },
  { daysAgo: 2, hour: 20, status: "PAID" },
  { daysAgo: 1, hour: 11, status: "PAID" },
  { daysAgo: 0, hour: 0, status: "UNPAID" }, // a few minutes ago — not yet overdue
];

/** A time on a given cafe day (IST), `daysAgo` days before today. */
function istTime(daysAgo: number, hour: number, minute: number): Date {
  const todayIst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const d = new Date(`${todayIst}T00:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCMinutes(d.getUTCMinutes() + hour * 60 + minute);
  return d;
}

async function main() {
  // Wipe existing data (children first) and restart order numbering at 1.
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.counter.deleteMany();
  await prisma.customer.deleteMany();

  const menuItems: MenuItem[] = [];
  for (const m of MENU) {
    menuItems.push(
      await prisma.menuItem.create({
        data: {
          name: m.name,
          price: m.price * 100,
          category: m.category,
          isAvailable: m.isAvailable ?? true,
          variants: m.large
            ? [
                { name: "Medium", price: m.price * 100 },
                { name: "Large", price: m.large * 100 },
              ]
            : [],
        },
      }),
    );
  }

  const methods: PaymentMethod[] = ["CASH", "UPI", "CARD"];
  const counts = { PAID: 0, UNPAID: 0, PARTIAL: 0 };

  for (const [idx, plan] of PLANS.entries()) {
    const createdAt =
      plan.daysAgo === 0 ? new Date(Date.now() - 20 * 60 * 1000) : istTime(plan.daysAgo, plan.hour, Math.floor(rand() * 50));

    // 1–4 distinct items, 1–3 of each
    const chosen = new Map<string, number>();
    const lineCount = 1 + Math.floor(rand() * 4);
    while (chosen.size < lineCount) {
      const item = pick(menuItems);
      if (!chosen.has(item.id)) chosen.set(item.id, 1 + Math.floor(rand() * 3));
    }
    const lines = [...chosen.entries()].map(([id, quantity]) => {
      const m = menuItems.find((x) => x.id === id)!;
      const size = m.variants.length ? pick(m.variants) : null;
      const unitPrice = size?.price ?? m.price;
      return {
        menuItemId: m.id,
        itemName: m.name,
        variantName: size?.name ?? null,
        category: m.category,
        unitPrice,
        quantity,
        lineTotal: unitPrice * quantity,
      };
    });

    const bill = computeBill(lines, plan.discount?.type ?? null, plan.discount?.value ?? null);

    // Payments consistent with the planned status
    const payments: { amount: number; method: PaymentMethod; paidAt: Date }[] = [];
    if (plan.status === "PAID") {
      if (idx % 4 === 0 && bill.total > 10000) {
        // Settled in two instalments: part at the counter, rest the next day
        const first = Math.round(bill.total / 2 / 100) * 100;
        payments.push({ amount: first, method: pick(methods), paidAt: createdAt });
        const later = Math.min(createdAt.getTime() + 26 * 3600 * 1000, Date.now() - 60 * 1000);
        payments.push({ amount: bill.total - first, method: "UPI", paidAt: new Date(later) });
      } else {
        payments.push({ amount: bill.total, method: pick(methods), paidAt: createdAt });
      }
    } else if (plan.status === "PARTIAL") {
      const part = Math.max(100, Math.round((bill.total * (0.3 + rand() * 0.4)) / 1000) * 1000);
      payments.push({ amount: Math.min(part, bill.total - 100), method: pick(methods), paidAt: createdAt });
    }

    const amountPaid = payments.reduce((s, p) => s + p.amount, 0);
    const customer = CUSTOMERS[idx % CUSTOMERS.length];
    const status = deriveStatus(bill.total, amountPaid);
    counts[status] += 1;

    await prisma.order.create({
      data: {
        orderNumber: idx + 1,
        customerName: customer.name,
        customerPhone: customer.phone,
        tableNumber: idx % 3 === 0 ? String(1 + (idx % 8)) : null,
        subtotal: bill.subtotal,
        discountType: plan.discount?.type ?? null,
        discountValue: plan.discount?.value ?? null,
        discountAmount: bill.discountAmount,
        total: bill.total,
        amountPaid,
        balanceDue: bill.total - amountPaid,
        status,
        createdAt,
        updatedAt: payments.at(-1)?.paidAt ?? createdAt,
        items: { create: lines },
        payments: { create: payments },
      },
    });
  }

  await prisma.counter.create({ data: { id: "order", seq: PLANS.length } });

  console.log(
    `Seeded ${menuItems.length} menu items and ${PLANS.length} orders ` +
      `(${counts.PAID} paid, ${counts.PARTIAL} partial, ${counts.UNPAID} unpaid).`,
  );

  await backfillCustomers(prisma);

  // Accounts are never wiped; this only adds an admin when there is none.
  await ensureAdmin(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
