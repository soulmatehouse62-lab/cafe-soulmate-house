/**
 * Builds Order.phoneKey and the Customer list from existing orders. Safe to run any number of
 * times, and safe on a database with real orders (only adds/updates those two things).
 *
 *   npm run db:backfill-customers
 */
import { PrismaClient } from "@prisma/client";

const phoneKeyOf = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
};

export async function backfillCustomers(prisma: PrismaClient): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { customerPhone: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, customerPhone: true, customerName: true, createdAt: true, phoneKey: true },
  });

  // Oldest first, so the latest name for each phone wins.
  const customers = new Map<string, { phone: string; name: string; lastVisitAt: Date }>();
  let keyed = 0;
  for (const o of orders) {
    const key = phoneKeyOf(o.customerPhone!);
    if (key !== o.phoneKey) {
      await prisma.order.update({ where: { id: o.id }, data: { phoneKey: key } });
      keyed++;
    }
    if (!key) continue;
    const prev = customers.get(key);
    customers.set(key, {
      phone: o.customerPhone!,
      name: o.customerName?.trim() || prev?.name || "",
      lastVisitAt: o.createdAt,
    });
  }

  let saved = 0;
  for (const [phoneKey, c] of customers) {
    if (!c.name) continue;
    const data = { phone: c.phone, name: c.name, nameWords: [...new Set(c.name.toLowerCase().split(/\s+/).filter(Boolean))], lastVisitAt: c.lastVisitAt };
    await prisma.customer.upsert({ where: { phoneKey }, create: { phoneKey, ...data }, update: data });
    saved++;
  }
  console.log(`Customers: ${saved} saved from ${orders.length} orders with a phone (${keyed} orders re-keyed).`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/backfill-customers.ts")) {
  const prisma = new PrismaClient();
  backfillCustomers(prisma)
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
