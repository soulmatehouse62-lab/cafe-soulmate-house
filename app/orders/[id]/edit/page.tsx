import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isObjectId } from "@/lib/ids";
import { OrderBuilder } from "@/components/OrderBuilder";

export const dynamic = "force-dynamic";

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!isObjectId(id)) notFound();
  const [order, menu] = await Promise.all([
    prisma.order.findUnique({ where: { id }, include: { items: { orderBy: { itemName: "asc" } } } }),
    prisma.menuItem.findMany({
      where: { isAvailable: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, price: true, category: true, variants: true },
    }),
  ]);
  if (!order) notFound();

  return (
    <OrderBuilder
      menu={menu}
      order={{
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName ?? "",
        customerPhone: order.customerPhone ?? "",
        tableNumber: order.tableNumber ?? "",
        discountType: order.discountType,
        discountValue: order.discountValue,
        amountPaid: order.amountPaid,
        lines: order.items.map((i) => ({
          key: i.id,
          orderItemId: i.id,
          menuItemId: i.menuItemId,
          name: i.itemName,
          variantName: i.variantName,
          unitPrice: i.unitPrice,
          quantity: i.quantity,
        })),
      }}
    />
  );
}
