import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CAFE_TZ, addDays, startOfDay, todayKey } from "@/lib/dates";
import { OrderBuilder, type TodaySnapshot } from "@/components/OrderBuilder";

export const dynamic = "force-dynamic";

function greetingFor(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: CAFE_TZ, hour: "2-digit", hour12: false }).format(now));
  if (hour < 12) return "Good morning, let’s brew";
  if (hour < 17) return "Good afternoon, keep it pouring";
  return "Good evening, last cups in";
}

export default async function NewOrderPage() {
  await requireUser();
  const now = new Date();
  const key = todayKey();
  const start = startOfDay(key);
  const end = startOfDay(addDays(key, 1));

  const [menu, collected, ordersToday, dues] = await Promise.all([
    prisma.menuItem.findMany({
      where: { isAvailable: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, price: true, category: true, variants: true },
    }),
    prisma.payment.aggregate({ where: { paidAt: { gte: start, lt: end } }, _sum: { amount: true } }),
    prisma.order.count({ where: { createdAt: { gte: start, lt: end } } }),
    prisma.order.aggregate({ where: { balanceDue: { gt: 0 } }, _count: true, _sum: { balanceDue: true } }),
  ]);

  const today: TodaySnapshot = {
    greeting: greetingFor(now),
    dateLabel: new Intl.DateTimeFormat("en-IN", { timeZone: CAFE_TZ, weekday: "long", day: "numeric", month: "long" }).format(now),
    collected: collected._sum.amount ?? 0,
    orders: ordersToday,
    openDues: dues._count,
    openDueAmount: dues._sum.balanceDue ?? 0,
  };

  return (
    <OrderBuilder
      menu={menu.map((m) => ({ ...m, variants: m.variants.map((v) => ({ name: v.name, price: v.price })) }))}
      today={today}
    />
  );
}
