import { prisma } from "@/lib/prisma";
import { isAdmin, requireUser } from "@/lib/auth";
import { MenuManager } from "@/components/MenuManager";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const user = await requireUser();
  const items = await prisma.menuItem.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: { id: true, name: true, price: true, category: true, isAvailable: true, variants: true, _count: { select: { orderItems: true } } },
  });
  return (
    <MenuManager
      canEdit={isAdmin(user)}
      items={items.map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price,
        category: i.category,
        isAvailable: i.isAvailable,
        variants: i.variants.map((v) => ({ name: v.name, price: v.price })),
        timesOrdered: i._count.orderItems,
      }))}
    />
  );
}
